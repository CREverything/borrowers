/** Inspect/apply only the additive messaging schema, using the normal script loader. */
import { randomUUID } from "node:crypto";
import { listConversations } from "../messaging/repository.ts";
import { readFile } from "node:fs/promises";
import { readConfig } from "../config.ts";
import { closePool, createPool } from "../db.ts";

const tables = ["conversations", "messages", "messaging_blocks", "conversation_reports"];
async function main() {
  const pool = createPool(readConfig().databaseUrl);
  const client = await pool.connect();
  try {
    const inspect = async () => {
      const { rows } = await client.query<{ table_name: string; columns: string[] }>(
        `select table_name, array_agg(column_name::text order by ordinal_position) as columns
         from information_schema.columns where table_schema = current_schema()
         and table_name = any($1::text[]) group by table_name order by table_name`, [tables],
      );
      for (const name of tables) {
        const table = rows.find(row => row.table_name === name);
        console.log(`${name}: ${table ? table.columns.join(", ") : "MISSING"}`);
      }
      return rows;
    };
    console.log("Messaging schema before:");
    await inspect();
    if (process.argv.includes("--apply")) {
      // These migrations create schema/indexes and relax a NOT NULL constraint; no existing records are written.
      const sql = await readFile(new URL("../../db/messaging.sql", import.meta.url), "utf8");
      await client.query("begin");
      await client.query("set local lock_timeout = '5s'");
      await client.query("set local statement_timeout = '30s'");
      await client.query("select pg_advisory_xact_lock(hashtextextended('borrowers:messaging:migration', 0))");
      await client.query(sql);
      await client.query(await readFile(new URL("../../db/direct-messaging.sql", import.meta.url), "utf8"));
      await client.query("commit");
      console.log("Additive messaging migration committed. No existing records were changed.");
      console.log("Messaging schema after:");
      await inspect();
    }
    // Exercise the exact inbox SQL without reading any real user's conversations or creating records.
    const present = await client.query("select count(*)::int as n from information_schema.tables where table_schema=current_schema() and table_name=any($1::text[])", [tables]);
    if (present.rows[0].n === tables.length) {
      const inbox = await listConversations(client, `messaging-schema-check:${randomUUID()}`);
      if (inbox.conversations.length !== 0 || inbox.unreadCount !== 0) throw new Error("Unexpected check result");
      console.log("Read-only inbox query verified; no real account data accessed.");
      const indexes = await client.query("select indexname from pg_indexes where schemaname=current_schema() and tablename=any($1::text[]) order by indexname", [tables]);
      console.log("Messaging indexes:", indexes.rows.map(row => row.indexname).join(", "));
    } else {
      console.log("Messaging migration required: npm --prefix backend run db:messaging:migrate");
      process.exitCode = 1;
    }
  } catch (error) {
    await client.query("rollback").catch(() => {});
    // Never print connection details, SQL parameters, environment values or driver messages.
    const code = (error as { code?: string }).code;
    console.error(`Messaging database operation failed${code ? ` (code ${code})` : ""}.`);
    process.exitCode = 1;
  } finally {
    client.release();
    await closePool();
  }
}
main().catch((error: unknown) => {
  const code = (error as { code?: string }).code;
  console.error(`Messaging database connection/configuration failed${code ? ` (code ${code})` : ""}. Check the server setup.`);
  process.exitCode = 1;
});
