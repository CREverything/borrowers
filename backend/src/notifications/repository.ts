import type { Pool, PoolClient } from "pg";

/**
 * In-app notifications. Each one stores the facts as `data` (names, dates,
 * ISO times), and the browser turns them into a sentence in the reader's own
 * time zone.
 */
export type NotificationKind =
  | "message_received" // to the other conversation participant
  | "request_received" // to lender: someone asked to borrow
  | "request_cancelled" // to lender: borrower withdrew
  | "request_approved" // to borrower: approved, with return time
  | "request_declined" // to borrower
  | "return_time_changed" // to borrower
  | "item_returned" // to borrower: lender confirmed it's back; time to review
  | "borrower_rated" // to borrower: lender scored them
  | "review_received" // to lender: borrower reviewed their listing
  | "handed_over" // to the other side: the item changed hands, the loan is active
  | "due_in_72h" // to borrower: deadline within 3 days
  | "due_in_24h" // to borrower: deadline within a day
  | "overdue" // to borrower: deadline passed
  | "loan_overdue" // to lender: their item is late back
  | "return_initiated" // to lender: borrower says it's back; please confirm
  | "extension_requested" // to lender
  | "extension_approved" // to borrower
  | "extension_declined"; // to borrower

export interface Notification {
  id: string;
  kind: NotificationKind;
  role: "borrower" | "lender";
  data: Record<string, unknown>;
  requestId: string | null;
  itemId: number | null;
  read: boolean;
  createdAt: string;
}

export async function notify(
  db: Pool | PoolClient,
  n: {
    userId: string;
    role: "borrower" | "lender";
    kind: NotificationKind;
    data: Record<string, unknown>;
    requestId?: string | null;
    itemId?: number | null;
  },
) {
  await db.query(
    `insert into notifications (user_id, role, kind, data, request_id, item_id)
     values ($1, $2, $3, $4, $5, $6)`,
    [n.userId, n.role, n.kind, JSON.stringify(n.data), n.requestId ?? null, n.itemId ?? null],
  );
}

/** The user's latest notifications, newest first, with the unread count. */
export async function listNotifications(pool: Pool, userId: string) {
  const result = await pool.query<{
    id: string;
    kind: NotificationKind;
    role: "borrower" | "lender";
    data: Record<string, unknown>;
    request_id: string | null;
    item_id: number | null;
    read_at: Date | null;
    created_at: Date;
  }>(
    `select id::text, kind, role, data, request_id::text, item_id, read_at, created_at
     from notifications where user_id = $1
     order by created_at desc, id desc limit 100`,
    [userId],
  );
  const unread = await pool.query<{ n: string }>(
    "select count(*) as n from notifications where user_id = $1 and read_at is null",
    [userId],
  );
  const notifications: Notification[] = result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    role: row.role,
    data: row.data,
    requestId: row.request_id,
    itemId: row.item_id,
    read: row.read_at !== null,
    createdAt: row.created_at.toISOString(),
  }));
  return { notifications, unreadCount: Number(unread.rows[0].n) };
}

/** Marks the user's notifications read: the given ids, or all of them. */
export async function markRead(pool: Pool, userId: string, ids?: string[]) {
  if (ids && ids.length === 0) return;
  await pool.query(
    `update notifications set read_at = now()
     where user_id = $1 and read_at is null and ($2::bigint[] is null or id = any($2::bigint[]))`,
    [userId, ids ?? null],
  );
}
