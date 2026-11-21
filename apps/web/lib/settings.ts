import { z } from "zod";
import { one, q } from "./db";
import { enc, dec } from "./crypto";
import { TEST_MODE } from "./env";
import type { SessionUser } from "./auth";
import { POLICY } from "@uday/core";

/**
 * Admin module settings: connections to outside services and the business details printed on invoices.
 * Keys are typed in the admin screen, encrypted with the "secret" key class and never sent back to the browser
 * in full. A saved and switched on connection wins over the older environment variables, which stay as a fallback.
 */

type Field = { k: string; label: string; secret?: boolean; help?: string; required?: boolean; options?: string[] };
export type Spec = { key: string; group: string; name: string; what: string; fields: Field[]; signup: string };

export const SPECS: Spec[] = [
  { key: "msg91", group: "Messages", name: "MSG91 (SMS in India)", what: "Sign in codes and SMS alerts to Indian numbers. Needs DLT approved templates.", signup: "https://msg91.com",
    fields: [{ k: "authKey", label: "Auth key", secret: true, required: true }, { k: "otpTemplateId", label: "OTP template ID", required: true, help: "Flow template with the variable ##otp##" },
      { k: "alertTemplateId", label: "Alert template ID", help: "Flow template with the variable ##message##" }, { k: "senderId", label: "Sender ID", help: "6 letters, for example UDAYCR" }] },
  { key: "twilio", group: "Messages", name: "Twilio (SMS abroad and WhatsApp)", what: "SMS to families outside India. Can also send WhatsApp if your Twilio number is approved for it.", signup: "https://www.twilio.com",
    fields: [{ k: "accountSid", label: "Account SID", required: true }, { k: "authToken", label: "Auth token", secret: true, required: true },
      { k: "messagingServiceSid", label: "Messaging service SID", required: true }, { k: "whatsappFrom", label: "WhatsApp sender number", help: "For example +14155238886. Leave empty if you use Meta for WhatsApp" },
      { k: "contentSids", label: "WhatsApp template map", help: "One per line: uday_template_name=HXxxxxxxxx (Twilio Content SID)" }] },
  { key: "meta_whatsapp", group: "Messages", name: "Meta WhatsApp Cloud API", what: "WhatsApp alerts to families straight from your Meta Business account.", signup: "https://business.facebook.com",
    fields: [{ k: "phoneNumberId", label: "Phone number ID", required: true }, { k: "accessToken", label: "Permanent access token", secret: true, required: true },
      { k: "businessAccountId", label: "WhatsApp business account ID" }, { k: "language", label: "Template language code", help: "en, en_US, hi or mr, as approved in Meta" }] },
  { key: "routing", group: "Messages", name: "Which service sends what", what: "Choose the SMS and WhatsApp service.", signup: "",
    fields: [{ k: "sms", label: "SMS", options: ["auto", "msg91", "twilio"], help: "auto: Indian numbers by MSG91, others by Twilio" },
      { k: "whatsapp", label: "WhatsApp", options: ["meta", "twilio", "off"] }] },
  { key: "exotel", group: "Calls", name: "Exotel", what: "Masked calls between family and caregiver, and the daily check in call for seniors without a smartphone.", signup: "https://exotel.com",
    fields: [{ k: "sid", label: "Account SID", required: true }, { k: "apiKey", label: "API key", required: true }, { k: "apiToken", label: "API token", secret: true, required: true },
      { k: "callerId", label: "ExoPhone (Uday's calling number)", required: true }, { k: "subdomain", label: "API region", options: ["api.exotel.com", "api.in.exotel.com"], help: "Shown in your Exotel API settings" },
      { k: "checkinAppId", label: "Check in call flow app ID", help: "The Exotel flow that asks: press 1 if well, 2 for help" }] },
  { key: "razorpay", group: "Payments", name: "Razorpay", what: "Card, UPI and net banking payments, holds, refunds, weekly auto pay and caregiver payouts.", signup: "https://dashboard.razorpay.com",
    fields: [{ k: "keyId", label: "Key ID", required: true, help: "Starts rzp_live_ (or rzp_test_ for testing)" }, { k: "keySecret", label: "Key secret", secret: true, required: true },
      { k: "webhookSecret", label: "Webhook secret", secret: true, required: true, help: "Set the webhook URL to https://YOUR_DOMAIN/api/payments/webhook" },
      { k: "razorpayxAccount", label: "RazorpayX account number", help: "For caregiver payouts" }, { k: "mandateMaxRupees", label: "Auto pay limit per charge (₹)", help: "Highest weekly charge a family authorises. Default 50,000" },
      { k: "mandateMethods", label: "Auto pay methods", options: ["upi,card", "upi", "card", "emandate"] }] },
  { key: "kyc", group: "Identity", name: "Aadhaar check partner", what: "Checks the identity of caregivers and, if you choose, of families.", signup: "",
    fields: [{ k: "provider", label: "Partner", options: ["manual", "api"], help: "manual: the Uday team checks documents. api: your partner's Aadhaar API" },
      { k: "baseUrl", label: "Partner API address", help: "From the partner's documentation" }, { k: "clientId", label: "Client ID" }, { k: "clientSecret", label: "Client secret", secret: true },
      { k: "startPath", label: "Start path", help: "For example /aadhaar/otp. Sends the Aadhaar number, returns a request ID" }, { k: "verifyPath", label: "Verify path", help: "For example /aadhaar/verify. Sends the request ID and OTP" }] },
  { key: "video", group: "Video", name: "Video for intro calls", what: "The video link a family and caregiver use to meet before booking.", signup: "https://www.daily.co",
    fields: [{ k: "provider", label: "Service", options: ["jitsi", "daily", "template"], help: "jitsi needs no account. daily needs an API key" },
      { k: "apiKey", label: "Daily API key", secret: true }, { k: "domain", label: "Daily domain", help: "for example uday.daily.co" }, { k: "template", label: "Link template", help: "Any link with {room}, for template only" }] },
  { key: "anthropic", group: "AI", name: "Claude", what: "Companion chat replies, daily family updates, care note checks, sorting spoken requests, reading appointment dates from documents and weekly quality themes. Used only for families who turned on AI help. Without a key, Uday uses fixed rules and written templates.", signup: "https://console.anthropic.com",
    fields: [{ k: "apiKey", label: "API key", secret: true, required: true }, { k: "model", label: "Model", help: "Default claude-haiku-5-5" }] },
  { key: "sarvam", group: "AI", name: "Sarvam AI speech to text", what: "Turns speech into text in Marathi, Hindi, English and other Indian languages: Speak to Uday, the companion's voice and caregiver dictation. Without a key, spoken requests are kept for the Uday team to listen to.", signup: "https://dashboard.sarvam.ai",
    fields: [{ k: "apiKey", label: "API subscription key", secret: true, required: true }, { k: "model", label: "Model", help: "Default saaras:v4" }] },
];
const byKey = new Map(SPECS.map((s) => [s.key, s]));

