import { tfetch } from "./net";
import { randomBytes } from "node:crypto";
import { TEST_MODE } from "./env";
import { cfg } from "./settings";

/**
 * Outside services, one adapter each. Keys come from the admin module (Settings, Connections), with the older
 * environment variables as a fallback. In development and staging an unconnected service logs instead of sending.
 * In production an unconnected service fails loudly instead of silently doing nothing.
 * Endpoints follow each provider's public API at the time of writing. Confirm against current documentation
 * with your account manager before launch; the admin "Test connection" button checks the keys.
 */
function off(name: string) {
  if (!TEST_MODE) throw new Error(`${name} is not connected. Connect it in Operations, Settings.`);
}
const digits = (e164: string) => e164.replace(/\D/g, "");
const basic = (a: string, b: string) => "Basic " + Buffer.from(`${a}:${b}`).toString("base64");
async function must(r: Response, name: string) {
  if (r.ok) return r;
  const t = await r.text().catch(() => ""); throw new Error(`${name} answered ${r.status}${t ? ": " + t.slice(0, 160) : ""}`);
}
const otpText = (otp: string) => `Your Uday code is ${otp}. It expires in 5 minutes. Do not share it with anyone.`;

// ───────── SMS ─────────
async function msg91(e164: string, text: string, otp?: string) {
  const c = await cfg("msg91"); if (!c) throw new Error("MSG91 is not connected");
  // MSG91 Flow API with a DLT approved template.
  await must(await tfetch("https://control.msg91.com/api/v5/flow/", { method: "POST", headers: { authkey: c.authKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ template_id: otp ? c.otpTemplateId : c.alertTemplateId || c.otpTemplateId, short_url: "0", recipients: [{ mobiles: digits(e164), otp, message: text }] }) }), "MSG91");
  return { ok: true, ref: "msg91", simulated: false as const };
}
async function twilioSms(e164: string, text: string) {
  const c = await cfg("twilio"); if (!c) throw new Error("Twilio is not connected");
  await must(await tfetch(`https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}/Messages.json`, { method: "POST", headers: { Authorization: basic(c.accountSid, c.authToken), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: e164, Body: text, MessagingServiceSid: c.messagingServiceSid }) }), "Twilio");
  return { ok: true, ref: "twilio", simulated: false as const };
}
/** Sends an SMS by the route chosen in the admin module: auto sends Indian numbers by MSG91 and others by Twilio. */
export async function sendSmsAuto(e164: string, text: string, opts: { otp?: string } = {}) {
  const route = (await cfg("routing"))?.sms ?? "auto";
  const useMsg91 = route === "msg91" || (route === "auto" && e164.startsWith("+91"));
  const ready = useMsg91 ? await cfg("msg91") : await cfg("twilio");
  // Test mode without a provider: the message is only logged. "simulated" travels with the result so nothing upstream calls it sent.
  if (!ready) { off("SMS"); console.log(`[sms] ${e164.slice(0, 3)}******${e164.slice(-2)} ${opts.otp ? "code " + opts.otp : text}`); return { ok: true, ref: "log", simulated: true as const }; }
  return useMsg91 ? msg91(e164, text, opts.otp) : twilioSms(e164, opts.otp ? otpText(opts.otp) : text);
}
export const sendSms = sendSmsAuto;

// ───────── WhatsApp ─────────
/** Template messages only (WhatsApp requires pre approved templates for messages Uday starts). */
export async function sendWhatsApp(e164: string, template: string, params: string[] = []) {
  const route = (await cfg("routing"))?.whatsapp ?? "meta";
  if (route === "meta") {
    const c = await cfg("meta_whatsapp");
    if (c) {
      await must(await tfetch(`https://graph.facebook.com/v19.0/${c.phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${c.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: digits(e164), type: "template", template: { name: template, language: { code: c.language || "en" },
          components: params.length ? [{ type: "body", parameters: params.map((t) => ({ type: "text", text: t })) }] : [] } }) }), "WhatsApp");
      return { ok: true };
    }
  }
  if (route === "twilio") {
    const c = await cfg("twilio");
    if (c?.whatsappFrom) {
      const map = Object.fromEntries((c.contentSids ?? "").split(/\n/).map((l) => l.split("=").map((x) => x.trim())).filter((x) => x[1]));
      const sid = map[template]; if (!sid) throw new Error(`No Twilio template for ${template}. Add it to the template map in Settings.`);
      await must(await tfetch(`https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}/Messages.json`, { method: "POST", headers: { Authorization: basic(c.accountSid, c.authToken), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: "whatsapp:" + e164, From: "whatsapp:" + c.whatsappFrom.replace(/^whatsapp:/, ""), ContentSid: sid, ContentVariables: JSON.stringify(Object.fromEntries(params.map((p, i) => [String(i + 1), p]))) }) }), "Twilio WhatsApp");
      return { ok: true };
    }
  }
  if (route === "off") return { ok: false, skipped: true as const };
  off("WhatsApp"); console.log(`[whatsapp] ${e164.slice(0, 3)}******${e164.slice(-2)} ${template}`); return { ok: true, simulated: true as const };
}

// ───────── calls ─────────
async function exotelCall(form: Record<string, string>) {
  const c = (await cfg("exotel"))!;
  const r = await must(await tfetch(`https://${c.subdomain || "api.exotel.com"}/v1/Accounts/${c.sid}/Calls/connect.json`, { method: "POST",
    headers: { Authorization: basic(c.apiKey, c.apiToken), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) }), "Exotel");
  const j: any = await r.json(); return j?.Call?.Sid as string;
}
/** Connects two people through Uday's number. Neither sees the other's number. */
export async function maskedCall(fromE164: string, toE164: string) {
  const c = await cfg("exotel");
  if (!c) { off("Calls"); console.log(`[call] bridge ${fromE164.slice(-2)} -> ${toE164.slice(-2)}`); return { ref: "log-" + Date.now(), status: "simulated", simulated: true as const }; }
  return { ref: await exotelCall({ From: fromE164, To: toE164, CallerId: c.callerId, Record: "false" }), status: "placed" };
}
/** Daily check in call: the Exotel flow asks "Press 1 if you are well, 2 if you need help" and calls back /api/ivr/checkin. */
export async function checkinCall(toE164: string, reference: string) {
  const c = await cfg("exotel");
  if (!c || !c.checkinAppId) { off("Check in calls"); console.log(`[ivr] check in call to ${toE164.slice(-2)} ref ${reference}`); return { ref: "log-" + reference, simulated: true as const }; }
  return { simulated: false as const, ref: await exotelCall({ From: toE164, CallerId: c.callerId, Url: `http://my.exotel.com/${c.sid}/exoml/start_voice/${c.checkinAppId}`, CustomField: reference }) };
}

