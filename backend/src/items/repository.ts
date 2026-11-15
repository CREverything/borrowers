import type { Pool } from "pg";
import { shortName } from "../users/profiles.ts";
import type { CategoryId, DateRange, Item, ItemCondition, ItemStatus } from "./types.ts";
import type { ListingInput, ListingPatch } from "./validation.ts";

interface ItemRow {
  id: number;
  title: string;
  description: string;
  category: CategoryId;
  condition: ItemCondition;
  lender_id: string;
  lender_name: string | null;
  location: string;
  switchies_per_day: number;
  // pg returns numeric columns as strings to avoid precision loss.
  rating_average: string | null;
  rating_count: number;
  icon_key: string;
  image_url: string | null;
  image_ids: string[];
  keywords: string[];
  max_borrow_days: number;
  booked_ranges: DateRange[];
  status: ItemStatus;
  created_at: Date;
}

/**
 * Item columns plus the lender's display name. booked_ranges combines the
 * legacy fixed bookings with every approved borrow request, so the calendar
 * blocks out dates the item is already lent for.
 */
const SELECT_ITEM = `
  select i.id, i.title, i.description, i.category, i.condition, i.lender_id,
         u.display_name as lender_name, i.location, i.switchies_per_day,
         i.rating_average, i.rating_count, i.icon_key, i.image_url, i.keywords,
         array(select m.id::text from item_images m where m.item_id = i.id order by m.position, m.id) as image_ids,
         i.max_borrow_days,
         i.booked_ranges || coalesce((
           select jsonb_agg(jsonb_build_object('start', r.start_date, 'end', r.end_date)
                            order by r.start_date)
           from borrow_requests r
           where r.item_id = i.id and r.status = 'approved' and r.end_date >= current_date - 1
         ), '[]'::jsonb) as booked_ranges,
         i.status, i.created_at
  from items i
  left join users u on u.clerk_id = i.lender_id
`;

export function toItem(row: ItemRow): Item {
  const item: Item = {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    condition: row.condition,
    lenderId: row.lender_id,
    lenderName: shortName(row.lender_name),
    location: row.location,
    switchiesPerDay: row.switchies_per_day,
    iconKey: row.icon_key,
    // Uploaded photos, cover first. The old image_url column is only a fallback.
    images: row.image_ids.map((imageId) => ({ id: imageId, url: `/api/items/${row.id}/images/${imageId}` })),
    imageUrl: row.image_ids.length ? `/api/items/${row.id}/images/${row.image_ids[0]}` : row.image_url,
    keywords: row.keywords,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    availability: {
      bookedRanges: row.booked_ranges,
      maxBorrowDays: row.max_borrow_days,
    },
  };
  // Items that have never been borrowed have no rating.
  if (row.rating_average !== null && row.rating_count > 0) {
    item.rating = { average: Number(row.rating_average), count: row.rating_count };
  }
  return item;
}

/** Public marketplace: active listings only. */
export async function listActiveItems(pool: Pool): Promise<Item[]> {
  const result = await pool.query<ItemRow>(`${SELECT_ITEM} where i.status = 'active' order by i.id`);
  return result.rows.map(toItem);
}

/** A user's favourites that are still in the marketplace, most recently saved first. */
export async function listFavouriteItems(pool: Pool, userId: string): Promise<Item[]> {
  const result = await pool.query<ItemRow>(
    `${SELECT_ITEM} join favourites f on f.item_id = i.id
     where f.user_id = $1 and i.status = 'active' order by f.created_at desc`,
    [userId],
  );
  return result.rows.map(toItem);
}

/** Someone's active listings, for their public profile. */
export async function listActiveItemsByLender(pool: Pool, lenderId: string): Promise<Item[]> {
  const result = await pool.query<ItemRow>(
    `${SELECT_ITEM} where i.lender_id = $1 and i.status = 'active' order by i.created_at desc, i.id desc`,
    [lenderId],
  );
  return result.rows.map(toItem);
}

