/**
 * UDAY_ENV controls test conveniences, separately from NODE_ENV (Next always builds with NODE_ENV=production).
 *   development, staging : fixed OTP (OTP_DEV_CODE), logged SMS, mock payments allowed
 *   production (default when NODE_ENV=production and UDAY_ENV is unset): all of the above refused
 */
export const UDAY_ENV = process.env.UDAY_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development");
export const TEST_MODE = UDAY_ENV === "development" || UDAY_ENV === "staging";
