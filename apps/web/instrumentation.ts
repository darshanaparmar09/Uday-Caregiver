/** Runs once when the server starts. A production server with unsafe settings does not start at all. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") { const { assertSafeConfig } = await import("./lib/env"); assertSafeConfig(); }
}
