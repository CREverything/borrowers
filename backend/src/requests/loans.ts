import type { Pool, PoolClient } from "pg";
import {
  assertDatesFree,
  assertReturnTime,
  getRequest,
  inTransaction,
  listLoansNear,
  notificationData,
  notifyAbout,
  RequestError,
  type BorrowRequest,
} from "./repository.ts";
import { daysInclusive } from "./validation.ts";

/**
 * Loans after approval: the handover, the borrower's side of a return, extension
 * requests, and deadline reminders. Every action checks, inside a transaction
 * with the loan row locked, that the session user is the right party and the
 * loan is in the right stage, so a repeated click can't apply twice.
 */

interface LoanRow {
  item_id: number;
  borrower_id: string;
  lender_id: string;
  status: string;
  start_date: string;
  end_date: string;
  return_due_at: Date | null;
  handed_over_at: Date | null;
  return_requested_at: Date | null;
  switchies_per_day: number;
  total_switchies: number;
}

async function lockLoan(client: PoolClient, id: number): Promise<LoanRow> {
  const found = await client.query<LoanRow>(
    `select item_id, borrower_id, lender_id, status, start_date, end_date, return_due_at,
            handed_over_at, return_requested_at, switchies_per_day, total_switchies
     from borrow_requests where id = $1 for update`,
    [id],
  );
  const row = found.rows[0];
  if (!row) throw new RequestError(404, "Request not found.");
  return row;
}

/**
 * Either side records that the item changed hands, which makes the loan
 * active. Only once, and only for an approved loan.
 */
export async function markHandedOver(pool: Pool, userId: string, id: number): Promise<BorrowRequest> {
  await inTransaction(pool, async (client) => {
    const loan = await lockLoan(client, id);
    const role = loan.borrower_id === userId ? "borrower" : loan.lender_id === userId ? "lender" : null;
    if (!role) throw new RequestError(403, "That request isn't yours to change.");
    if (loan.status !== "approved") throw new RequestError(409, `This request is ${loan.status}.`);
    if (loan.handed_over_at) throw new RequestError(409, "This item is already marked as handed over.");
    await client.query("update borrow_requests set handed_over_at = now(), updated_at = now() where id = $1", [id]);
    await notifyAbout(
      client,
      await getRequest(client, String(id)),
      "handed_over",
      role === "borrower" ? "lender" : "borrower",
    );
  });
  return getRequest(pool, String(id));
}

/**
 * Borrower says they've handed the item back. The loan waits for the lender
 * to confirm; it isn't returned yet. Any open extension request is withdrawn.
 */
export async function initiateReturn(pool: Pool, borrowerId: string, id: number): Promise<BorrowRequest> {
  await inTransaction(pool, async (client) => {
    const loan = await lockLoan(client, id);
    if (loan.borrower_id !== borrowerId) throw new RequestError(403, "Only the borrower can do that.");
    if (loan.status !== "approved" || !loan.handed_over_at) {
      throw new RequestError(409, "You can return an item once you've received it.");
    }
    if (loan.return_requested_at) throw new RequestError(409, "You've already marked this as returned.");
    await client.query(
      "update borrow_requests set return_requested_at = now(), updated_at = now() where id = $1",
      [id],
    );
    await cancelOpenExtension(client, id);
    await notifyAbout(client, await getRequest(client, String(id)), "return_initiated", "lender");
  });
  return getRequest(pool, String(id));
}

/** Withdraws a loan's open extension request, e.g. once it's being returned. */
export async function cancelOpenExtension(client: PoolClient, requestId: number) {
  await client.query(
    `update extension_requests set status = 'cancelled', decided_at = now()
     where request_id = $1 and status = 'pending'`,
    [requestId],
  );
}

const DAY_MS = 86_400_000;
const MAX_AHEAD_MS = 180 * DAY_MS;

export interface ExtensionInput {
  requestedDueAt: string;
  /** The borrower's local calendar date of the new deadline. */
  newEndDate: string;
}

export function parseExtension(body: unknown): ExtensionInput {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const due = input.requestedDueAt;
  const end = input.newEndDate;
  if (typeof due !== "string" || Number.isNaN(Date.parse(due))) {
    throw new RequestError(400, "Choose the new return time you'd like.");
  }
  if (typeof end !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(end) || Number.isNaN(Date.parse(`${end}T00:00:00Z`))) {
    throw new RequestError(400, "Choose the new return time you'd like.");
  }
  return { requestedDueAt: new Date(due).toISOString(), newEndDate: end };
}

/**
 * Price and check an extension. Loans are priced per calendar day, so the
 * extra cost is the extra days past the current end date (extending to a
 * later time on the same day is free).
 */
