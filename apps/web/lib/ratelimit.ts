import { headers } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { one } from "./db";
import { AuthError } from "./auth";

/** The caller's IP as the proxy reports it. Hashed before it is stored. */
export function clientIp(): string {
  const h = headers(); return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}
/**
 * Fixed window limiter kept in PostgreSQL, so it holds across server instances.
 * Throws 429 when `max` calls for `key` have already happened inside `windowSec`.
 */
export async function limit(key: string, max: number, windowSec: number, message = "Too many attempts. Please wait and try again.") {
  const k = createHash("sha256").update(key).digest("hex").slice(0, 40);
  const r = await one<{ count: number }>(`INSERT INTO rate_limits (key, count, window_start) VALUES ($1, 1, now())
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN rate_limits.window_start < now() - ($2 || ' seconds')::interval THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - ($2 || ' seconds')::interval THEN now() ELSE rate_limits.window_start END
    RETURNING count`, [k, String(windowSec)]);
  if ((r?.count ?? 0) > max) throw new AuthError(message, 429);
}
/** Constant time comparison for shared secrets (cron, IVR). */
export function sameSecret(given: string | null | undefined, expected: string | undefined) {
  if (!given || !expected) return false;
  const a = createHash("sha256").update(given).digest(), b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
/** True when `key` has already used up `max` inside the window (without counting this call). */
export async function exhausted(key: string, max: number, windowSec: number) {
  const k = createHash("sha256").update(key).digest("hex").slice(0, 40);
  const r = await one<{ count: number }>("SELECT count FROM rate_limits WHERE key=$1 AND window_start >= now() - ($2 || ' seconds')::interval", [k, String(windowSec)]);
  return (r?.count ?? 0) >= max;
}
/**
 * Shift codes (start, end, welcome back): five wrong tries lock that booking's codes for 15 minutes and tell the
 * Uday team, so a code cannot be guessed. Counted outside the booking transaction so a rollback cannot erase it.
 */
export async function checkShiftCode(scope: string, expected: string | null, given: string, onLock: () => Promise<unknown>) {
  const key = "shiftcode:" + scope;
  if (await exhausted(key, 5, 900)) throw new AuthError("Too many wrong codes. Codes are locked for 15 minutes and the Uday team has been told.", 429);
  const a = Buffer.from(String(expected ?? "")), b = Buffer.from(given);
  if (a.length === b.length && a.length > 0 && timingSafeEqual(a, b)) return;
  try { await limit(key, 4, 900); } catch { await onLock().catch(() => {}); throw new AuthError("Too many wrong codes. Codes are locked for 15 minutes and the Uday team has been told.", 429); }
  throw new AuthError("Code does not match. Ask the family to read it again.", 400);
}