// Older environment variables, kept as a fallback when nothing is saved in the admin module.
const ENV: Record<string, Record<string, string | undefined>> = {
  msg91: { authKey: process.env.MSG91_AUTH_KEY, otpTemplateId: process.env.MSG91_OTP_TEMPLATE, alertTemplateId: process.env.MSG91_ALERT_TEMPLATE },
  twilio: { accountSid: process.env.TWILIO_ACCOUNT_SID, authToken: process.env.TWILIO_AUTH_TOKEN, messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID },
  meta_whatsapp: { phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID, accessToken: process.env.WHATSAPP_TOKEN },
  routing: { sms: process.env.SMS_PROVIDER, whatsapp: process.env.WHATSAPP_PROVIDER },
  exotel: { sid: process.env.EXOTEL_SID, apiKey: process.env.EXOTEL_API_KEY, apiToken: process.env.EXOTEL_API_TOKEN, callerId: process.env.EXOTEL_CALLER_ID, subdomain: process.env.EXOTEL_HOST, checkinAppId: process.env.EXOTEL_CHECKIN_APP_ID },
  razorpay: { keyId: process.env.RAZORPAY_KEY_ID, keySecret: process.env.RAZORPAY_KEY_SECRET, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET, razorpayxAccount: process.env.RAZORPAYX_ACCOUNT },
  kyc: { provider: process.env.KYC_PROVIDER },
  video: { template: process.env.VIDEO_ROOM_URL_TEMPLATE, provider: process.env.VIDEO_ROOM_URL_TEMPLATE ? "template" : undefined },
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL },
  sarvam: { apiKey: process.env.SARVAM_API_KEY, model: process.env.SARVAM_MODEL },
};

