import pg, { type PoolClient } from "pg";
const { Pool, types } = pg;

// Return DATE columns as plain YYYY-MM-DD strings, never shifted by time zone.
types.setTypeParser(1082, (v: string) => v);

const g = globalThis as unknown as { __udayPool?: pg.Pool };
// Timeouts everywhere: a stuck query or an exhausted pool fails fast with an error instead of hanging every request.
// DATABASE_SSL=require for managed databases (set DATABASE_SSL_CA to the provider's CA certificate to verify it).
const ssl = process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: !!process.env.DATABASE_SSL_CA, ca: process.env.DATABASE_SSL_CA || undefined } : undefined;
export const pool = g.__udayPool ?? new Pool({
  connectionString: process.env.DATABASE_URL, max: Number(process.env.DATABASE_POOL_MAX) || 20, ssl,
  connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000, statement_timeout: 20000, idle_in_transaction_session_timeout: 30000, application_name: "uday-web",
} as pg.PoolConfig);
pool.on("error", (e) => console.error("[db] idle client error", e.message));
if (process.env.NODE_ENV !== "production") g.__udayPool = pool;

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}
export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}

/** Run fn inside a transaction. Rolls back on any error. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** Runs fn while holding a named lock on its own connection. Returns null at once if another process holds it. */
export async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  const c = await pool.connect();
  try {
    const r = await c.query("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", [name]);
    if (!r.rows[0].ok) return null;
    try { return await fn(); } finally { await c.query("SELECT pg_advisory_unlock(hashtext($1))", [name]).catch(() => {}); }
  } finally { c.release(); }
}
