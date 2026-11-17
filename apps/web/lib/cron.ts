import { q, withLock } from "./db";

/**
 * Runs one scheduled job on its own: a failure in one job never stops the others, two overlapping schedulers cannot
 * run the same job at once (advisory lock), and every run leaves a heartbeat that the health check and the
 * operations console read. If the heartbeat goes stale, nobody is being alerted about missed check ins: that is
 * why /api/health turns unhealthy and the console shows a red banner.
 */
export async function runJob<T>(job: string, fn: () => Promise<T>): Promise<T | { skipped: true } | { error: string }> {
  const t0 = Date.now();
  try {
    const out = await withLock("cron:" + job, fn);
    if (out === null) return { skipped: true };
    await q(`INSERT INTO cron_runs (job, last_ok_at, runs, last_ms) VALUES ($1, now(), 1, $2) ON CONFLICT (job) DO UPDATE SET last_ok_at=now(), runs=cron_runs.runs+1, last_ms=$2`, [job, Date.now() - t0]);
    return out;
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 400); console.error(`[cron] ${job} failed: ${msg}`);
    await q(`INSERT INTO cron_runs (job, last_error, last_error_at, runs) VALUES ($1,$2, now(), 1) ON CONFLICT (job) DO UPDATE SET last_error=$2, last_error_at=now(), runs=cron_runs.runs+1`, [job, msg]).catch(() => {});
    return { error: msg };
  }
}
/** Jobs that must run every minute, and how old their heartbeat may be before the system counts as unhealthy. */
export const CRITICAL_JOBS = ["alerts", "missed_checkins", "offers", "no_shows"];
export async function cronHealth(maxAgeSec = 300) {
  const rows = await q<any>("SELECT job, last_ok_at, last_error_at, last_error FROM cron_runs");
  const by = Object.fromEntries(rows.map((r) => [r.job, r]));
  const stale = CRITICAL_JOBS.filter((j) => !by[j]?.last_ok_at || Date.now() - new Date(by[j].last_ok_at).getTime() > maxAgeSec * 1000);
  return { ok: stale.length === 0, stale, jobs: rows };
}
/** Personal data is not kept longer than it is needed. Runs with the minute sweep; each statement is cheap. */
export async function sweepRetention() {
  await q("DELETE FROM otp_codes WHERE expires_at < now() - interval '1 day'");
  await q("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'");
  await q("DELETE FROM sessions WHERE expires_at < now() - interval '30 days' OR revoked_at < now() - interval '30 days'");
  await q("DELETE FROM client_ops WHERE created_at < now() - interval '7 days'");
  await q("DELETE FROM companion_messages WHERE created_at < now() - interval '30 days'");
  // Live travel positions are only needed while the caregiver is on the way.
  await q("DELETE FROM booking_locations l USING bookings b WHERE b.id=l.booking_id AND b.status IN ('closed','cancelled','released','completed') AND b.updated_at < now() - interval '1 day'").catch(() => {});
  await q("DELETE FROM notifications WHERE at < now() - interval '180 days'");
  return true;
}
