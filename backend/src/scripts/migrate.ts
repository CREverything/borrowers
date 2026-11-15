/**
 * Updates the database schema without touching existing listings:
 * `npm run db:migrate`. Safe to run repeatedly.
 */
import { readConfig } from "../config.ts";
import { closePool, createPool } from "../db.ts";
import { runMigrations } from "../migrations.ts";

async function main() {
  const pool = createPool(readConfig().databaseUrl);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const report = await runMigrations(client);
    await client.query("commit");

    const { rows } = await client.query<{ users: string; items: string; active: string }>(
      `select (select count(*) from users) as users,
              (select count(*) from items) as items,
              (select count(*) from items where status = 'active') as active`,
    );
    console.log(
      `Migration complete. Added ${report.demoProfilesAdded} demo and ${report.placeholderProfilesAdded} placeholder profiles.`,
    );
    console.log(`Now: ${rows[0].users} users, ${rows[0].items} items (${rows[0].active} active).`);
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
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
});
