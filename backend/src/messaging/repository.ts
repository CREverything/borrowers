import type { Pool, PoolClient } from "pg";
import { notify } from "../notifications/repository.ts";
import { shortName } from "../users/profiles.ts";

type DB = Pool | PoolClient;
export class MessagingError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const messageId = (v: unknown): v is string =>
  typeof v === "string" && /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n;
export function validContent(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Array.from(value).length > 4000 ||
    value.includes("\0")
  ) {
    throw new MessagingError(400, "Write a message between 1 and 4,000 characters.");
  }
  return value.trim();
}
export async function transaction<T>(pool: Pool, work: (db: PoolClient) => Promise<T>) {
  const db = await pool.connect();
  try {
    await db.query("begin");
    const value = await work(db);
    await db.query("commit");
    return value;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
// Serializes a block with every send for this pair, including across conversations/tabs.
async function pairLock(db: PoolClient, a: string, b: string) {
  await db.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
    JSON.stringify([a, b].sort()),
  ]);
}
export interface Participant {
  id: string;
  borrower_id: string;
  lender_id: string;
}
export async function participant(db: DB, id: string, userId: string): Promise<Participant> {
  if (!uuid(id)) throw new MessagingError(404, "Conversation not found.");
  const { rows } = await db.query<Participant>(
    "select id, borrower_id, lender_id from conversations where id = $1 and $2 in (borrower_id, lender_id)",
    [id, userId],
  );
  if (!rows[0]) throw new MessagingError(404, "Conversation not found.");
  return rows[0];
}
export const otherUser = (c: Participant, userId: string) =>
  c.borrower_id === userId ? c.lender_id : c.borrower_id;
export async function isBlocked(db: DB, a: string, b: string) {
  const { rows } = await db.query(
    `select 1 from messaging_blocks where
    (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1) limit 1`,
    [a, b],
  );
  return rows.length > 0;
}
const CONVERSATION_SELECT = `select (c.original_item_id is null) as "isDirect", c.id, c.item_id as "itemId", c.created_at as "createdAt",
 c.updated_at as "updatedAt", c.updated_at::text as "cursorTime", c.last_message_at as "lastMessageAt",
 case when c.original_item_id is null then null else coalesce(case when i.id is not null then jsonb_build_object('title', i.title, 'iconKey', i.icon_key, 'imageUrl', i.image_url,
 'switchiesPerDay', i.switchies_per_day) end, c.item_snapshot) end as item,
 coalesce(i.status <> 'active', true) as "itemUnavailable",
 u.clerk_id as "otherId", u.display_name as "otherName", u.avatar_url as "otherAvatar",
 exists(select 1 from messaging_blocks b where b.blocker_id = $1 and b.blocked_id = u.clerk_id) as "blockedByMe",
 exists(select 1 from messaging_blocks b where (b.blocker_id = $1 and b.blocked_id = u.clerk_id)
 or (b.blocker_id = u.clerk_id and b.blocked_id = $1)) as blocked,
 (select count(*)::int from messages m where m.conversation_id = c.id and m.sender_id <> $1 and m.read_at is null) as "unreadCount",
 (select jsonb_build_object('content', m.content, 'createdAt', m.created_at, 'senderId', m.sender_id)
 from messages m where m.conversation_id = c.id order by m.id desc limit 1) as "lastMessage"
 from conversations c left join items i on i.id = c.item_id
 join users u on u.clerk_id = case when c.borrower_id = $1 then c.lender_id else c.borrower_id end`;