let cache: { at: number; rows: Map<string, { enabled: boolean; config: Record<string, string> }> } | null = null;
async function rows() {
  if (cache && Date.now() - cache.at < 15_000) return cache.rows;
  const m = new Map<string, { enabled: boolean; config: Record<string, string> }>();
  for (const r of await q<any>("SELECT key, enabled, config_enc FROM integrations")) m.set(r.key, { enabled: r.enabled, config: r.config_enc ? JSON.parse(dec(r.config_enc) ?? "{}") : {} });
  cache = { at: Date.now(), rows: m }; return m;
}
export function clearSettingsCache() { cache = null; }

/** The settings a provider adapter should use, or null when the service is not connected. */
export async function cfg(key: string): Promise<Record<string, string> | null> {
  const r = (await rows()).get(key);
  if (r?.enabled) return r.config;
  const e = ENV[key]; if (!e) return null;
  const clean = Object.fromEntries(Object.entries(e).filter(([, v]) => v)) as Record<string, string>;
  const spec = byKey.get(key); const need = spec?.fields.filter((f) => f.required).map((f) => f.k) ?? [];
  return Object.keys(clean).length && need.every((k) => clean[k]) ? clean : null;
}

const mask = (v?: string) => (v ? "••••" + v.slice(-4) : "");
/** For the admin screen: every connection with secrets masked. */
export async function listIntegrations() {
  const saved = new Map((await q<any>("SELECT key, enabled, status, last_test_at, last_error, updated_at, config_enc FROM integrations")).map((r) => [r.key, r]));
  return Promise.all(SPECS.map(async (s) => {
    const r = saved.get(s.key); const conf: Record<string, string> = r?.config_enc ? JSON.parse(dec(r.config_enc) ?? "{}") : {};
    const values = Object.fromEntries(s.fields.map((f) => [f.k, f.secret ? mask(conf[f.k]) : conf[f.k] ?? ""]));
    const fromEnv = !r?.enabled && !!(await cfg(s.key));
    return { ...s, values, enabled: !!r?.enabled, status: r?.status ?? (fromEnv ? "connected" : "not_connected"), fromEnv, lastTestAt: r?.last_test_at ?? null, lastError: r?.last_error ?? null, updatedAt: r?.updated_at ?? null };
  }));
}

export const SaveIn = z.object({ enabled: z.boolean(), values: z.record(z.string().max(4000)) });
export async function saveIntegration(u: SessionUser, key: string, i: z.infer<typeof SaveIn>) {
  const s = byKey.get(key); if (!s) throw Object.assign(new Error("Unknown connection"), { status: 404 });
  const cur = await one<any>("SELECT config_enc FROM integrations WHERE key=$1", [key]);
  const old: Record<string, string> = cur?.config_enc ? JSON.parse(dec(cur.config_enc) ?? "{}") : {};
  const next: Record<string, string> = {};
  for (const f of s.fields) {
    let v = (i.values[f.k] ?? "").trim();
    if (f.secret && (v === "" || v.startsWith("••••"))) v = old[f.k] ?? ""; // blank keeps the saved secret
    if (f.options && v && !f.options.includes(v)) throw Object.assign(new Error(`${f.label}: choose one of ${f.options.join(", ")}`), { status: 422 });
    if (v) next[f.k] = v;
  }
  if (i.enabled) { const miss = s.fields.filter((f) => f.required && !next[f.k]).map((f) => f.label); if (miss.length) throw Object.assign(new Error(`Fill in: ${miss.join(", ")}`), { status: 422 }); }
  await q(`INSERT INTO integrations (key, config_enc, enabled, status, updated_by, updated_at) VALUES ($1,$2,$3,'not_connected',$4,now())
    ON CONFLICT (key) DO UPDATE SET config_enc=$2, enabled=$3, status=CASE WHEN integrations.config_enc IS DISTINCT FROM $2 THEN 'not_connected' ELSE integrations.status END, updated_by=$4, updated_at=now()`,
    [key, enc(JSON.stringify(next), "secret"), i.enabled, u.id]);
  await q("INSERT INTO audit_log (actor_id, action, entity, entity_id, reason) VALUES ($1,'update','integration',$2,$3)", [u.id, key, i.enabled ? "saved and switched on" : "saved, switched off"]);
  clearSettingsCache();
  return (await listIntegrations()).find((x) => x.key === key);
}

