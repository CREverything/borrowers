import type { Pool, PoolClient } from "pg";
import { daysInclusive, type BorrowRequestInput, type EventRequestInput } from "./validation.ts";

export type RequestStatus = "pending" | "approved" | "declined" | "cancelled";

/** API shape. Matches BorrowRequest in the frontend's src/types.ts. */
export interface BorrowRequest {
  id: string;
  itemId: number;
  itemTitle: string;
  lenderId: string;
  lenderName: string;
  borrowerId: string;
  borrowerName: string;
  startDate: string;
  endDate: string;
  days: number;
  totalSwitchies: number;
  status: RequestStatus;
  createdAt: string;
  eventRequestId?: string;
}

export interface EventRequest {
  id: string;
  borrowerId: string;
  description: string;
  eventTitle: string;
  startDate: string;
  endDate: string;
  borrowRequestIds: string[];
  totalSwitchies: number;
  status: "pending" | "cancelled";
  createdAt: string;
}

/** A request the server refuses, with the HTTP status to send. */
export class RequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

interface RequestRow {
  id: string;
  item_id: number;
  item_title: string;
  lender_id: string;
  lender_name: string | null;
  borrower_id: string;
  borrower_name: string | null;
  start_date: string;
  end_date: string;
  days: number;
  total_switchies: number;
  status: RequestStatus;
  created_at: Date;
  event_request_id: string | null;
}

const SELECT_REQUEST = `
  select r.id::text, r.item_id, i.title as item_title, r.lender_id, l.display_name as lender_name,
         r.borrower_id, b.display_name as borrower_name, r.start_date, r.end_date, r.days,
         r.total_switchies, r.status, r.created_at, r.event_request_id::text
  from borrow_requests r
  join items i on i.id = r.item_id
  left join users l on l.clerk_id = r.lender_id
  left join users b on b.clerk_id = r.borrower_id
`;

const toRequest = (row: RequestRow): BorrowRequest => ({
  id: row.id,
  itemId: row.item_id,
  itemTitle: row.item_title,
  lenderId: row.lender_id,
  lenderName: row.lender_name ?? "",
  borrowerId: row.borrower_id,
  borrowerName: row.borrower_name ?? "",
  startDate: row.start_date,
  endDate: row.end_date,
  days: row.days,
  totalSwitchies: row.total_switchies,
  status: row.status,
  createdAt: row.created_at.toISOString(),
  ...(row.event_request_id ? { eventRequestId: row.event_request_id } : {}),
});

/** The borrower's own requests, newest first. */
export async function listForBorrower(pool: Pool, borrowerId: string) {
  const requests = await pool.query<RequestRow>(
    `${SELECT_REQUEST} where r.borrower_id = $1 order by r.created_at desc, r.id desc`,
    [borrowerId],
  );
  const events = await pool.query<{
    id: string;
    borrower_id: string;
    event_title: string;
    description: string;
    start_date: string;
    end_date: string;
    status: "pending" | "cancelled";
    created_at: Date;
  }>(
    `select id::text, borrower_id, event_title, description, start_date, end_date, status, created_at
     from event_requests where borrower_id = $1 order by created_at desc, id desc`,
    [borrowerId],
  );

  const borrowRequests = requests.rows.map(toRequest);
  const eventRequests: EventRequest[] = events.rows.map((e) => {
    const children = borrowRequests.filter((r) => r.eventRequestId === e.id);
    return {
      id: e.id,
      borrowerId: e.borrower_id,
      eventTitle: e.event_title,
      description: e.description,
      startDate: e.start_date,
      endDate: e.end_date,
      status: e.status,
      createdAt: e.created_at.toISOString(),
      borrowRequestIds: children.map((r) => r.id),
      totalSwitchies: children.reduce((sum, r) => sum + r.totalSwitchies, 0),
    };
  });
  return { borrowRequests, eventRequests };
}

/** Requests other people have made for the lender's items, newest first. */
export async function listForLender(pool: Pool, lenderId: string): Promise<BorrowRequest[]> {
  const result = await pool.query<RequestRow>(
    `${SELECT_REQUEST} where r.lender_id = $1 order by (r.status = 'pending') desc, r.created_at desc`,
    [lenderId],
  );
  return result.rows.map(toRequest);
}

interface PreparedRequest {
  itemId: number;
  lenderId: string;
  switchiesPerDay: number;
  days: number;
  total: number;
}

/**
 * Checks one item can be requested for these dates and prices it from the
 * database. Locks the item row so its availability can't change mid-transaction.
 */