// Public response intentionally excludes contact details and pickup locations.
function conversationRow(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, otherName: shortName(row.otherName as string) || "A student" };
}
export async function getConversation(db: DB, id: string, userId: string) {
  await participant(db, id, userId);
  const { rows } = await db.query(
    `${CONVERSATION_SELECT} where c.id = $2 and $1 in (c.borrower_id, c.lender_id)`,
    [userId, id],
  );
  return conversationRow(rows[0]);
}
export async function listConversations(db: DB, userId: string, before?: string) {
  let cursor: { updatedAt: string; id: string } | null = null;
  if (before) {
    try {
      cursor = JSON.parse(before);
    } catch {
      /* rejected below */
    }
    if (
      !cursor ||
      !uuid(cursor.id) ||
      typeof cursor.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(cursor.updatedAt))
    )
      throw new MessagingError(400, "Invalid inbox cursor.");
  }
  const { rows } = await db.query(
    `${CONVERSATION_SELECT}
    where $1 in (c.borrower_id, c.lender_id)
    and ($2::timestamptz is null or (c.updated_at, c.id) < ($2::timestamptz, $3::uuid))
    order by c.updated_at desc, c.id desc limit 41`,
    [userId, cursor?.updatedAt ?? null, cursor?.id ?? null],
  );
  const page = rows.slice(0, 40);
  const last = page.at(-1);
  const count = await db.query(
    `select count(*)::int as total from messages m join conversations c on c.id=m.conversation_id
    where $1 in (c.borrower_id,c.lender_id) and m.sender_id<>$1 and m.read_at is null`,
    [userId],
  );
  return {
    conversations: page.map(conversationRow),
    unreadCount: count.rows[0].total,
    nextCursor:
      rows.length > 40 && last ? JSON.stringify({ updatedAt: last.cursorTime, id: last.id }) : null,
  };
}
export async function startConversation(pool: Pool, userId: string, itemId: unknown) {
  if (
    typeof itemId !== "number" ||
    !Number.isSafeInteger(itemId) ||
    itemId <= 0 ||
    itemId > 2147483647
  )
    throw new MessagingError(400, "Choose a listing.");
  const id = await transaction(pool, async (db) => {
    const { rows } = await db.query("select * from items where id=$1 for share", [itemId]);
    const item = rows[0];
    if (!item) throw new MessagingError(404, "Listing unavailable.");
    if (item.lender_id === userId) throw new MessagingError(400, "You can't message yourself.");
    await pairLock(db, userId, item.lender_id);
    const existing = await db.query(
      "select id from conversations where original_item_id=$1 and borrower_id=$2",
      [itemId, userId],
    );
    if (existing.rows[0]) return existing.rows[0].id as string;
    if (item.status !== "active") throw new MessagingError(409, "Listing unavailable.");
    if (await isBlocked(db, userId, item.lender_id))
      throw new MessagingError(403, "Messaging is blocked between these accounts.");
    await limitNewConversation(db, userId);
    const result = await db.query(
      `insert into conversations (item_id,original_item_id,item_snapshot,borrower_id,lender_id)
      values ($1,$1,$2,$3,$4) on conflict (original_item_id,borrower_id) do update set original_item_id=excluded.original_item_id returning id`,
      [
        itemId,
        JSON.stringify({
          title: item.title,
          iconKey: item.icon_key,
          imageUrl: item.image_url,
          switchiesPerDay: item.switchies_per_day,
        }),
        userId,
        item.lender_id,
      ],
    );
    return result.rows[0].id as string;
  });
  return getConversation(pool, id, userId);
}
// Both profile and listing entry points share the same per-account creation limit.
async function limitNewConversation(db: PoolClient, userId: string) {
  await db.query("select pg_advisory_xact_lock(hashtextextended($1, 1))", [userId]);
  const rate = await db.query(
    "select count(*)::int as n from conversations where borrower_id=$1 and created_at > now()-interval '1 minute'",
    [userId],
  );
  if (rate.rows[0].n >= 10)
    throw new MessagingError(429, "Please wait a minute before starting another conversation.");
}
export async function startDirectConversation(pool: Pool, userId: string, recipientId: unknown) {
  if (typeof recipientId !== "string" || !recipientId.trim() || recipientId.length > 256)
    throw new MessagingError(400, "Choose a lender to message.");
  if (recipientId === userId) throw new MessagingError(400, "You can't message yourself.");
  const id = await transaction(pool, async (db) => {
    const recipient = await db.query("select clerk_id from users where clerk_id=$1", [recipientId]);
    if (!recipient.rows[0]) throw new MessagingError(404, "This profile isn't available.");
    await pairLock(db, userId, recipientId);
    const existing = await db.query(
      `select id from conversations where original_item_id is null
      and least(borrower_id,lender_id)=least($1::text,$2::text)
      and greatest(borrower_id,lender_id)=greatest($1::text,$2::text)`,
      [userId, recipientId],
    );
    if (existing.rows[0]) return existing.rows[0].id as string;
    if (await isBlocked(db, userId, recipientId))
      throw new MessagingError(403, "Messaging is blocked between these accounts.");
    await limitNewConversation(db, userId);
    const result = await db.query(
      `insert into conversations (item_snapshot,borrower_id,lender_id)
      values ('{}'::jsonb,$1,$2) returning id`,
      [userId, recipientId],
    );
    return result.rows[0].id as string;
  });
  return getConversation(pool, id, userId);
}
const MESSAGE_SELECT = `select id::text, conversation_id as "conversationId", sender_id as "senderId", client_nonce as "clientNonce", content,
 created_at as "createdAt", read_at as "readAt" from messages`;
