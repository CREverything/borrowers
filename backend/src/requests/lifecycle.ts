import type { Pool, PoolClient } from "pg";
import { shortName } from "../users/profiles.ts";
import {
  assertReturnTime,
  getRequest,
  notifyAbout,
  RequestError,
  type BorrowRequest,
} from "./repository.ts";
import { cancelOpenExtension, lateFeeFor } from "./loans.ts";

/**
 * After approval: return times, returns, the lender's score for the
 * borrower, and the borrower's review of the listing.
 */

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

/** Loads and locks a request the lender owns, checking it's in an allowed status. */
async function lockForLender(client: PoolClient, lenderId: string, id: number, allowed: string[]) {
  const found = await client.query<{
    lender_id: string;
    status: string;
    start_date: string;
    end_date: string;
    borrower_rating: number | null;
  }>(
    "select lender_id, status, start_date, end_date, borrower_rating from borrow_requests where id = $1 for update",
    [id],
  );
  const row = found.rows[0];
  if (!row) throw new RequestError(404, "Request not found.");
  if (row.lender_id !== lenderId) throw new RequestError(403, "Only the lender can do that.");
  if (!allowed.includes(row.status)) {
    throw new RequestError(409, `This request is ${row.status}, so that isn't possible.`);
  }
  return row;
}

export interface Score {
  rating: number;
  comment: string;
}

/** Checks a 1-5 rating with an optional comment of 10 to `max` characters. */
export function parseScore(body: unknown, max: number, required: boolean): Score | null {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rating = input.rating;
  if (rating === undefined || rating === null) {
    if (required) throw new RequestError(400, "Choose a rating from 1 to 5 stars.");
    return null;
  }
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new RequestError(400, "Choose a rating from 1 to 5 stars.");
  }
  const comment = typeof input.comment === "string" ? input.comment.trim() : "";
  if (comment && comment.length < 10) throw new RequestError(400, "Comments need at least 10 characters.");
  if (comment.length > max) throw new RequestError(400, `Keep comments under ${max} characters.`);
  return { rating, comment };
}

/** Lender changes when they want an approved item back. */
export async function setReturnTime(pool: Pool, lenderId: string, id: number, returnDueAt: unknown) {
  await inTransaction(pool, async (client) => {
    const row = await lockForLender(client, lenderId, id, ["approved"]);
    assertReturnTime(returnDueAt, row.start_date, row.end_date);
    await client.query("update borrow_requests set return_due_at = $2, updated_at = now() where id = $1", [
      id,
      returnDueAt,
    ]);
    await notifyAbout(client, await getRequest(client, String(id)), "return_time_changed", "borrower");
  });
  return getRequest(pool, String(id));
}

/**
 * Lender confirms the item is back, early or on time, whether or not the
 * borrower marked it returned first. Only the lender can do this, and only
 * once (the row is locked and must still be approved). They can score the
 * borrower now or later. Returned items no longer block the calendar.
 */
export async function markReturned(pool: Pool, lenderId: string, id: number, score: Score | null) {
  await inTransaction(pool, async (client) => {
    await lockForLender(client, lenderId, id, ["approved"]);
    await cancelOpenExtension(client, id);

    // Late fee: an item is overdue until the lender confirms it's back, so the
    // fee counts up to now (this confirmation), and is paid to the lender.
    const loan = (
      await client.query<{
        borrower_id: string;
        return_due_at: Date | null;
        return_requested_at: Date | null;
        now: Date;
      }>(
        "select borrower_id, return_due_at, return_requested_at, now() as now from borrow_requests where id = $1",
        [id],
      )
    ).rows[0];
    const { fee } = lateFeeFor(loan.return_due_at, loan.now);
    let charged = 0;
    if (fee > 0) {
      // Same lock order as approvals; balances can't go below zero, so the fee is capped.
      const balances = await client.query<{ clerk_id: string; switchies_balance: number }>(
        "select clerk_id, switchies_balance from users where clerk_id = any($1) order by clerk_id for update",
        [[loan.borrower_id, lenderId]],
      );
      const have = balances.rows.find((u) => u.clerk_id === loan.borrower_id)?.switchies_balance ?? 0;
      charged = Math.min(fee, have);
      if (charged > 0) {
        await client.query("update users set switchies_balance = switchies_balance - $2 where clerk_id = $1", [
          loan.borrower_id,
          charged,
        ]);
        await client.query("update users set switchies_balance = switchies_balance + $2 where clerk_id = $1", [
          lenderId,
          charged,
        ]);
      }
    }

    await client.query(
      `update borrow_requests
       set status = 'returned', returned_at = now(), updated_at = now(),
           borrower_rating = $2, borrower_rating_comment = $3, late_fee_switchies = $4
       where id = $1`,
      [id, score?.rating ?? null, score?.comment || null, charged],
    );
    const request = await getRequest(client, String(id));
    await notifyAbout(client, request, "item_returned", "borrower", {
      returnedAt: request.returnedAt,
      rating: score?.rating ?? null,
      lateFee: charged,
    });
  });
  return getRequest(pool, String(id));
}

