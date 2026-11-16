import { TEST_MODE } from "./env";
/**
 * Identity checks through a licensed KYC partner (for example Digio, IDfy or Signzy).
 * The full Aadhaar number is passed to the partner and never stored by Uday: only the result,
 * the partner's reference and the last four digits. Counsel to confirm the Aadhaar route.
 */
export interface KycResult { result: "clear" | "not_clear" | "pending"; reference: string; last4: string }

export async function verifyAadhaar(aadhaar: string, name: string): Promise<KycResult> {
  const n = aadhaar.replace(/\s/g, "");
  if (!/^[2-9]\d{11}$/.test(n)) throw new Error("Enter the 12 digit Aadhaar number");
  const provider = process.env.KYC_PROVIDER ?? "mock";
  if (provider === "mock") {
    if (!TEST_MODE) throw new Error("KYC_PROVIDER must be configured in production");
    return { result: "clear", reference: "MOCKKYC-" + Date.now().toString(36).toUpperCase(), last4: n.slice(-4) };
  }
  // Agency: call the partner's Aadhaar offline e-KYC or DigiLocker flow here. Many partners return a
  // redirect for the person to consent; then result arrives by webhook. Return "pending" until it does.
  throw new Error(`KYC provider ${provider} not implemented`);
}

export function validPan(pan: string) { return /^[A-Z]{5}\d{4}[A-Z]$/.test(pan.toUpperCase()); }