// ───────── video link for intro calls ─────────
export async function videoRoom(id: string): Promise<string | null> {
  const c = await cfg("video"); const name = "uday-" + id.slice(0, 8);
  const p = c?.provider ?? "jitsi";
  if (p === "template" && c?.template) return c.template.replace("{room}", name);
  if (p === "daily" && c?.apiKey) {
    const r = await must(await tfetch("https://api.daily.co/v1/rooms", { method: "POST", headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, privacy: "public", properties: { exp: Math.floor(Date.now() / 1000) + 14 * 86400, max_participants: 6 } }) }), "Daily");
    return ((await r.json()) as any).url ?? (c.domain ? `https://${c.domain}/${name}` : null);
  }
  // Jitsi Meet needs no account. A random suffix keeps the room hard to guess.
  return `https://meet.jit.si/${name}-${randomBytes(4).toString("hex")}`;
}

// ───────── AI companion ─────────
export async function companionReply(system: string, messages: { role: "user" | "assistant"; content: string }[]): Promise<string | null> {
  const c = await cfg("anthropic");
  if (!c) { off("AI companion"); return null; }
  const r = await must(await tfetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": c.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: c.model || "claude-haiku-5-5", max_tokens: 300, system, messages }) }), "Claude");
  const j: any = await r.json(); return (j.content ?? []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("\n").trim() || null;
}

// ───────── connection test for the admin module ─────────
/** A read only call that proves the keys work. With a phone number, also sends one test message or call. */
export async function probe(key: string, c: Record<string, string>, phone?: string): Promise<string> {
  const to = phone ? (phone.startsWith("+") ? phone : "+91" + digits(phone).slice(-10)) : null;
  switch (key) {
    case "msg91": {
      if (!to) return "Saved. Add your phone number and test again to receive a test code.";
      await msg91(to, "Uday test message", "123456"); return `Test code sent to ${to.slice(0, 3)}******${to.slice(-2)}`;
    }
    case "twilio": {
      const r = await must(await tfetch(`https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}.json`, { headers: { Authorization: basic(c.accountSid, c.authToken) } }), "Twilio");
      const j: any = await r.json(); if (to) await twilioSms(to, "Uday test message. Your Twilio connection works.");
      return `Account "${j.friendly_name ?? c.accountSid}" is ${j.status ?? "reachable"}${to ? ". Test SMS sent" : ""}`;
    }
    case "meta_whatsapp": {
      const r = await must(await tfetch(`https://graph.facebook.com/v19.0/${c.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, { headers: { Authorization: `Bearer ${c.accessToken}` } }), "Meta");
      const j: any = await r.json(); return `WhatsApp number ${j.display_phone_number ?? ""} (${j.verified_name ?? "name pending"}), quality ${j.quality_rating ?? "unknown"}`;
    }
    case "routing": return `SMS by ${c.sms ?? "auto"}, WhatsApp by ${c.whatsapp ?? "meta"}`;
    case "exotel": {
      const r = await must(await tfetch(`https://${c.subdomain || "api.exotel.com"}/v1/Accounts/${c.sid}.json`, { headers: { Authorization: basic(c.apiKey, c.apiToken) } }), "Exotel");
      const j: any = await r.json(); if (to) await exotelCall({ From: to, To: to, CallerId: c.callerId, Record: "false" });
      return `Exotel account ${j?.Account?.FriendlyName ?? c.sid} is ${j?.Account?.Status ?? "reachable"}${to ? ". Test call placed to your phone" : ""}`;
    }
    case "razorpay": {
      await must(await tfetch("https://api.razorpay.com/v1/payments?count=1", { headers: { Authorization: basic(c.keyId, c.keySecret) } }), "Razorpay");
      return `Keys work (${c.keyId.startsWith("rzp_live_") ? "LIVE: real money" : "test keys: no real money"}). Remember to add the webhook in the Razorpay dashboard.`;
    }
    case "kyc": {
      if ((c.provider ?? "manual") === "manual") return "Manual checks by the Uday team. No partner account needed.";
      if (!c.baseUrl) throw new Error("Add the partner API address");
      const r = await tfetch(c.baseUrl, { method: "GET", headers: { "x-client-id": c.clientId ?? "", "x-client-secret": c.clientSecret ?? "" } });
      return `Partner reachable (answered ${r.status}). Run one real check with your own Aadhaar to confirm.`;
    }
    case "video": {
      const url = await videoRoom("testroom"); return `Intro call links will look like ${url}`;
    }
    case "anthropic": {
      const t = await companionReply("Reply with one short friendly sentence.", [{ role: "user", content: "Namaste" }]);
      return `Claude replied: "${(t ?? "").slice(0, 80)}"`;
    }
  }
  throw new Error("Unknown connection");
}