async function prepare(
  client: PoolClient,
  borrowerId: string,
  itemId: number,
  startDate: string,
  endDate: string,
): Promise<PreparedRequest> {
  const item = await client.query<{
    title: string;
    lender_id: string;
    status: string;
    switchies_per_day: number;
    max_borrow_days: number;
  }>(
    `select title, lender_id, status, switchies_per_day, max_borrow_days
     from items where id = $1 for share`,
    [itemId],
  );
  const row = item.rows[0];
  if (!row || row.status !== "active") throw new RequestError(404, "That item isn't available any more.");
  if (row.lender_id === borrowerId) throw new RequestError(400, "You can't borrow your own item.");

  const days = daysInclusive(startDate, endDate);
  if (days > row.max_borrow_days) {
    throw new RequestError(400, `${row.title} can be borrowed for up to ${row.max_borrow_days} days.`);
  }

  await assertDatesFree(client, itemId, startDate, endDate, row.title);

  const duplicate = await client.query(
    `select 1 from borrow_requests
     where item_id = $1 and borrower_id = $2 and status = 'pending'
       and start_date <= $4 and end_date >= $3`,
    [itemId, borrowerId, startDate, endDate],
  );
  if (duplicate.rowCount) {
    throw new RequestError(409, `You already have a pending request for ${row.title} on those dates.`);
  }

  return {
    itemId,
    lenderId: row.lender_id,
    switchiesPerDay: row.switchies_per_day,
    days,
    total: days * row.switchies_per_day,
  };
}

/** Rejects dates that overlap a fixed booking or an approved request. */
async function assertDatesFree(
  client: PoolClient,
  itemId: number,
  startDate: string,
  endDate: string,
  title: string,
  ignoreRequestId?: string,
) {
  const clash = await client.query(
    `select 1 from items i, jsonb_array_elements(i.booked_ranges) b
     where i.id = $1 and (b->>'start')::date <= $3 and (b->>'end')::date >= $2
     union all
     select 1 from borrow_requests r
     where r.item_id = $1 and r.status = 'approved' and r.start_date <= $3 and r.end_date >= $2
       and ($4::bigint is null or r.id <> $4::bigint)
     limit 1`,
    [itemId, startDate, endDate, ignoreRequestId ?? null],
  );
  if (clash.rowCount) throw new RequestError(409, `${title} is already booked on some of those dates.`);
}

async function assertCanAfford(client: PoolClient, borrowerId: string, total: number) {
  const result = await client.query<{ switchies_balance: number }>(
    "select switchies_balance from users where clerk_id = $1",
    [borrowerId],
  );
  const balance = result.rows[0]?.switchies_balance ?? 0;
  if (total > balance) {
    throw new RequestError(400, `This costs ${total} Switchies but you have ${balance}.`);
  }
}