/** Checks the saved keys against the provider, with a harmless read only call. Optionally sends a test message to the admin's phone. */
export async function testIntegration(u: SessionUser, key: string, phone?: string) {
  const c = await cfg(key); const s = byKey.get(key);
  if (!s) throw Object.assign(new Error("Unknown connection"), { status: 404 });
  let ok = false, detail = "";
  try {
    if (!c) throw new Error("Not set up yet. Fill in the fields and switch it on.");
    const { probe } = await import("./providers");
    detail = await probe(key, c, phone); ok = true;
  } catch (e: any) { detail = String(e?.message ?? e).slice(0, 300); }
  await q(`INSERT INTO integrations (key, status, last_test_at, last_error, updated_by) VALUES ($1,$2,now(),$3,$4)
    ON CONFLICT (key) DO UPDATE SET status=$2, last_test_at=now(), last_error=$3`, [key, ok ? "connected" : "error", ok ? null : detail, u.id]);
  await q("INSERT INTO audit_log (actor_id, action, entity, entity_id, reason) VALUES ($1,'test','integration',$2,$3)", [u.id, key, ok ? "connected" : "error"]);
  clearSettingsCache();
  return { ok, detail, testMode: TEST_MODE };
}

// ───────── business details for invoices ─────────
export const STATES: Record<string, string> = { "27": "Maharashtra", "29": "Karnataka", "07": "Delhi", "33": "Tamil Nadu", "24": "Gujarat", "36": "Telangana", "06": "Haryana", "09": "Uttar Pradesh", "19": "West Bengal", "32": "Kerala", "08": "Rajasthan", "23": "Madhya Pradesh", "30": "Goa" };
/** Format check of a GSTIN: 2 digit state code, the 10 character PAN, entity number, Z, check character. */
export function gstinProblem(g: string): string | null {
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return "A GSTIN has 15 characters, like 27ABCDE1234F1Z5";
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"; let sum = 0;
  for (let i = 0; i < 14; i++) { const p = chars.indexOf(g[i]) * (i % 2 ? 2 : 1); sum += Math.floor(p / 36) + (p % 36); }
  return chars[(36 - (sum % 36)) % 36] === g[14] ? null : "The last character does not match. Please check the GSTIN";
}
export const BusinessIn = z.object({
  brandName: z.string().min(1).max(80), legalName: z.string().max(160).optional().default(""), gstin: z.string().max(15).optional().default(""),
  address: z.string().max(300).optional().default(""), city: z.string().max(60).optional().default(""), stateCode: z.string().max(2).optional().default("27"), pincode: z.string().max(6).optional().default(""),
  sacCode: z.string().max(8).optional().default("998599"), gstRatePct: z.number().min(0).max(28).optional().default(18), invoicePrefix: z.string().regex(/^[A-Z0-9]{1,8}$/).optional().default("INV"),
  supportPhone: z.string().max(20).optional().default(""), supportEmail: z.string().max(120).optional().default(""), caReviewed: z.boolean().optional().default(false),
});
export async function business() {
  const b = await one<any>("SELECT * FROM business_settings WHERE id=1");
  return { brandName: b.brand_name, legalName: b.legal_name ?? "", gstin: b.gstin ?? "", pan: b.pan ?? "", address: b.address ?? "", city: b.city ?? "", state: b.state ?? "", stateCode: b.state_code ?? "27",
    pincode: b.pincode ?? "", sacCode: b.sac_code ?? "", gstRatePct: b.gst_rate_bps / 100, invoicePrefix: b.invoice_prefix, supportPhone: b.support_phone ?? "", supportEmail: b.support_email ?? "", caReviewed: b.ca_reviewed, updatedAt: b.updated_at, states: STATES };
}
export async function saveBusiness(u: SessionUser, i: z.infer<typeof BusinessIn>) {
  const g = i.gstin.toUpperCase().replace(/\s/g, "");
  if (g) { const p = gstinProblem(g); if (p) throw Object.assign(new Error(p), { status: 422 });
    if (g.slice(0, 2) !== i.stateCode) throw Object.assign(new Error(`The GSTIN starts with ${g.slice(0, 2)}, which is not the state you chose`), { status: 422 }); }
  if (!STATES[i.stateCode]) throw Object.assign(new Error("Choose a state"), { status: 422 });
  await q(`UPDATE business_settings SET brand_name=$1, legal_name=$2, gstin=$3, pan=$4, address=$5, city=$6, state=$7, state_code=$8, pincode=$9, sac_code=$10, gst_rate_bps=$11,
    invoice_prefix=$12, support_phone=$13, support_email=$14, ca_reviewed=$15, updated_by=$16, updated_at=now() WHERE id=1`,
    [i.brandName.trim(), i.legalName.trim() || null, g || null, g ? g.slice(2, 12) : null, i.address.trim() || null, i.city.trim() || null, STATES[i.stateCode], i.stateCode, i.pincode || null,
     i.sacCode.trim() || null, Math.round(i.gstRatePct * 100), i.invoicePrefix, i.supportPhone || null, i.supportEmail || null, i.caReviewed, u.id]);
  await q("INSERT INTO audit_log (actor_id, action, entity, entity_id, reason) VALUES ($1,'update','business','1',$2)", [u.id, g ? "GSTIN set" : "no GSTIN"]);
  return business();
}

