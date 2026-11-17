/**
 * UDAY_ENV controls test conveniences, separately from NODE_ENV (Next always builds with NODE_ENV=production).
 *   development : fixed OTP (OTP_DEV_CODE), logged SMS, mock payments, cron shortcuts. Never reachable from the internet.
 *   staging     : logged SMS and mock payments allowed, but NO fixed OTP. Testers sign in with OTP_TEST_ACCOUNTS only.
 *   production  : (default when NODE_ENV=production and UDAY_ENV is unset) every test convenience refused.
 */
export const UDAY_ENV = process.env.UDAY_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development");
export const TEST_MODE = UDAY_ENV === "development" || UDAY_ENV === "staging";
export const DEV_ONLY = UDAY_ENV === "development";

/**
 * Named test and store review accounts: OTP_TEST_ACCOUNTS="+919999900001:482913,+919999900002:771204".
 * Each listed number signs in with its own fixed code, in any environment, so Apple and Google reviewers and
 * staging testers can get in without an SMS. An operations account can never be a test account.
 */
export function testAccountCode(e164: string): string | null {
  for (const pair of (process.env.OTP_TEST_ACCOUNTS ?? "").split(",")) { const [p, c] = pair.trim().split(":"); if (p === e164 && /^\d{6}$/.test(c ?? "")) return c; }
  return null;
}

/** Refuses to start a production server with unsafe settings. Called from instrumentation.ts. */
export function assertSafeConfig() {
  const bad: string[] = [];
  const need = (k: string, min = 1) => { if ((process.env[k] ?? "").length < min) bad.push(`${k} is missing${min > 1 ? ` or shorter than ${min} characters` : ""}`); };
  if (UDAY_ENV !== "development" && process.env.OTP_DEV_CODE) bad.push("OTP_DEV_CODE must not be set outside development");
  if (UDAY_ENV === "production") {
    need("SESSION_SECRET", 32); need("FIELD_KEY_PII"); need("FIELD_KEY_HEALTH"); need("FIELD_KEY_SECRET"); need("LOOKUP_KEY"); need("CRON_SECRET", 24); need("DATABASE_URL");
    if ((process.env.SITE_URL ?? "").startsWith("http://")) bad.push("SITE_URL must be https in production");
    if (process.env.NOTIFY_LOG === "1") bad.push("NOTIFY_LOG must be off in production (it prints personal data)");
  }
  if (bad.length) throw new Error("Unsafe configuration, refusing to start:\n - " + bad.join("\n - "));
}
