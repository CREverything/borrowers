import type { Pool } from "pg";

/** The logged-in user's lending activity, for the bar under the header. */
export interface ActivitySummary {
  /** Their listings that are live in the marketplace (status 'active'). */
  myListings: number;
  /**
   * Distinct items of theirs that a borrower actually has: approved, handed
   * over, and not marked returned. (Returns the borrower has marked wait in
   * pendingApprovals for the lender to confirm.)
   */
  currentlyLent: number;
  /**
   * Things waiting on them as a lender: new borrow requests, extension
   * requests, and returns to confirm.
   */
  pendingApprovals: number;
}

/** One round trip. */
export async function getActivitySummary(pool: Pool, userId: string): Promise<ActivitySummary> {
  const result = await pool.query<{ listings: string; lent: string; pending: string }>(
    `select
       (select count(*) from items where lender_id = $1 and status = 'active') as listings,
       (select count(distinct item_id) from borrow_requests
         where lender_id = $1 and status = 'approved' and handed_over_at is not null
           and return_requested_at is null) as lent,
       (select count(*) from borrow_requests where lender_id = $1 and status = 'pending')
       + (select count(*) from extension_requests where lender_id = $1 and status = 'pending')
       + (select count(*) from borrow_requests
           where lender_id = $1 and status = 'approved' and return_requested_at is not null) as pending`,
    [userId],
  );
  const row = result.rows[0];
  return {
    myListings: Number(row.listings),
    currentlyLent: Number(row.lent),
    pendingApprovals: Number(row.pending),
  };
}
