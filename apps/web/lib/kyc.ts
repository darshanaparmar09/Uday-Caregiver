import { TEST_MODE } from "./env";
import { cfg } from "./settings";
/**
 * Identity checks through a licensed KYC partner (for example Digio, IDfy or Signzy).
 * The full Aadhaar number is passed to the partner and never stored by Uday: only the result,
 * the partner's reference and the last four digits. Counsel to confirm the Aadhaar route.
 */
export interface KycResult { result: "clear" | "not_clear" | "pending"; reference: string; last4: string; needsOtp?: boolean; provider: string }

/**
 * Three modes, chosen in Operations, Settings, Aadhaar check partner:
 *   not connected : test mode only, always clear
 *   manual        : saved as pending; the Uday team checks the original document and marks it clear
 *   api           : the partner sends an OTP to the Aadhaar linked mobile; the person types it to finish.
 * The api mode posts to the paths entered in Settings. Field names below follow the common pattern of Indian
 * KYC partners and must be matched to your partner's documentation (UNVERIFIED until a real check succeeds).
 */
export async function verifyAadhaar(aadhaar: string, name: string): Promise<KycResult> {
  const n = aadhaar.replace(/\s/g, "");
  if (!/^[2-9]\d{11}$/.test(n)) throw new Error("Enter the 12 digit Aadhaar number");
  const c = await cfg("kyc");
  if (!c) {
    if (!TEST_MODE) throw new Error("Identity checks are not connected yet. Please try again later.");
    return { result: "clear", reference: "MOCKKYC-" + Date.now().toString(36).toUpperCase(), last4: n.slice(-4), provider: "mock" };
  }
  if ((c.provider ?? "manual") === "manual") return { result: "pending", reference: "MANUAL-" + Date.now().toString(36).toUpperCase(), last4: n.slice(-4), provider: "manual" };
  const r = await fetch(c.baseUrl.replace(/\/$/, "") + (c.startPath || "/aadhaar/otp"), { method: "POST", headers: head(c), body: JSON.stringify({ aadhaar_number: n, consent: "Y", reason: "Identity check for Uday care services" }) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message ?? "The identity partner could not start the check. Please try again.");
  const ref = j.request_id ?? j.reference_id ?? j.client_id ?? j.data?.request_id ?? j.data?.client_id ?? j.id;
  if (!ref) throw new Error("The identity partner did not return a request ID. Check the Start path in Settings.");
  return { result: "pending", reference: String(ref), last4: n.slice(-4), needsOtp: true, provider: "api" };
}
/** Second step for the api mode: the OTP sent to the Aadhaar linked mobile. */
export async function verifyAadhaarOtp(reference: string, otp: string, name: string): Promise<KycResult & { nameOnRecord?: string }> {
  if (!/^\d{6}$/.test(otp)) throw new Error("Enter the 6 digit code");
  const c = await cfg("kyc"); if (!c || c.provider !== "api") throw new Error("No code is needed for this check");
  const r = await fetch(c.baseUrl.replace(/\/$/, "") + (c.verifyPath || "/aadhaar/verify"), { method: "POST", headers: head(c), body: JSON.stringify({ request_id: reference, client_id: reference, otp }) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message ?? "The code did not work. Please try again.");
  const d = j.data ?? j; const onRecord: string = d.full_name ?? d.name ?? "";
  return { result: nameMatch(onRecord, name) ? "clear" : "not_clear", reference, last4: String(d.aadhaar_number ?? d.masked_aadhaar ?? "").slice(-4), provider: "api", nameOnRecord: onRecord };
}
const head = (c: Record<string, string>) => ({ "Content-Type": "application/json", "x-client-id": c.clientId ?? "", "x-client-secret": c.clientSecret ?? "", Authorization: c.clientSecret ? `Bearer ${c.clientSecret}` : "" });
/** Loose match: at least one name part of three or more letters in common. The Uday team reviews every not clear result. */
export function nameMatch(a: string, b: string) {
  const parts = (x: string) => new Set(x.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((p) => p.length >= 3));
  const A = parts(a); for (const p of parts(b)) if (A.has(p)) return true; return false;
}

export function validPan(pan: string) { return /^[A-Z]{5}\d{4}[A-Z]$/.test(pan.toUpperCase()); }
