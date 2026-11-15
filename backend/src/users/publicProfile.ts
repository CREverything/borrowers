import type { Pool } from "pg";
import type { Item } from "../items/types.ts";
import { listActiveItemsByLender } from "../items/repository.ts";
import { fullName } from "./profiles.ts";

/**
 * What anyone can see about an account: never email, balance or requests.
 * The full name is shown here only; everywhere else uses shortName().
 */
export interface PublicProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
  memberSince: string;
  /** Times this person lent something out: approved or returned requests. */
  itemsLent: number;
  /** Average review across their listings, weighted by how many reviews each has. */
  lenderRating: { average: number; count: number } | null;
  /** Average score lenders gave them as a borrower. */
  borrowerScore: { average: number; count: number } | null;
  listings: Item[];
}

export async function getPublicProfile(pool: Pool, userId: string): Promise<PublicProfile | null> {
  const result = await pool.query<{
    display_name: string;
    avatar_url: string | null;
    created_at: Date;
    items_lent: string;
    lender_avg: string | null;
    lender_count: string;
    borrower_avg: string | null;
    borrower_count: string;
  }>(
    `select u.display_name, u.avatar_url, u.created_at,
            (select count(*) from borrow_requests r
              where r.lender_id = u.clerk_id and r.status in ('approved', 'returned')) as items_lent,
            (select round(sum(i.rating_average * i.rating_count) / nullif(sum(i.rating_count), 0), 1)
              from items i where i.lender_id = u.clerk_id and i.status <> 'removed'
                and i.rating_average is not null) as lender_avg,
            (select coalesce(sum(i.rating_count), 0) from items i
              where i.lender_id = u.clerk_id and i.status <> 'removed'
                and i.rating_average is not null) as lender_count,
            (select round(avg(r.borrower_rating), 1) from borrow_requests r
              where r.borrower_id = u.clerk_id and r.borrower_rating is not null) as borrower_avg,
            (select count(*) from borrow_requests r
              where r.borrower_id = u.clerk_id and r.borrower_rating is not null) as borrower_count
     from users u where u.clerk_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: userId,
    name: fullName(row.display_name),
    avatarUrl: row.avatar_url,
    memberSince: row.created_at.toISOString(),
    itemsLent: Number(row.items_lent),
    lenderRating:
      row.lender_avg !== null && Number(row.lender_count) > 0
        ? { average: Number(row.lender_avg), count: Number(row.lender_count) }
        : null,
    borrowerScore:
      row.borrower_avg !== null
        ? { average: Number(row.borrower_avg), count: Number(row.borrower_count) }
        : null,
    listings: await listActiveItemsByLender(pool, userId),
  };
}
