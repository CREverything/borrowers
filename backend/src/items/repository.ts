import type { Pool } from "pg";
import type { CategoryId, DateRange, Item, ItemCondition } from "./types.ts";

interface ItemRow {
  id: number;
  title: string;
  description: string;
  category: CategoryId;
  condition: ItemCondition;
  lender_id: string;
  location: string;
  switchies_per_day: number;
  // pg returns numeric columns as strings to avoid precision loss.
  rating_average: string | null;
  rating_count: number;
  icon_key: string;
  keywords: string[];
  max_borrow_days: number;
  booked_ranges: DateRange[];
}

const ITEM_COLUMNS = `
  id, title, description, category, condition, lender_id, location,
  switchies_per_day, rating_average, rating_count, icon_key, keywords,
  max_borrow_days, booked_ranges
`;

export function toItem(row: ItemRow): Item {
  const item: Item = {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    condition: row.condition,
    lenderId: row.lender_id,
    location: row.location,
    switchiesPerDay: row.switchies_per_day,
    iconKey: row.icon_key,
    keywords: row.keywords,
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

export async function listItems(pool: Pool): Promise<Item[]> {
  const result = await pool.query<ItemRow>(`select ${ITEM_COLUMNS} from items order by id`);
  return result.rows.map(toItem);
}