export async function history(db: DB, userId: string, id: string, before?: string, after?: string) {
  await participant(db, id, userId);
  if (after && (!messageId(after) || before))
    throw new MessagingError(400, "Invalid message cursor.");
  if (after) {
    const { rows } = await db.query(
      `${MESSAGE_SELECT} where conversation_id=$1 and id>$2 order by messages.id asc limit 41`,
      [id, after],
    );
    return { messages: rows.slice(0, 40), hasMore: rows.length > 40 };
  }
  if (before && !messageId(before)) throw new MessagingError(400, "Invalid message cursor.");
  const { rows } = await db.query(
    `${MESSAGE_SELECT} where conversation_id=$1 and ($2::bigint is null or id<$2) order by messages.id desc limit 41`,
    [id, before ?? null],
  );
  return { messages: rows.slice(0, 40).reverse(), hasMore: rows.length > 40 };
}
export async function sendMessage(
  pool: Pool,
  userId: string,
  id: string,
  input: { content?: unknown; clientNonce?: unknown },
) {
  const content = validContent(input?.content);
  if (!uuid(input?.clientNonce)) throw new MessagingError(400, "Invalid message retry key.");
  return transaction(pool, async (db) => {
    const c = await participant(db, id, userId);
    await pairLock(db, c.borrower_id, c.lender_id);
    await db.query("select id from conversations where id=$1 for update", [id]);
    if (await isBlocked(db, c.borrower_id, c.lender_id))
      throw new MessagingError(403, "Messaging is blocked between these accounts.");
    const existing = await db.query(`${MESSAGE_SELECT} where sender_id=$1 and client_nonce=$2`, [
      userId,
      input.clientNonce,
    ]);
    if (existing.rows[0]) {
      if (existing.rows[0].conversationId !== id || existing.rows[0].content !== content)
        throw new MessagingError(409, "This retry key belongs to another message.");
      return { conversation: c, message: existing.rows[0] };
    }
    await db.query("select pg_advisory_xact_lock(hashtextextended($1, 2))", [userId]);
    const rate = await db.query(
      "select count(*)::int as n from messages where sender_id=$1 and created_at > now()-interval '1 minute'",
      [userId],
    );
    if (rate.rows[0].n >= 30)
      throw new MessagingError(429, "You're sending quickly. Try again in a minute.");
    const inserted = await db.query(
      `insert into messages (conversation_id,sender_id,client_nonce,content) values ($1,$2,$3,$4) on conflict (sender_id,client_nonce) do nothing returning id`,
      [id, userId, input.clientNonce, content],
    );
    if (!inserted.rows[0])
      throw new MessagingError(409, "This retry key belongs to another message.");
    const { rows } = await db.query(`${MESSAGE_SELECT} where id=$1`, [inserted.rows[0].id]);
    await db.query(
      "update conversations set updated_at=clock_timestamp(),last_message_at=$2 where id=$1",
      [id, rows[0].createdAt],
    );
    const context = await db.query(
      `select u.display_name as sender_name, c.item_id,
      case when c.original_item_id is not null then coalesce(i.title,c.item_snapshot->>'title') end as item_title
      from conversations c join users u on u.clerk_id=$2 left join items i on i.id=c.item_id
      where c.id=$1`,
      [id, userId],
    );
    const details = context.rows[0];
    const recipientId = otherUser(c, userId);
    await notify(db, {
      userId: recipientId,
      role: recipientId === c.lender_id ? "lender" : "borrower",
      kind: "message_received",
      itemId: details.item_id,
      data: {
        conversationId: id,
        messageId: rows[0].id,
        senderName: shortName(details.sender_name) || "A student",
        itemTitle: details.item_title,
        preview: Array.from(content).slice(0, 160).join(""),
      },
    });
    return { conversation: c, message: rows[0] };
  });
}
export async function readMessages(pool: Pool, userId: string, id: string, throughId: unknown) {
  const c = await participant(pool, id, userId);
  if (!messageId(throughId)) throw new MessagingError(400, "Invalid last viewed message.");
  return transaction(pool, async (db) => {
    const { rows } = await db.query(
      `update messages set read_at=clock_timestamp()
      where conversation_id=$1 and sender_id<>$2 and read_at is null and id<=$3
      and exists(select 1 from messages where id=$3 and conversation_id=$1) returning read_at`,
      [id, userId, throughId],
    );
    await db.query(
      `update notifications n set read_at=clock_timestamp()
      where n.user_id=$2 and n.kind='message_received' and n.read_at is null
      and n.data->>'conversationId'=$1::text
      and exists(select 1 from messages where id=$3 and conversation_id=$1::uuid)
      and exists(select 1 from messages m where m.conversation_id=$1::uuid and m.id<=$3
        and m.sender_id<>$2 and m.id::text=n.data->>'messageId')`,
      [id, userId, throughId],
    );
    return { conversation: c, readAt: rows.at(-1)?.read_at ?? null };
  });
}
export async function setBlock(pool: Pool, userId: string, id: string, blocked: unknown) {
  if (typeof blocked !== "boolean") throw new MessagingError(400, "Choose block or unblock.");
  return transaction(pool, async (db) => {
    const c = await participant(db, id, userId);
    const other = otherUser(c, userId);
    await pairLock(db, userId, other);
    if (blocked)
      await db.query(
        "insert into messaging_blocks(blocker_id,blocked_id) values($1,$2) on conflict do nothing",
        [userId, other],
      );
    else
      await db.query("delete from messaging_blocks where blocker_id=$1 and blocked_id=$2", [
        userId,
        other,
      ]);
    return c;
  });
}
export async function reportConversation(pool: Pool, userId: string, id: string, reason: unknown) {
  await participant(pool, id, userId);
  if (typeof reason !== "string" || !reason.trim() || reason.length > 1000 || reason.includes("\0"))
    throw new MessagingError(400, "Please give a reason (up to 1,000 characters).");
  await transaction(pool, async (db) => {
    await db.query("select pg_advisory_xact_lock(hashtextextended($1, 3))", [userId]);
    const rate = await db.query(
      "select count(*)::int as n from conversation_reports where reporter_id=$1 and created_at>now()-interval '1 hour'",
      [userId],
    );
    if (rate.rows[0].n >= 5)
      throw new MessagingError(429, "Please wait before submitting another report.");
    await db.query(
      "insert into conversation_reports(conversation_id,reporter_id,reason) values($1,$2,$3)",
      [id, userId, reason.trim()],
    );
  });
}
