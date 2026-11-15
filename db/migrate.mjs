// Applies db/migrations/*.sql in order, once each. Usage: DATABASE_URL=... node db/migrate.mjs
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const has = (await c.query("SELECT to_regclass('schema_migrations') AS t")).rows[0].t;
const done = has ? new Set((await c.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name)) : new Set();
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(f)) continue;
  await c.query("BEGIN");
  try { await c.query(readFileSync(join(dir, f), "utf8")); await c.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]); await c.query("COMMIT"); console.log("applied", f); }
  catch (e) { await c.query("ROLLBACK"); console.error("failed", f, e.message); process.exit(1); }
}
await c.end();
