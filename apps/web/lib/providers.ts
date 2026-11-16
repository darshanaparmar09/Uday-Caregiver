import { TEST_MODE } from "./env";

/**
 * Outside services, one adapter each. In development and staging they log instead of sending.
 * In production each must be configured, or the call fails loudly instead of silently doing nothing.
 * Endpoints follow each provider's public API at the time of writing; the agency must confirm them
 * against current documentation and their account settings before launch.
 */
function off(name: string, env: string) {
  if (!TEST_MODE) throw new Error(`${env} must be configured in production (${name})`);
}
const digits = (e164: string) => e164.replace(/\D/g, "");

// ───────── SMS (OTP and plain alerts) ─────────
export async function sendSms(e164: string, text: string, opts: { otp?: string } = {}) {
  const p = process.env.SMS_PROVIDER ?? "log";
  if (p === "log") { off("SMS", "SMS_PROVIDER"); console.log(`[sms] ${e164.slice(0, 3)}******${e164.slice(-2)} ${opts.otp ? "code " + opts.otp : text}`); return { ok: true, ref: "log" }; }
  if (p === "msg91") {
    // MSG91 Flow API with a DLT approved template. OTP templates use the variable "otp".
    const r = await fetch("https://control.msg91.com/api/v5/flow/", { method: "POST", headers: { authkey: process.env.MSG91_AUTH_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: opts.otp ? process.env.MSG91_OTP_TEMPLATE : process.env.MSG91_ALERT_TEMPLATE, short_url: "0", recipients: [{ mobiles: digits(e164), otp: opts.otp, message: text }] }) });
    if (!r.ok) throw new Error(`MSG91 failed: ${r.status}`); return { ok: true, ref: "msg91" };
  }
  if (p === "twilio") {
    // Twilio for international numbers (families abroad).
    const sid = process.env.TWILIO_ACCOUNT_SID ?? "", tok = process.env.TWILIO_AUTH_TOKEN ?? "";
    const body = new URLSearchParams({ To: e164, Body: opts.otp ? `Your Uday code is ${opts.otp}. It expires in 10 minutes. Do not share it.` : text, MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID ?? "" });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!r.ok) throw new Error(`Twilio failed: ${r.status}`); return { ok: true, ref: "twilio" };
  }
  throw new Error(`SMS provider ${p} not supported`);
}
/** Indian numbers through MSG91 (DLT), others through Twilio, when SMS_PROVIDER=auto. */
export async function sendSmsAuto(e164: string, text: string, opts: { otp?: string } = {}) {
  if ((process.env.SMS_PROVIDER ?? "log") !== "auto") return sendSms(e164, text, opts);
  const saved = process.env.SMS_PROVIDER; process.env.SMS_PROVIDER = e164.startsWith("+91") ? "msg91" : "twilio";
  try { return await sendSms(e164, text, opts); } finally { process.env.SMS_PROVIDER = saved; }
}

// ───────── WhatsApp (family alerts) ─────────
export async function sendWhatsApp(e164: string, template: string, params: string[] = []) {
  const p = process.env.WHATSAPP_PROVIDER ?? "log";
  if (p === "log") { off("WhatsApp", "WHATSAPP_PROVIDER"); console.log(`[whatsapp] ${e164.slice(0, 3)}******${e164.slice(-2)} ${template}`); return { ok: true }; }
  if (p === "meta") {
    // WhatsApp Business Cloud API: pre approved template messages.
    const r = await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: digits(e164), type: "template", template: { name: template, language: { code: "en" }, components: params.length ? [{ type: "body", parameters: params.map((t) => ({ type: "text", text: t })) }] : [] } }) });
    if (!r.ok) throw new Error(`WhatsApp failed: ${r.status}`); return { ok: true };
  }
  throw new Error(`WhatsApp provider ${p} not supported`);
}

// ───────── calls: masked calls and phone check in ─────────
const exotel = () => ({ sid: process.env.EXOTEL_SID ?? "", key: process.env.EXOTEL_API_KEY ?? "", token: process.env.EXOTEL_API_TOKEN ?? "", caller: process.env.EXOTEL_CALLER_ID ?? "", host: process.env.EXOTEL_HOST ?? "api.exotel.com" });
async function exotelCall(form: Record<string, string>) {
  const e = exotel();
  const r = await fetch(`https://${e.host}/v1/Accounts/${e.sid}/Calls/connect.json`, { method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${e.key}:${e.token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });
  if (!r.ok) throw new Error(`Exotel failed: ${r.status}`);
  const j: any = await r.json(); return j?.Call?.Sid as string;
}
/** Connects two people through Uday's number. Neither sees the other's number. */
export async function maskedCall(fromE164: string, toE164: string) {
  const p = process.env.CALL_PROVIDER ?? "log";
  if (p === "log") { off("Calls", "CALL_PROVIDER"); console.log(`[call] bridge ${fromE164.slice(-2)} -> ${toE164.slice(-2)}`); return { ref: "log-" + Date.now(), status: "simulated" }; }
  if (p === "exotel") return { ref: await exotelCall({ From: fromE164, To: toE164, CallerId: exotel().caller, Record: "false" }), status: "placed" };
  throw new Error(`Call provider ${p} not supported`);
}
/** Daily check in call: the voice flow asks "Press 1 if you are well, 2 if you need help" and calls back /api/ivr/checkin. */
export async function checkinCall(toE164: string, reference: string) {
  const p = process.env.CALL_PROVIDER ?? "log";
  if (p === "log") { off("Calls", "CALL_PROVIDER"); console.log(`[ivr] check in call to ${toE164.slice(-2)} ref ${reference}`); return { ref: "log-" + reference }; }
  if (p === "exotel") return { ref: await exotelCall({ From: toE164, CallerId: exotel().caller, Url: `http://my.exotel.com/${exotel().sid}/exoml/start_voice/${process.env.EXOTEL_CHECKIN_APP_ID}`, CustomField: reference }) };
  throw new Error(`Call provider ${p} not supported`);
}

// ───────── video link for intro calls ─────────
export function videoRoom(id: string) { const t = process.env.VIDEO_ROOM_URL_TEMPLATE; return t ? t.replace("{room}", "uday-" + id.slice(0, 8)) : null; }

// ───────── AI companion ─────────
export async function companionReply(system: string, messages: { role: "user" | "assistant"; content: string }[]): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { off("AI companion", "ANTHROPIC_API_KEY"); return null; }
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5", max_tokens: 300, system, messages }) });
  if (!r.ok) throw new Error(`AI companion failed: ${r.status}`);
  const j: any = await r.json(); return (j.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim() || null;
}
