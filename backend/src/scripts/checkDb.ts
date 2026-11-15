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

    const table = await pool.query<{ exists: boolean }>(
      "select to_regclass('public.items') is not null as exists",
    );
    if (table.rows[0].exists) {
      const count = await pool.query<{ n: string }>("select count(*) as n from items");
      console.log(`Items table: ${count.rows[0].n} listings`);
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