/** Lender scores the borrower after the return, if they skipped it then. Once only. */
export async function rateBorrower(pool: Pool, lenderId: string, id: number, score: Score) {
  await inTransaction(pool, async (client) => {
    const row = await lockForLender(client, lenderId, id, ["returned"]);
    if (row.borrower_rating !== null) throw new RequestError(409, "You've already scored this borrower.");
    await client.query(
      `update borrow_requests set borrower_rating = $2, borrower_rating_comment = $3, updated_at = now()
       where id = $1`,
      [id, score.rating, score.comment || null],
    );
    await notifyAbout(client, await getRequest(client, String(id)), "borrower_rated", "borrower", {
      rating: score.rating,
    });
  });
  return getRequest(pool, String(id));
}

export interface Review {
  id: string;
  rating: number;
  comment: string;
  reviewerId: string;
  reviewerName: string;
  createdAt: string;
}

/**
 * Borrower reviews a listing they've borrowed and returned. One review per
 * borrower per listing (enforced by a unique index too). The listing's star
 * rating is updated in the same transaction.
 */
export async function createReview(pool: Pool, borrowerId: string, itemId: number, score: Score) {
  return inTransaction(pool, async (client): Promise<BorrowRequest> => {
    const returned = await client.query<{ id: string }>(
      `select id::text from borrow_requests
       where item_id = $1 and borrower_id = $2 and status = 'returned'
       order by returned_at desc limit 1`,
      [itemId, borrowerId],
    );
    if (!returned.rowCount) {
      throw new RequestError(403, "You can review a listing once you've borrowed and returned it.");
    }
    const existing = await client.query("select 1 from reviews where item_id = $1 and borrower_id = $2", [
      itemId,
      borrowerId,
    ]);
    if (existing.rowCount) throw new RequestError(409, "You've already reviewed this listing.");

    await client.query(
      "insert into reviews (item_id, borrower_id, request_id, rating, comment) values ($1, $2, $3, $4, $5)",
      [itemId, borrowerId, returned.rows[0].id, score.rating, score.comment],
    );
    // Fold the new rating into the listing's average (which may include ratings from before reviews existed).
    await client.query(
      `update items
       set rating_average = round((coalesce(rating_average, 0) * rating_count + $2) / (rating_count + 1), 1),
           rating_count = rating_count + 1
       where id = $1`,
      [itemId, score.rating],
    );
    const request = await getRequest(client, returned.rows[0].id);
    await notifyAbout(client, request, "review_received", "lender", { rating: score.rating });
    return request;
  });
}

/** Public reviews for a listing, newest first. */
export async function listReviews(pool: Pool, itemId: number): Promise<Review[]> {
  const result = await pool.query<{
    id: string;
    rating: number;
    comment: string;
    borrower_id: string;
    display_name: string | null;
    created_at: Date;
  }>(
    `select v.id::text, v.rating, v.comment, v.borrower_id, u.display_name, v.created_at
     from reviews v left join users u on u.clerk_id = v.borrower_id
     where v.item_id = $1 order by v.created_at desc limit 50`,
    [itemId],
  );
  return result.rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    reviewerId: r.borrower_id,
    reviewerName: shortName(r.display_name),
    createdAt: r.created_at.toISOString(),
  }));
}
