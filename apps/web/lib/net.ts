/** fetch with a hard timeout, so a slow provider can never hang a request or hold a database lock open. */
export async function tfetch(url: string | URL, init: RequestInit = {}, ms = 8000): Promise<Response> {
  try { return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(ms) }); }
  catch (e: any) { if (e?.name === "TimeoutError" || e?.name === "AbortError") throw new Error(`No answer within ${Math.round(ms / 1000)} seconds from ${new URL(String(url)).host}`); throw e; }
}
