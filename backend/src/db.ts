import pg from "pg";

/**
 * Shared PostgreSQL connection pool for TigerData.
 *
 * TigerData connection strings include `sslmode=require`, so traffic to the
 * database is encrypted. The connection string is never logged.
 */
let pool: pg.Pool | undefined;

export function createPool(connectionString: string): pg.Pool {
  if (pool) return pool;

  pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // An idle client can drop, for example when the service restarts. Log it
  // instead of letting the error crash the process.
  pool.on("error", (error) => {
    console.error("[db] Idle client error:", error.message);
  });

  return pool;
}

export function getPool(): pg.Pool {
  if (!pool) throw new Error("Database pool has not been created yet.");
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

/** Runs `select 1` and reports how long the round trip took. */
export async function pingDatabase(): Promise<{ latencyMs: number }> {
  const started = performance.now();
  await getPool().query("select 1");
  return { latencyMs: Math.round(performance.now() - started) };
}
