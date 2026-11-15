import type { Pool } from "pg";

/** The logged-in user's lending activity, for the bar under the header. */
export interface ActivitySummary {
  /** Their listings that are live in the marketplace (status 'active'). */
  myListings: number;
  /**
   * Distinct items of theirs on a loan that's under way: approved, borrow
   * period started, not yet returned. There's no "handed over" status, so a
   * started approved loan is the closest signal; future bookings are left out.
   */
  currentlyLent: number;
  /** Requests for their items waiting for them to approve or decline. */
  pendingApprovals: number;
}

/**
 * One round trip. `today` is the viewer's local date, so "started" matches
 * the calendar they see; the caller checks it's within a day of the server's.
 */
export async function getActivitySummary(pool: Pool, userId: string, today: string): Promise<ActivitySummary> {
  const result = await pool.query<{ listings: string; lent: string; pending: string }>(
    `select
       (select count(*) from items where lender_id = $1 and status = 'active') as listings,
       (select count(distinct item_id) from borrow_requests
         where lender_id = $1 and status = 'approved' and start_date <= $2::date) as lent,
       (select count(*) from borrow_requests where lender_id = $1 and status = 'pending') as pending`,
    [userId, today],
  );
  const row = result.rows[0];
  return {
    myListings: Number(row.listings),
    currentlyLent: Number(row.lent),
    pendingApprovals: Number(row.pending),
  };
}

const DAY_MS = 86_400_000;

/** The viewer's date if it's a real date within a day of UTC today, else UTC today. */
export function viewerToday(raw: unknown, now = Date.now()): string {
  const utcToday = new Date(now).toISOString().slice(0, 10);
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return utcToday;
  const time = Date.parse(`${raw}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== raw) return utcToday;
  return Math.abs(time - Date.parse(`${utcToday}T00:00:00Z`)) <= DAY_MS ? raw : utcToday;
}
