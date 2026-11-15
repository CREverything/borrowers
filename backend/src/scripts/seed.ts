/**
 * Applies the schema and loads the starter listings: `npm run db:seed`.
 * Safe to run repeatedly. Starter rows with the same id are updated, so
 * re-seeding also refreshes their booked dates relative to today. Listings
 * created by users are never touched, and a starter listing's status is kept.
 */
import { readConfig } from "../config.ts";
import { closePool, createPool } from "../db.ts";
import { seedItems } from "../items/seedData.ts";
import type { DateRange } from "../items/types.ts";
import { runMigrations } from "../migrations.ts";

function localISODate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const toRanges = (days: [number, number][]): DateRange[] =>
  days.map(([from, to]) => ({ start: localISODate(from), end: localISODate(to) }));

async function main() {
  const pool = createPool(readConfig().databaseUrl);
  const client = await pool.connect();

  try {
    await client.query("begin");
    // Also creates the demo lender profiles the starter listings point to.
    await runMigrations(client);

    for (const item of seedItems) {
      await client.query(
        `insert into items (
           id, title, description, category, condition, lender_id, location,
           switchies_per_day, rating_average, rating_count, icon_key, keywords,
           max_borrow_days, booked_ranges
         )
         overriding system value
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         on conflict (id) do update set
           title = excluded.title,
           description = excluded.description,
           category = excluded.category,
           condition = excluded.condition,
           lender_id = excluded.lender_id,
           location = excluded.location,
           switchies_per_day = excluded.switchies_per_day,
           rating_average = excluded.rating_average,
           rating_count = excluded.rating_count,
           icon_key = excluded.icon_key,
           keywords = excluded.keywords,
           max_borrow_days = excluded.max_borrow_days,
           booked_ranges = excluded.booked_ranges,
           updated_at = now()`,
        [
          item.id,
          item.title,
          item.description,
          item.category,
          item.condition,
          item.lenderId,
          item.location,
          item.switchiesPerDay,
          item.rating?.average ?? null,
          item.rating?.count ?? 0,
          item.iconKey,
          item.keywords,
          item.maxBorrowDays,
          JSON.stringify(toRanges(item.bookedDays)),
        ],
      );
    }

    // Explicit ids bypass the identity sequence, so move it past them.
    await client.query(
      `select setval(pg_get_serial_sequence('items', 'id'), (select max(id) from items))`,
    );
    await client.query("commit");

    const { rows } = await client.query<{ count: string }>("select count(*) from items");
    console.log(`Seeded ${seedItems.length} listings. The items table now has ${rows[0].count} rows.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((error: Error) => {
  // Message only. Driver errors can include connection details.
  console.error("Seeding failed:", error.message);
  process.exitCode = 1;
});