export function priceExtension(
  loan: { start_date: string; end_date: string; return_due_at: Date | null; switchies_per_day: number },
  input: ExtensionInput,
  maxBorrowDays: number,
  now = Date.now(),
) {
  const requested = Date.parse(input.requestedDueAt);
  const current = loan.return_due_at?.getTime();
  if (current === undefined) throw new RequestError(409, "This loan has no return time to extend.");
  if (requested <= current) throw new RequestError(400, "Pick a time after the current return deadline.");
  if (requested <= now) throw new RequestError(400, "Pick a time that hasn't passed yet.");
  if (requested > now + MAX_AHEAD_MS) throw new RequestError(400, "Pick a time within the next six months.");

  // The calendar date must match the requested moment, give or take a time zone.
  const utcDate = Date.parse(`${new Date(requested).toISOString().slice(0, 10)}T00:00:00Z`);
  if (Math.abs(Date.parse(`${input.newEndDate}T00:00:00Z`) - utcDate) > DAY_MS) {
    throw new RequestError(400, "The new date and time don't match.");
  }
  const newEndDate = input.newEndDate < loan.end_date ? loan.end_date : input.newEndDate;
  assertReturnTime(input.requestedDueAt, loan.start_date, newEndDate);

  const totalDays = daysInclusive(loan.start_date, newEndDate);
  if (totalDays > maxBorrowDays) {
    throw new RequestError(400, `This item can be borrowed for up to ${maxBorrowDays} days in total.`);
  }
  const extraDays = daysInclusive(loan.end_date, newEndDate) - 1;
  return {
    newEndDate,
    extraDays,
    totalDays,
    extraSwitchies: extraDays * loan.switchies_per_day,
    /** The first extra day, for the availability check. */
    firstExtraDate: new Date(Date.parse(`${loan.end_date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10),
  };
}

async function itemFor(client: PoolClient, itemId: number) {
  const item = await client.query<{ title: string; max_borrow_days: number }>(
    "select title, max_borrow_days from items where id = $1 for update",
    [itemId],
  );
  return item.rows[0];
}

/** Borrower asks for more time. Checked now and again when the lender decides. */
export async function requestExtension(
  pool: Pool,
  borrowerId: string,
  id: number,
  input: ExtensionInput,
): Promise<BorrowRequest> {
  await inTransaction(pool, async (client) => {
    const loan = await lockLoan(client, id);
    if (loan.borrower_id !== borrowerId) throw new RequestError(403, "Only the borrower can ask for more time.");
    if (loan.status !== "approved" || !loan.handed_over_at || loan.return_requested_at) {
      throw new RequestError(409, "You can ask for more time while you have the item.");
    }
    const open = await client.query("select 1 from extension_requests where request_id = $1 and status = 'pending'", [
      id,
    ]);
    if (open.rowCount) throw new RequestError(409, "You already have an extension request waiting.");

    const item = await itemFor(client, loan.item_id);
    const price = priceExtension(loan, input, item.max_borrow_days);
    if (price.extraDays > 0) {
      await assertDatesFree(client, loan.item_id, price.firstExtraDate, price.newEndDate, item.title, String(id));
    }
    const balance = await client.query<{ switchies_balance: number }>(
      "select switchies_balance from users where clerk_id = $1",
      [borrowerId],
    );
    const have = balance.rows[0]?.switchies_balance ?? 0;
    if (price.extraSwitchies > have) {
      throw new RequestError(400, `This costs ${price.extraSwitchies} more Switchies but you have ${have}.`);
    }

    await client.query(
      `insert into extension_requests (request_id, borrower_id, lender_id, current_due_at, requested_due_at,
         new_end_date, extra_days, extra_switchies)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        borrowerId,
        loan.lender_id,
        loan.return_due_at,
        input.requestedDueAt,
        price.newEndDate,
        price.extraDays,
        price.extraSwitchies,
      ],
    );
    await notifyAbout(client, await getRequest(client, String(id)), "extension_requested", "lender", {
      requestedDueAt: input.requestedDueAt,
      extraSwitchies: price.extraSwitchies,
    });
  });
  return getRequest(pool, String(id));
}

/**
 * Lender accepts or rejects an extension. Approval re-checks availability and
 * the borrower's balance, then moves the deadline, end date, price and
 * Switchies together. Rejection leaves the loan exactly as it was.
 */