/** The owner's own listings, newest first. Removed listings are left out. */
export async function listItemsByLender(pool: Pool, lenderId: string): Promise<Item[]> {
  const result = await pool.query<ItemRow>(
    `${SELECT_ITEM} where i.lender_id = $1 and i.status <> 'removed' order by i.created_at desc, i.id desc`,
    [lenderId],
  );
  return result.rows.map(toItem);
}

export async function getItemById(pool: Pool, id: number): Promise<Item | null> {
  const result = await pool.query<ItemRow>(`${SELECT_ITEM} where i.id = $1`, [id]);
  return result.rows[0] ? toItem(result.rows[0]) : null;
}

/** Inserts a listing owned by `lenderId`, which must come from the verified session. */
export async function createItem(pool: Pool, lenderId: string, input: ListingInput): Promise<Item> {
  const result = await pool.query<{ id: number }>(
    `insert into items (
       title, description, category, condition, lender_id, location,
       switchies_per_day, icon_key, keywords, max_borrow_days
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id`,
    [
      input.title,
      input.description,
      input.category,
      input.condition,
      lenderId,
      input.location,
      input.switchiesPerDay,
      input.iconKey,
      input.keywords,
      input.maxBorrowDays,
    ],
  );
  const item = await getItemById(pool, result.rows[0].id);
  if (!item) throw new Error("Created listing could not be read back.");
  return item;
}

/** Maps API field names to columns. Only these can be changed by an owner. */
const PATCH_COLUMNS: Record<keyof ListingPatch, string> = {
  title: "title",
  description: "description",
  category: "category",
  condition: "condition",
  location: "location",
  switchiesPerDay: "switchies_per_day",
  maxBorrowDays: "max_borrow_days",
  iconKey: "icon_key",
  keywords: "keywords",
  status: "status",
};

export type OwnedResult = { ok: true; item: Item } | { ok: false; reason: "not-found" | "forbidden" };

/** Explains why an owner-scoped update matched no row. */
async function whyNotOwned(pool: Pool, id: number): Promise<OwnedResult> {
  const result = await pool.query<{ status: ItemStatus }>("select status from items where id = $1", [id]);
  const row = result.rows[0];
  return { ok: false, reason: !row || row.status === "removed" ? "not-found" : "forbidden" };
}

/**
 * Updates a listing only if `lenderId` owns it. The ownership check is part
 * of the UPDATE's WHERE clause, so it can't be bypassed or raced.
 */
export async function updateOwnItem(
  pool: Pool,
  lenderId: string,
  id: number,
  patch: ListingPatch,
): Promise<OwnedResult> {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch) as [keyof ListingPatch, unknown][]) {
    if (value === undefined) continue;
    values.push(value);
    sets.push(`${PATCH_COLUMNS[key]} = $${values.length}`);
  }
  values.push(id, lenderId);
  const result = await pool.query(
    `update items set ${[...sets, "updated_at = now()"].join(", ")}
     where id = $${values.length - 1} and lender_id = $${values.length} and status <> 'removed'
     returning id`,
    values,
  );
  if (result.rowCount === 0) return whyNotOwned(pool, id);
  const item = await getItemById(pool, id);
  return item ? { ok: true, item } : { ok: false, reason: "not-found" };
}

/** Soft-deletes a listing the caller owns: it stays in the table with status 'removed'. */
export async function removeOwnItem(pool: Pool, lenderId: string, id: number): Promise<OwnedResult> {
  const result = await pool.query(
    `update items set status = 'removed', updated_at = now()
     where id = $1 and lender_id = $2 and status <> 'removed'
     returning id`,
    [id, lenderId],
  );
  if (result.rowCount === 0) return whyNotOwned(pool, id);
  const item = await getItemById(pool, id);
  return item ? { ok: true, item } : { ok: false, reason: "not-found" };
}