/** The fee and booking policy: Operations, Pricing and policy, with the GST rate from the business settings. Falls back to the defaults in code. */
export async function policyNow() {
  const r = await one<any>(`SELECT p.*, b.gst_rate_bps FROM policy_settings p, business_settings b WHERE p.id=1 AND b.id=1`).catch(() => null);
  if (!r) return { ...POLICY, ticketSlaMin: 240, urgentTicketSlaMin: 30, missedCheckinGraceMin: 60 };
  return { ...POLICY, platformFeeBps: r.platform_fee_bps, gstOnPlatformFeeBps: r.gst_rate_bps, freeCancelHours: r.free_cancel_hours, lateCancelBps: r.late_cancel_bps,
    offerWindowSameDayMin: r.offer_same_day_min, offerWindowFutureMin: r.offer_future_min, ticketSlaMin: r.ticket_sla_min, urgentTicketSlaMin: r.urgent_ticket_sla_min, missedCheckinGraceMin: r.missed_checkin_grace_min };
}
/** Standard caregiver rates by tier, in paise: [day, night, live in]. */
export async function tierRates(tier: number): Promise<[number, number, number]> {
  const rows = await q<{ care_type: string; rate_paise: number }>("SELECT care_type, rate_paise FROM tier_rates WHERE tier=$1", [tier]).catch(() => []);
  const m = Object.fromEntries(rows.map((r) => [r.care_type, r.rate_paise]));
  const d = ({ 1: [85000, 105000, 150000], 2: [140000, 160000, 220000], 3: [210000, 240000, 310000] } as Record<number, [number, number, number]>)[tier] ?? [85000, 105000, 150000];
  return [m.day ?? d[0], m.night ?? d[1], m.live ?? d[2]];
}
