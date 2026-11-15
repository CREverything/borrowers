import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { demoUsers } from "./users/demoUsers.ts";

const schemaPath = new URL("../db/schema.sql", import.meta.url);
const constraintsPath = new URL("../db/constraints.sql", import.meta.url);

export interface MigrationReport {
  demoProfilesAdded: number;
  placeholderProfilesAdded: number;
}

/**
 * Brings the database up to the current schema without deleting or
 * overwriting data. Every step is idempotent. Call inside a transaction.
 *
 * 1. Tables, new columns and indexes (schema.sql).
 * 2. A users row for every existing lender_id: named profiles for the demo
 *    lenders, and an unnamed placeholder for any other unknown id, so no
 *    listing is reassigned or dropped.
 * 3. The items.lender_id foreign key, now that every row satisfies it.
 */
export async function runMigrations(client: PoolClient): Promise<MigrationReport> {
  await client.query(await readFile(schemaPath, "utf8"));

  // Demo profiles saved with only a first name get their last initial; any
  // other edit is left alone.
  const demo = await client.query(
    `insert into users (clerk_id, display_name)
     select * from unnest($1::text[], $2::text[])
     on conflict (clerk_id) do update set display_name = excluded.display_name
     where users.display_name in ('', split_part(excluded.display_name, ' ', 1))`,
    [demoUsers.map((u) => u.clerkId), demoUsers.map((u) => u.displayName)],
  );

  const placeholders = await client.query(
    `insert into users (clerk_id)
     select distinct i.lender_id from items i
     where not exists (select 1 from users u where u.clerk_id = i.lender_id)
     on conflict (clerk_id) do nothing`,
  );

  await client.query(await readFile(constraintsPath, "utf8"));

  await client.query(await readFile(new URL("../db/messaging.sql", import.meta.url), "utf8"));

  await client.query(await readFile(new URL("../db/direct-messaging.sql", import.meta.url), "utf8"));

  return {
    demoProfilesAdded: demo.rowCount ?? 0,
    placeholderProfilesAdded: placeholders.rowCount ?? 0,
  };
}
