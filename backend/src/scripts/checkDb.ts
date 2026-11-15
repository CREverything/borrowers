/**
 * Connection check for TigerData: `npm run db:check`.
 * Prints the server version and installed extensions, then disconnects.
 */
import { readConfig } from "../config.ts";
import { closePool, createPool } from "../db.ts";

async function main() {
  const pool = createPool(readConfig().databaseUrl);
  try {
    const version = await pool.query<{ version: string }>("select version()");
    console.log("Connected:", version.rows[0].version);

    const extensions = await pool.query<{ extname: string; extversion: string }>(
      "select extname, extversion from pg_extension order by extname",
    );
    console.log("Extensions:");
    for (const { extname, extversion } of extensions.rows) {
      console.log(`  ${extname} ${extversion}`);
    }

    const users = await pool.query<{ exists: boolean }>(
      "select to_regclass('public.users') is not null as exists",
    );
    if (users.rows[0].exists) {
      const n = await pool.query<{ n: string }>("select count(*) as n from users");
      console.log(`Users table: ${n.rows[0].n} profiles`);
      const balance = await pool.query<{ column_default: string | null }>(
        `select column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'users' and column_name = 'switchies_balance'`,
      );
      if (balance.rows[0]) console.log(`  Starting Switchies balance: ${balance.rows[0].column_default}`);
    } else {
      console.log("Users table: missing");
    }

    const table = await pool.query<{ exists: boolean }>(
      "select to_regclass('public.items') is not null as exists",
    );
    if (table.rows[0].exists) {
      const count = await pool.query<{ n: string }>("select count(*) as n from items");
      console.log(`Items table: ${count.rows[0].n} listings`);

      // Consoles often show this planner estimate instead of an exact count.
      // It stays stale on small tables until autovacuum next analyzes them.
      const estimate = await pool.query<{ db: string; schema: string; estimate: string }>(
        `select current_database() as db, n.nspname as schema, c.reltuples::bigint as estimate
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where c.oid = 'public.items'::regclass`,
      );
      const e = estimate.rows[0];
      console.log(`  Database: ${e.db}, table ${e.schema}.items, statistics estimate: ${e.estimate} rows`);

      const columns = await pool.query<{ column_name: string; data_type: string }>(
        `select column_name, data_type from information_schema.columns
         where table_schema = 'public' and table_name = 'items' order by ordinal_position`,
      );
      console.log("  Columns:", columns.rows.map((c) => `${c.column_name} (${c.data_type})`).join(", "));

      const constraints = await pool.query<{ conname: string; def: string }>(
        `select conname, pg_get_constraintdef(oid) as def from pg_constraint
         where conrelid = 'public.items'::regclass order by conname`,
      );
      for (const c of constraints.rows) console.log(`  Constraint ${c.conname}: ${c.def}`);

      const lenders = await pool.query<{ lender_id: string; n: string }>(
        "select lender_id, count(*) as n from items group by lender_id order by lender_id",
      );
      console.log("  Lenders:", lenders.rows.map((l) => `${l.lender_id} (${l.n})`).join(", "));

      // Hash of the original listing columns, to confirm migrations leave data unchanged.
      const fingerprint = await pool.query<{ md5: string }>(
        `select md5(string_agg(row(id, title, description, category, condition, lender_id,
           location, switchies_per_day, rating_average, rating_count, icon_key, keywords,
           max_borrow_days, booked_ranges, created_at, updated_at)::text, '|' order by id)) as md5
         from items`,
      );
      console.log("  Data fingerprint:", fingerprint.rows[0].md5);
    } else {
      console.log("Items table: missing. Run `npm --prefix backend run db:seed` to create and fill it.");
    }
  } finally {
    await closePool();
  }
}

main().catch((error: Error) => {
  // Message only. Driver errors can include connection details.
  console.error("Database check failed:", error.message);
  process.exitCode = 1;
});