async function insertRequest(
  client: PoolClient,
  borrowerId: string,
  p: PreparedRequest,
  startDate: string,
  endDate: string,
  eventId: string | null,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into borrow_requests (item_id, borrower_id, lender_id, start_date, end_date, days,
       switchies_per_day, total_switchies, event_request_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id::text`,
    [p.itemId, borrowerId, p.lenderId, startDate, endDate, p.days, p.switchiesPerDay, p.total, eventId],
  );
  return result.rows[0].id;
}

async function getRequest(pool: Pool | PoolClient, id: string): Promise<BorrowRequest> {
  const result = await pool.query<RequestRow>(`${SELECT_REQUEST} where r.id = $1`, [id]);
  return toRequest(result.rows[0]);
}

export async function createBorrowRequest(pool: Pool, borrowerId: string, input: BorrowRequestInput) {
  const id = await inTransaction(pool, async (client) => {
    const prepared = await prepare(client, borrowerId, input.itemId, input.startDate, input.endDate);
    await assertCanAfford(client, borrowerId, prepared.total);
    return insertRequest(client, borrowerId, prepared, input.startDate, input.endDate, null);
  });
  return getRequest(pool, id);
}

/** Creates an event and one request per item, all or nothing. */
export async function createEventRequest(pool: Pool, borrowerId: string, input: EventRequestInput) {
  const eventId = await inTransaction(pool, async (client) => {
    const prepared: PreparedRequest[] = [];
    for (const itemId of input.itemIds) {
      prepared.push(await prepare(client, borrowerId, itemId, input.startDate, input.endDate));
    }
    await assertCanAfford(client, borrowerId, prepared.reduce((sum, p) => sum + p.total, 0));

    const event = await client.query<{ id: string }>(
      `insert into event_requests (borrower_id, event_title, description, start_date, end_date)
       values ($1, $2, $3, $4, $5) returning id::text`,
      [borrowerId, input.eventTitle, input.description, input.startDate, input.endDate],
    );
    for (const p of prepared) {
      await insertRequest(client, borrowerId, p, input.startDate, input.endDate, event.rows[0].id);
    }
    return event.rows[0].id;
  });
  const { eventRequests } = await listForBorrower(pool, borrowerId);
  return eventRequests.find((e) => e.id === eventId)!;
}

/** Borrower cancels their own pending request. */
export async function cancelRequest(pool: Pool, borrowerId: string, id: number): Promise<BorrowRequest> {
  const result = await pool.query<{ id: string }>(
    `update borrow_requests set status = 'cancelled', updated_at = now()
     where id = $1 and borrower_id = $2 and status = 'pending' returning id::text`,
    [id, borrowerId],
  );
  if (!result.rowCount) await explainMiss(pool, id, "borrower_id", borrowerId);
  return getRequest(pool, String(id));
}

/** Borrower cancels an event request and every item request in it that's still pending. */
export async function cancelEventRequest(pool: Pool, borrowerId: string, id: number) {
  await inTransaction(pool, async (client) => {
    const result = await client.query(
      `update event_requests set status = 'cancelled', updated_at = now()
       where id = $1 and borrower_id = $2 and status = 'pending'`,
      [id, borrowerId],
    );
    if (!result.rowCount) {
      const owner = await client.query<{ borrower_id: string }>(
        "select borrower_id from event_requests where id = $1",
        [id],
      );
      const row = owner.rows[0];
      if (!row) throw new RequestError(404, "Request not found.");
      if (row.borrower_id !== borrowerId) throw new RequestError(403, "You can only cancel your own requests.");
      throw new RequestError(409, "This event request was already cancelled.");
    }
    await client.query(
      `update borrow_requests set status = 'cancelled', updated_at = now()
       where event_request_id = $1 and status = 'pending'`,
      [id],
    );
  });
}

async function explainMiss(pool: Pool | PoolClient, id: number, ownerColumn: string, userId: string): Promise<never> {
  const row = (
    await pool.query<{ owner: string; status: string }>(
      `select ${ownerColumn} as owner, status from borrow_requests where id = $1`,
      [id],
    )
  ).rows[0];
  if (!row) throw new RequestError(404, "Request not found.");
  if (row.owner !== userId) throw new RequestError(403, "That request isn't yours to change.");
  throw new RequestError(409, `This request is already ${row.status}.`);
}

/**
 * Lender approves or declines a pending request for one of their items.
 * Approval re-checks the dates, then moves the Switchies from borrower to
 * lender in the same transaction. Item and user rows are locked so two
 * approvals can't double-book an item or overspend a balance.
 */
export async function decideRequest(
  pool: Pool,
  lenderId: string,
  id: number,
  decision: "approve" | "decline",
): Promise<BorrowRequest> {
  await inTransaction(pool, async (client) => {
    const found = await client.query<{
      item_id: number;
      lender_id: string;
      borrower_id: string;
      start_date: string;
      end_date: string;
      total_switchies: number;
      status: string;
    }>(
      `select item_id, lender_id, borrower_id, start_date, end_date, total_switchies, status
       from borrow_requests where id = $1 for update`,
      [id],
    );
    const request = found.rows[0];
    if (!request) throw new RequestError(404, "Request not found.");
    if (request.lender_id !== lenderId) throw new RequestError(403, "Only the lender can respond to this request.");
    if (request.status !== "pending") throw new RequestError(409, `This request is already ${request.status}.`);

    if (decision === "decline") {
      await client.query("update borrow_requests set status = 'declined', updated_at = now() where id = $1", [id]);
      return;
    }

    // Serialise approvals for the same item.
    const item = await client.query<{ title: string }>("select title from items where id = $1 for update", [
      request.item_id,
    ]);
    await assertDatesFree(client, request.item_id, request.start_date, request.end_date, item.rows[0].title, String(id));

    // Lock both balances in a fixed order to avoid deadlocks.
    const balances = await client.query<{ clerk_id: string; switchies_balance: number }>(
      `select clerk_id, switchies_balance from users where clerk_id = any($1) order by clerk_id for update`,
      [[request.borrower_id, request.lender_id]],
    );
    const borrower = balances.rows.find((u) => u.clerk_id === request.borrower_id);
    if (!borrower || borrower.switchies_balance < request.total_switchies) {
      throw new RequestError(409, "The borrower doesn't have enough Switchies for this request any more.");
    }
    await client.query("update users set switchies_balance = switchies_balance - $2 where clerk_id = $1", [
      request.borrower_id,
      request.total_switchies,
    ]);
    await client.query("update users set switchies_balance = switchies_balance + $2 where clerk_id = $1", [
      request.lender_id,
      request.total_switchies,
    ]);
    await client.query("update borrow_requests set status = 'approved', updated_at = now() where id = $1", [id]);
  });
  return getRequest(pool, String(id));
}

export async function getAccount(pool: Pool, userId: string) {
  const result = await pool.query<{ display_name: string; switchies_balance: number }>(
    "select display_name, switchies_balance from users where clerk_id = $1",
    [userId],
  );
  const row = result.rows[0];
  return { userId, displayName: row?.display_name ?? "", switchiesBalance: row?.switchies_balance ?? 0 };
}