export async function decideExtension(
  pool: Pool,
  lenderId: string,
  extensionId: number,
  decision: "approve" | "decline",
): Promise<BorrowRequest> {
  const requestId = await inTransaction(pool, async (client) => {
    const ext = await client.query<{
      request_id: string;
      lender_id: string;
      status: string;
      requested_due_at: Date;
      new_end_date: string;
    }>(
      `select request_id::text, lender_id, status, requested_due_at, new_end_date
       from extension_requests where id = $1`,
      [extensionId],
    );
    const row = ext.rows[0];
    if (!row) throw new RequestError(404, "Extension request not found.");
    if (row.lender_id !== lenderId) throw new RequestError(403, "Only the lender can respond to this.");

    // Same lock order as approvals: the loan, then the item, then balances.
    const loan = await lockLoan(client, Number(row.request_id));
    const locked = await client.query<{ status: string }>(
      "select status from extension_requests where id = $1 for update",
      [extensionId],
    );
    if (locked.rows[0].status !== "pending") {
      throw new RequestError(409, `This extension request is already ${locked.rows[0].status}.`);
    }

    if (decision === "decline") {
      await client.query("update extension_requests set status = 'declined', decided_at = now() where id = $1", [
        extensionId,
      ]);
      await notifyAbout(client, await getRequest(client, row.request_id), "extension_declined", "borrower", {
        requestedDueAt: row.requested_due_at.toISOString(),
      });
      return row.request_id;
    }

    if (loan.status !== "approved" || !loan.handed_over_at || loan.return_requested_at) {
      throw new RequestError(409, "This loan is no longer active, so it can't be extended.");
    }
    const item = await itemFor(client, loan.item_id);
    // Re-price against the loan as it is now, in case its return time changed meanwhile.
    const price = priceExtension(
      loan,
      { requestedDueAt: row.requested_due_at.toISOString(), newEndDate: row.new_end_date },
      item.max_borrow_days,
    );
    if (price.extraDays > 0) {
      await assertDatesFree(client, loan.item_id, price.firstExtraDate, price.newEndDate, item.title, row.request_id);
    }

    const balances = await client.query<{ clerk_id: string; switchies_balance: number }>(
      "select clerk_id, switchies_balance from users where clerk_id = any($1) order by clerk_id for update",
      [[loan.borrower_id, loan.lender_id]],
    );
    const borrower = balances.rows.find((u) => u.clerk_id === loan.borrower_id);
    if (!borrower || borrower.switchies_balance < price.extraSwitchies) {
      throw new RequestError(409, "The borrower doesn't have enough Switchies for this extension any more.");
    }
    if (price.extraSwitchies > 0) {
      await client.query("update users set switchies_balance = switchies_balance - $2 where clerk_id = $1", [
        loan.borrower_id,
        price.extraSwitchies,
      ]);
      await client.query("update users set switchies_balance = switchies_balance + $2 where clerk_id = $1", [
        loan.lender_id,
        price.extraSwitchies,
      ]);
    }
    await client.query(
      `update borrow_requests
       set end_date = $2, days = $3, total_switchies = total_switchies + $4, return_due_at = $5, updated_at = now()
       where id = $1`,
      [row.request_id, price.newEndDate, price.totalDays, price.extraSwitchies, row.requested_due_at],
    );
    await client.query(
      `update extension_requests set status = 'approved', decided_at = now(), extra_days = $2, extra_switchies = $3
       where id = $1`,
      [extensionId, price.extraDays, price.extraSwitchies],
    );
    await notifyAbout(client, await getRequest(client, row.request_id), "extension_approved", "borrower", {
      extraSwitchies: price.extraSwitchies,
    });
    return row.request_id;
  });
  return getRequest(pool, requestId);
}

const HOUR_MS = 3_600_000;

/** Switchies charged for each full hour an item comes back late. */
export const LATE_FEE_PER_HOUR = 5;

/**
 * The late fee for a return: 5 Switchies per full hour between the deadline
 * and when it came back. Under an hour late is free.
 */
export function lateFeeFor(dueAt: Date | string | null, returnedAt: Date | string) {
  const due = dueAt === null ? NaN : new Date(dueAt).getTime();
  const back = new Date(returnedAt).getTime();
  if (Number.isNaN(due) || Number.isNaN(back) || back <= due) return { hoursLate: 0, fee: 0 };
  const hoursLate = Math.floor((back - due) / HOUR_MS);
  return { hoursLate, fee: hoursLate * LATE_FEE_PER_HOUR };
}

/** Which reminder a borrower should have for a deadline, if any. */
export function borrowerReminder(dueAt: string, now = Date.now()) {
  const left = Date.parse(dueAt) - now;
  if (Number.isNaN(left)) return null;
  if (left <= 0) return "overdue" as const;
  if (left <= 24 * HOUR_MS) return "due_in_24h" as const;
  if (left <= 72 * HOUR_MS) return "due_in_72h" as const;
  return null;
}

/**
 * Sends any deadline reminders this user is owed: one notice per loan,
 * the most urgent that applies, never repeated for the same deadline (a
 * unique index enforces that, even under concurrent calls). There's no
 * scheduler, so this runs whenever the user's notifications are fetched.
 */
export async function reconcileDeadlineReminders(pool: Pool, userId: string) {
  const loans = await listLoansNear(pool, userId, 72 * HOUR_MS);
  for (const loan of loans) {
    if (!loan.returnDueAt) continue;
    const sends: { to: "borrower" | "lender"; kind: string }[] = [];
    if (loan.borrowerId === userId) {
      const kind = borrowerReminder(loan.returnDueAt);
      if (kind) sends.push({ to: "borrower", kind });
    }
    if (loan.lenderId === userId && Date.parse(loan.returnDueAt) <= Date.now()) {
      sends.push({ to: "lender", kind: "loan_overdue" });
    }
    for (const send of sends) {
      await pool.query(
        `insert into notifications (user_id, role, kind, data, request_id, item_id)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (user_id, request_id, kind, (data->>'returnDueAt'))
           where kind in ('due_in_72h', 'due_in_24h', 'overdue', 'loan_overdue')
         do nothing`,
        [userId, send.to, send.kind, JSON.stringify(notificationData(loan)), loan.id, loan.itemId],
      );
    }
  }
}
