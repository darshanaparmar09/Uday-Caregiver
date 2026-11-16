import { matchPartner } from "./partners";
import { policyNow } from "./settings";
import { z } from "zod";
import { PLUS, postProblem, fees } from "@uday/core";
import { one, q, tx } from "./db";
import { dec, enc, lookupHash, normalisePhone } from "./crypto";
import { notify } from "./notify";
import { gateway } from "./payments";
import { putEncrypted, getDecrypted } from "./storage";
import { verifyAadhaar, verifyAadhaarOtp } from "./kyc";
import { companionReply, checkinCall, maskedCall, sendSmsAuto } from "./providers";
import { AppError, familyRole } from "./bookings";
import type { SessionUser } from "./auth";

const MANAGE = ["owner", "care_manager"];
const istDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// ───────── family members and invites ─────────
export const InviteIn = z.object({ phone: z.string().min(8).max(20), role: z.enum(["care_manager", "payer", "viewer", "local_contact"]), name: z.string().max(60).optional() });
export async function members(u: SessionUser, rid: string) {
  const role = await familyRole(u.id, rid); if (!role) throw new AppError("Not allowed", 403);
  const list = await q(`SELECT f.user_id, f.role, u.name, u.phone_last4, f.accepted_at FROM family_members f JOIN users u ON u.id=f.user_id WHERE f.care_recipient_id=$1 AND f.accepted_at IS NOT NULL ORDER BY f.invited_at`, [rid]);
  const invites = MANAGE.includes(role) ? await q("SELECT id, name, phone_last4, role, created_at FROM family_invites WHERE care_recipient_id=$1 AND status='pending' ORDER BY created_at", [rid]) : [];
  return { myRole: role, members: list.map((m: any) => ({ ...m, me: m.user_id === u.id })), invites };
}
/** Owner can invite any role but owner; a care manager can add viewers and local contacts. The invite is matched by phone when they sign in. */
export async function invite(u: SessionUser, rid: string, i: z.infer<typeof InviteIn>) {
  const role = await familyRole(u.id, rid);
  if (!role || !MANAGE.includes(role)) throw new AppError("Only the owner or care manager can invite", 403);
  if (role === "care_manager" && !["viewer", "local_contact"].includes(i.role)) throw new AppError("A care manager can invite viewers and local contacts only", 403);
  let phone: string; try { phone = normalisePhone(i.phone); } catch (e: any) { throw new AppError(e.message); }
  const h = lookupHash(phone);
  const existing = await one<any>("SELECT u.id FROM users u JOIN family_members f ON f.user_id=u.id WHERE u.phone_hash=$1 AND f.care_recipient_id=$2", [h, rid]);
  if (existing) throw new AppError("This person is already in the family");
  if (await one("SELECT 1 FROM family_invites WHERE care_recipient_id=$1 AND phone_hash=$2 AND status='pending'", [rid, h])) throw new AppError("Already invited");
  const r = await one<{ id: string }>("INSERT INTO family_invites (care_recipient_id, phone_hash, phone_last4, name, role, invited_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", [rid, h, phone.slice(-4), i.name ?? null, i.role, u.id]);
  const who = await one<any>("SELECT u.name AS inviter, r.name AS senior FROM users u, care_recipients r WHERE u.id=$1 AND r.id=$2", [u.id, rid]);
  await sendSmsAuto(phone, `${who?.inviter ?? "A family member"} invited you to help care for ${who?.senior} on Uday. Sign in with this number at uday.app to accept.`).catch(() => {});
  return r;
}
export async function cancelInvite(u: SessionUser, rid: string, inviteId: string) {
  const role = await familyRole(u.id, rid); if (!role || !MANAGE.includes(role)) throw new AppError("Not allowed", 403);
  await q("UPDATE family_invites SET status='cancelled' WHERE id=$1 AND care_recipient_id=$2", [inviteId, rid]);
}
export async function removeMember(u: SessionUser, rid: string, userId: string) {
  const role = await familyRole(u.id, rid); if (role !== "owner") throw new AppError("Only the owner can remove family members", 403);
  if (userId === u.id) throw new AppError("The owner cannot be removed");
  await q("DELETE FROM family_members WHERE care_recipient_id=$1 AND user_id=$2 AND role<>'owner'", [rid, userId]);
}
export async function myInvites(u: SessionUser) {
  const ph = await one<{ phone_hash: string }>("SELECT phone_hash FROM users WHERE id=$1", [u.id]);
  return q(`SELECT i.id, i.role, r.name AS senior, r.locality, iu.name AS inviter FROM family_invites i JOIN care_recipients r ON r.id=i.care_recipient_id LEFT JOIN users iu ON iu.id=i.invited_by
    WHERE i.phone_hash=$1 AND i.status='pending' ORDER BY i.created_at`, [ph!.phone_hash]);
}
export async function answerInvite(u: SessionUser, id: string, accept: boolean) {
  if (u.role !== "family") throw new AppError("Use a family account to join", 403);
  const ph = await one<{ phone_hash: string }>("SELECT phone_hash FROM users WHERE id=$1", [u.id]);
  return tx(async (c) => {
    const i = (await c.query("SELECT * FROM family_invites WHERE id=$1 AND phone_hash=$2 AND status='pending' FOR UPDATE", [id, ph!.phone_hash])).rows[0];
    if (!i) throw new AppError("Invite not found", 404);
    if (!accept) { await c.query("UPDATE family_invites SET status='cancelled' WHERE id=$1", [id]); return { joined: false }; }
    await c.query("INSERT INTO family_members (care_recipient_id, user_id, role, accepted_at) VALUES ($1,$2,$3, now()) ON CONFLICT (care_recipient_id, user_id) DO UPDATE SET role=EXCLUDED.role, accepted_at=now()", [i.care_recipient_id, u.id, i.role]);
    await c.query("UPDATE family_invites SET status='accepted', accepted_at=now() WHERE id=$1", [id]);
    return { joined: true, recipientId: i.care_recipient_id };
  });
}

// ───────── prescriptions and reports ─────────
export const DocIn = z.object({ kind: z.enum(["prescription", "report", "discharge", "scan", "other"]), title: z.string().min(2).max(80), docDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), base64: z.string().max(7_200_000), mime: z.string() });
export async function addDocument(u: SessionUser, rid: string, i: z.infer<typeof DocIn>) {
  const role = await familyRole(u.id, rid); if (!role || !MANAGE.includes(role)) throw new AppError("Not allowed", 403);
  let put; try { put = await putEncrypted(Buffer.from(i.base64, "base64"), i.mime, "health"); } catch (e: any) { throw new AppError(e.message); }
  const d = await one("INSERT INTO health_documents (care_recipient_id, kind, title, doc_date, storage_key, file_key_enc, mime, bytes, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
    [rid, i.kind, i.title, i.docDate ?? null, put.storageKey, put.fileKeyEnc, i.mime, put.bytes, u.id]);
  await q("INSERT INTO audit_log (actor_id, action, entity, entity_id) VALUES ($1,'document_upload','care_recipient',$2)", [u.id, rid]);
  return d;
}
export async function documents(u: SessionUser, rid: string) {
  const role = await familyRole(u.id, rid); if (!role || !MANAGE.includes(role)) throw new AppError("Not allowed", 403);
  return q("SELECT id, kind, title, doc_date, mime, bytes, created_at FROM health_documents WHERE care_recipient_id=$1 ORDER BY COALESCE(doc_date, created_at::date) DESC", [rid]);
}
export async function document(u: SessionUser, rid: string, id: string) {
  const role = await familyRole(u.id, rid); if (!role || !MANAGE.includes(role)) throw new AppError("Not allowed", 403);
  const d = await one<any>("SELECT * FROM health_documents WHERE id=$1 AND care_recipient_id=$2", [id, rid]); if (!d) throw new AppError("Not found", 404);
  await q("INSERT INTO audit_log (actor_id, action, entity, entity_id) VALUES ($1,'document_view','care_recipient',$2)", [u.id, rid]);
  return { body: await getDecrypted(d.storage_key, d.file_key_enc), mime: d.mime as string, title: d.title as string };
}
export async function deleteDocument(u: SessionUser, rid: string, id: string) {
  const role = await familyRole(u.id, rid); if (!role || !MANAGE.includes(role)) throw new AppError("Not allowed", 403);
  await q("DELETE FROM health_documents WHERE id=$1 AND care_recipient_id=$2", [id, rid]);
}

// ───────── optional customer ID check ─────────
export async function customerKyc(u: SessionUser, aadhaar: string, consent: boolean) {
  if (!consent) throw new AppError("Please agree to the check first");
  const me = await one<any>("SELECT name FROM users WHERE id=$1", [u.id]);
  let r; try { r = await verifyAadhaar(aadhaar, me?.name ?? ""); } catch (e: any) { throw new AppError(e.message); }
  await q("UPDATE users SET aadhaar_ref=$2, aadhaar_last4=$3, kyc_status=$4 WHERE id=$1", [u.id, r.reference, r.last4, r.result]);
  return { result: r.result, last4: r.last4, needsOtp: !!r.needsOtp };
}
export async function customerKycOtp(u: SessionUser, otp: string) {
  const me = await one<any>("SELECT name, aadhaar_ref, kyc_status FROM users WHERE id=$1", [u.id]);
  if (!me?.aadhaar_ref || me.kyc_status !== "pending") throw new AppError("Start the Aadhaar check first");
  let r; try { r = await verifyAadhaarOtp(me.aadhaar_ref, otp, me.name ?? ""); } catch (e: any) { throw new AppError(e.message); }
  await q("UPDATE users SET kyc_status=$2, aadhaar_last4=COALESCE(NULLIF($3,''), aadhaar_last4) WHERE id=$1", [u.id, r.result, r.last4]);
  return { result: r.result };
}

// ───────── booking chat, calls, live location ─────────
async function bookingParty(u: SessionUser, bookingId: string) {
  const b = await one<any>("SELECT b.*, c.user_id AS cg_user FROM bookings b JOIN caregivers c ON c.id=b.caregiver_id WHERE b.id=$1", [bookingId]);
  if (!b) throw new AppError("Not found", 404);
  const fam = await familyRole(u.id, b.care_recipient_id); const cg = b.cg_user === u.id;
  if (!fam && !cg) throw new AppError("Not found", 404);
  return { b, fam, cg };
}
const CHAT_OPEN = ["accepted", "enroute", "arrived", "active", "completed"];
/** In app messages between the family and the caregiver. No phone numbers or links, so contact stays on Uday. */
export async function messages(u: SessionUser, bookingId: string) {
  const { b } = await bookingParty(u, bookingId);
  const rows = await q<any>(`SELECT m.id, m.body, m.sender_role, m.created_at, m.sender_id, u.name FROM booking_messages m JOIN users u ON u.id=m.sender_id WHERE m.booking_id=$1 ORDER BY m.id LIMIT 300`, [bookingId]);
  return { open: CHAT_OPEN.includes(b.status), messages: rows.map((m) => ({ id: m.id, body: m.body, from: m.sender_role, name: (m.name ?? "").split(" ")[0], mine: m.sender_id === u.id, at: m.created_at })) };
}
export async function sendMessage(u: SessionUser, bookingId: string, body: string) {
  const { b, cg } = await bookingParty(u, bookingId);
  if (!CHAT_OPEN.includes(b.status)) throw new AppError("Messages open once the caregiver accepts");
  const p = postProblem(body); if (p) throw new AppError(p.replace("in groups", "in messages"));
  await q("INSERT INTO booking_messages (booking_id, sender_id, sender_role, body) VALUES ($1,$2,$3,$4)", [bookingId, u.id, cg ? "caregiver" : "family", body.trim()]);
  if (cg) { const fam = await q<{ user_id: string }>("SELECT user_id FROM family_members WHERE care_recipient_id=$1 AND role IN ('owner','care_manager','payer') AND accepted_at IS NOT NULL", [b.care_recipient_id]); for (const f of fam) await notify(f.user_id, "new_message", { bookingId }); }
  else if (b.cg_user) await notify(b.cg_user, "new_message", { bookingId });
  return { ok: true };
}
/** Masked call: Uday's number rings the caller, then connects the other person. */
export async function callOther(u: SessionUser, bookingId: string) {
  const { b, cg } = await bookingParty(u, bookingId);
  if (!["accepted", "enroute", "arrived", "active"].includes(b.status)) throw new AppError("Calls are open during the booking");
  const me = await one<any>("SELECT phone_enc FROM users WHERE id=$1", [u.id]);
  const otherId = cg ? b.payer_id : b.cg_user; const other = await one<any>("SELECT phone_enc FROM users WHERE id=$1", [otherId]);
  const r = await maskedCall(dec(me.phone_enc)!, dec(other.phone_enc)!);
  await q("INSERT INTO call_logs (booking_id, from_user, provider_ref, status) VALUES ($1,$2,$3,$4)", [bookingId, u.id, r.ref, r.status]);
  return { status: r.status };
}
export async function postLocation(u: SessionUser, bookingId: string, lat: number, lng: number) {
  const { b, cg } = await bookingParty(u, bookingId);
  if (!cg || b.status !== "enroute") throw new AppError("Location is shared only while travelling");
  await q("INSERT INTO booking_locations (booking_id, lat, lng, at) VALUES ($1,$2,$3, now()) ON CONFLICT (booking_id) DO UPDATE SET lat=$2, lng=$3, at=now()", [bookingId, lat, lng]);
  return { ok: true };
}
export async function liveLocation(u: SessionUser, bookingId: string) {
  const { b, fam } = await bookingParty(u, bookingId); if (!fam) throw new AppError("Not allowed", 403);
  if (b.status !== "enroute") return { sharing: false };
  const l = await one<any>("SELECT lat, lng, at FROM booking_locations WHERE booking_id=$1", [bookingId]);
  const home = await one<any>("SELECT lat, lng FROM care_recipients WHERE id=$1", [b.care_recipient_id]);
  if (!l) return { sharing: true, location: null };
  const km = home?.lat != null ? Math.round(distKm(l.lat, l.lng, home.lat, home.lng) * 10) / 10 : null;
  return { sharing: true, location: { lat: l.lat, lng: l.lng, at: l.at }, home: home?.lat != null ? { lat: home.lat, lng: home.lng } : null, km, etaMin: km != null ? Math.max(2, Math.round((km / 18) * 60)) : null };
}
function distKm(a: number, b: number, c: number, d: number) { const R = 6371, r = Math.PI / 180; const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }

// ───────── coupons and Uday Plus ─────────
export async function plusStatus(u: SessionUser) {
  const m = await one<any>("SELECT status, current_period_end, amount_paise FROM memberships WHERE user_id=$1", [u.id]);
  const active = !!m && m.status === "active" || (!!m && m.status === "cancelled" && String(m.current_period_end instanceof Date ? m.current_period_end.toISOString() : m.current_period_end).slice(0, 10) >= istDay());
  return { plan: PLUS, member: active, membership: m };
}
export async function joinPlus(u: SessionUser) {
  if (u.role !== "family") throw new AppError("For family accounts", 403);
  const s = await plusStatus(u); if (s.member && s.membership?.status === "active") throw new AppError("You are already an Uday Plus member");
  const r = await (await gateway()).subscribe("plus", PLUS.pricePaise, `PLUS-${u.id.slice(0, 8)}`);
  await q(`INSERT INTO memberships (user_id, status, amount_paise, gateway_ref, current_period_end) VALUES ($1,'active',$2,$3, current_date + 30)
    ON CONFLICT (user_id) DO UPDATE SET status='active', amount_paise=$2, gateway_ref=$3, current_period_end=current_date + 30`, [u.id, PLUS.pricePaise, r.ref]);
  await q("INSERT INTO ledger_entries (account, debit_paise, credit_paise, reason) VALUES ('family_payments',$1,0,'Uday Plus'),('uday_membership_revenue',0,$1,'Uday Plus')", [PLUS.pricePaise]);
  return { member: true, checkoutUrl: r.checkoutUrl };
}
export async function leavePlus(u: SessionUser) { await q("UPDATE memberships SET status='cancelled' WHERE user_id=$1 AND status='active'", [u.id]); return { ok: true }; }
/** The platform fee discount for a booking: Uday Plus and a coupon do not stack; the larger wins. */
export async function feeDiscount(u: SessionUser, code?: string): Promise<{ bps: number; coupon: string | null; reason: string | null }> {
  const plus = (await plusStatus(u)).member ? PLUS.feeDiscountBps : 0;
  let cbps = 0, coupon: string | null = null;
  if (code) {
    const c = await one<any>("SELECT * FROM coupons WHERE code=$1", [code.trim().toUpperCase()]);
    if (!c || !c.active || (c.valid_until && String(c.valid_until instanceof Date ? c.valid_until.toISOString() : c.valid_until).slice(0, 10) < istDay()) || (c.max_uses != null && c.used >= c.max_uses)) throw new AppError("This code is not valid");
    if (await one("SELECT 1 FROM coupon_redemptions WHERE code=$1 AND user_id=$2", [c.code, u.id])) throw new AppError("You have already used this code");
    cbps = c.fee_discount_bps; coupon = c.code;
  }
  if (cbps > plus) return { bps: cbps, coupon, reason: `Code ${coupon}` };
  return { bps: plus, coupon: null, reason: plus ? "Uday Plus" : null };
}
export async function checkCoupon(u: SessionUser, code: string, ratePaise: number, days: number) {
  const d = await feeDiscount(u, code); const pol = await policyNow(); const base = fees(ratePaise, days, pol); const after = fees(ratePaise, days, pol, d.bps);
  return { ...d, savingPaise: base.totalPaise - after.totalPaise };
}
export const CouponIn = z.object({ code: z.string().regex(/^[A-Z0-9]{4,20}$/), feeDiscountBps: z.number().int().min(1).max(10000), maxUses: z.number().int().min(1).optional(), validUntil: z.string().optional(), note: z.string().max(200).optional() });
export async function createCoupon(i: z.infer<typeof CouponIn>) {
  await q("INSERT INTO coupons (code, fee_discount_bps, max_uses, valid_until, note) VALUES ($1,$2,$3,$4,$5)", [i.code, i.feeDiscountBps, i.maxUses ?? null, i.validUntil ?? null, i.note ?? null]);
  return { ok: true };
}

// ───────── GST invoice PDF ─────────
/** Tax invoice for the Uday platform fee, with the caregiver's care fee shown as collected on her behalf. CA to confirm the format and tax treatment. */
// ───────── AI companion ─────────
const CRISIS = /(सीने में दर्द|छाती में दर्द|साँस नहीं|सांस नहीं|गिर गया|गिर गई|मरना चाहत|जान देन|छातीत दुख|श्वास घेता येत नाही|पडलो|पडले|मरायचं|chest pain|can'?t breathe|cannot breathe|fell|fallen|fall down|bleeding|stroke|suicid|kill myself|end my life|want to die|heart attack|unconscious|dizzy and|help me now)/i;
const SYSTEM = `You are Uday, a warm daily companion for an elderly person in India. Reply in the same language the person writes in (English, Hindi or Marathi).
Keep replies short: two to four sentences, simple words, no lists. Be kind, patient and curious about their day, family, memories, food, music and faith.
Never give medical, legal or financial advice. For anything about health or money, gently suggest they talk to their doctor or family, and remind them of the SOS button.
Never ask for passwords, OTPs, bank details or Aadhaar numbers, and warn them never to share these with anyone who calls.
If they sound unwell, unsafe or very low, tell them to press SOS or call 112, and that Uday will tell their family.`;
const LANG_NAME: Record<string, string> = { en: "English", hi: "Hindi", mr: "Marathi" };
// Hindi and Marathi lines written by Claude: to be checked by a native speaker.
const SCRIPTED_BY: Record<string, string[]> = {
  hi: ["यह सुनकर अच्छा लगा। अपने दिन के बारे में और बताइए।", "मैं आपके साथ हूँ। आज नाश्ते में क्या खाया?", "आपका परिवार आपसे बहुत प्यार करता है। बाद में एक दिमागी खेल खेलें?", "यह ज़रूरी लगता है। क्या उदय आपको फ़ोन करे?"],
  mr: ["हे ऐकून छान वाटलं. तुमच्या दिवसाबद्दल अजून सांगा.", "मी तुमच्यासोबत आहे. आज नाश्त्याला काय खाल्लं?", "तुमचं कुटुंब तुमच्यावर खूप प्रेम करतं. नंतर एक बुद्धीचा खेळ खेळूया?", "हे महत्त्वाचं वाटतं. उदयने तुम्हाला फोन करावा का?"],
};
const CRISIS_REPLY: Record<string, string> = {
  en: "This sounds serious. Please press the red SOS button now, or call 112. I am telling your family and the Uday team to call you.",
  hi: "यह गंभीर लगता है। कृपया अभी लाल SOS बटन दबाएँ या 112 पर कॉल करें। मैं आपके परिवार और उदय टीम को फ़ोन करने के लिए कह रहा हूँ।",
  mr: "हे गंभीर वाटतं. कृपया आत्ता लाल SOS बटण दाबा किंवा 112 ला फोन करा. मी तुमच्या कुटुंबाला आणि उदय टीमला फोन करायला सांगत आहे.",
};
const SCRIPTED = ["That is lovely to hear. Tell me more about your day.", "I am here with you. What did you have for breakfast today?", "Your family loves you very much. Shall we play a brain game together later?", "That sounds important. Would you like Uday to call you to talk about it?"];
export async function companion(u: SessionUser, message: string) {
  if (u.role !== "senior") throw new AppError("For seniors", 403);
  const text = message.trim().slice(0, 600); if (!text) throw new AppError("Write a message");
  const recent = await one<{ n: number }>("SELECT count(*)::int AS n FROM companion_messages WHERE user_id=$1 AND created_at > now() - interval '1 hour' AND role='user'", [u.id]);
  if ((recent?.n ?? 0) >= 40) throw new AppError("Let us rest a little and talk again soon.", 429);
  const crisis = CRISIS.test(text);
  const lang = (await one<{ language: string }>("SELECT language FROM senior_settings WHERE user_id=$1", [u.id]))?.language ?? "en";
  await q("INSERT INTO companion_messages (user_id, role, body_enc, flagged) VALUES ($1,'user',$2,$3)", [u.id, enc(text, "health"), crisis]);
  let reply: string; let source = "safety";
  if (crisis) {
    reply = CRISIS_REPLY[lang] ?? CRISIS_REPLY.en;
    const r = await one<{ id: string }>("SELECT id FROM care_recipients WHERE senior_user_id=$1 ORDER BY created_at LIMIT 1", [u.id]);
    if (r) { const fam = await q<{ user_id: string }>("SELECT user_id FROM family_members WHERE care_recipient_id=$1 AND accepted_at IS NOT NULL", [r.id]);
      for (const f of fam) await notify(f.user_id, "checkin_help", { recipientId: r.id, from: "companion" }, "sms");
      await notify(null, "checkin_help", { recipientId: r.id, from: "companion", escalate: true }); }
  } else {
    const hist = (await q<any>("SELECT role, body_enc FROM companion_messages WHERE user_id=$1 ORDER BY id DESC LIMIT 12", [u.id])).reverse().map((m) => ({ role: m.role, content: dec(m.body_enc) ?? "" }));
    const ai = await companionReply(`${SYSTEM}\nThe person chose ${LANG_NAME[lang] ?? "English"} in their settings. Use it unless they write in another language.`, hist).catch(() => null);
    const pool = SCRIPTED_BY[lang] ?? SCRIPTED; reply = ai ?? pool[Math.floor(Math.random() * pool.length)]; source = ai ? "ai" : "scripted";
  }
  await q("INSERT INTO companion_messages (user_id, role, body_enc) VALUES ($1,'assistant',$2)", [u.id, enc(reply, "health")]);
  return { reply, crisis, source };
}
export async function companionHistory(u: SessionUser) {
  // Kept for 30 days. Families cannot read these conversations; only safety alerts reach them.
  await q("DELETE FROM companion_messages WHERE user_id=$1 AND created_at < now() - interval '30 days'", [u.id]);
  return (await q<any>("SELECT role, body_enc, created_at FROM companion_messages WHERE user_id=$1 ORDER BY id DESC LIMIT 40", [u.id])).reverse().map((m) => ({ role: m.role, text: dec(m.body_enc), at: m.created_at }));
}

// ───────── partner leads ─────────
export async function lead(u: SessionUser, kind: "insurance" | "tablet" | "telehealth", note?: string, consent = false) {
  const r = await one<{ id: string }>(u.role === "senior" ? "SELECT id FROM care_recipients WHERE senior_user_id=$1 ORDER BY created_at LIMIT 1" : "SELECT care_recipient_id AS id FROM family_members WHERE user_id=$1 LIMIT 1", [u.id]);
  const open_ = await one<any>("SELECT l.id, p.name FROM leads l LEFT JOIN partners p ON p.id=l.partner_id WHERE l.user_id=$1 AND l.kind=$2 AND l.status='open'", [u.id, kind]);
  if (open_) return { ok: true, partner: open_.name ?? null };
  const city = (await one<{ city: string }>("SELECT city FROM users WHERE id=$1", [u.id]))?.city;
  const p = await matchPartner(kind, city);
  await q("INSERT INTO leads (user_id, care_recipient_id, kind, note, partner_id, consent_share) VALUES ($1,$2,$3,$4,$5,$6)", [u.id, r?.id ?? null, kind, note?.slice(0, 300) ?? null, p?.id ?? null, consent]);
  await notify(null, "callback_request", { kind, userId: u.id }); return { ok: true, partner: p?.name ?? null };
}

// ───────── check in by phone call ─────────
export const CallModeIn = z.object({ mode: z.enum(["app", "call"]), phone: z.string().optional() });
export async function setCheckinMode(u: SessionUser, rid: string, i: z.infer<typeof CallModeIn>) {
  const role = await familyRole(u.id, rid); if (!role || !MANAGE.includes(role)) throw new AppError("Not allowed", 403);
  let phone: string | null = null;
  if (i.mode === "call") { if (!i.phone) throw new AppError("Add the number Uday should call");
    const d = i.phone.replace(/[^\d+]/g, ""); phone = d.startsWith("+") ? d : /^0\d{9,11}$/.test(d) ? "+91" + d.slice(1) : (() => { try { return normalisePhone(d); } catch { throw new AppError("Check the number. Landlines need the STD code, for example 020 2553 1234"); } })(); }
  await q("UPDATE care_recipients SET checkin_mode=$2, call_phone_enc=$3 WHERE id=$1", [rid, i.mode, phone ? enc(phone) : null]);
  return { mode: i.mode };
}
/** At the expected check in time, call seniors who check in by phone and have not checked in yet. */
export async function sweepCheckinCalls() {
  const due = await q<any>(`SELECT r.id, r.call_phone_enc FROM care_recipients r WHERE r.checkin_mode='call' AND r.call_phone_enc IS NOT NULL
    AND (now() AT TIME ZONE 'Asia/Kolkata')::time > r.checkin_by
    AND NOT EXISTS (SELECT 1 FROM checkins k WHERE k.care_recipient_id=r.id AND (k.at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date)
    AND (SELECT count(*) FROM ivr_calls i WHERE i.care_recipient_id=r.id AND i.day=(now() AT TIME ZONE 'Asia/Kolkata')::date) < 2
    AND NOT EXISTS (SELECT 1 FROM ivr_calls i WHERE i.care_recipient_id=r.id AND i.created_at > now() - interval '20 minutes')`);
  for (const r of due) {
    const row = await one<{ id: string }>("INSERT INTO ivr_calls (care_recipient_id, day) VALUES ($1, (now() AT TIME ZONE 'Asia/Kolkata')::date) RETURNING id", [r.id]);
    const c = await checkinCall(dec(r.call_phone_enc)!, row!.id).catch(() => null);
    await q("UPDATE ivr_calls SET provider_ref=$2, status=$3 WHERE id=$1", [row!.id, c?.ref ?? null, c ? "placed" : "failed"]);
  }
  return due.length;
}
/** Voice flow callback: digit 1 means well, 2 means help. Secured by a shared token in the URL. */
export async function ivrResult(token: string, callId: string, digit: string) {
  if (!process.env.IVR_TOKEN || token !== process.env.IVR_TOKEN) throw new AppError("Forbidden", 403);
  const c = await one<any>("SELECT * FROM ivr_calls WHERE id=$1", [callId]); if (!c) throw new AppError("Unknown call", 404);
  const status = digit === "1" ? "ok" : digit === "2" ? "help" : null;
  await q("UPDATE ivr_calls SET digit=$2, status=$3 WHERE id=$1", [callId, digit, status ? "answered" : "no_answer"]);
  if (!status) return { ok: true };
  await q("INSERT INTO checkins (care_recipient_id, status, source) VALUES ($1,$2,'ivr')", [c.care_recipient_id, status]);
  const fam = await q<{ user_id: string }>("SELECT user_id FROM family_members WHERE care_recipient_id=$1 AND accepted_at IS NOT NULL", [c.care_recipient_id]);
  for (const f of fam) await notify(f.user_id, status === "ok" ? "checkin_ok" : "checkin_help", { recipientId: c.care_recipient_id, via: "call" }, status === "help" ? "sms" : "push");
  if (status === "help") await notify(null, "checkin_help", { recipientId: c.care_recipient_id, escalate: true });
  return { ok: true, status };
}

// ───────── ops ─────────
export async function opsFamily() {
  return { leads: await q(`SELECT l.id, l.kind, l.note, l.created_at, l.consent_share, l.sent_at, l.partner_id, p.name AS partner, r.name, r.locality FROM leads l LEFT JOIN care_recipients r ON r.id=l.care_recipient_id
      LEFT JOIN partners p ON p.id=l.partner_id WHERE l.status='open' ORDER BY l.created_at LIMIT 50`),
    coupons: await q("SELECT code, fee_discount_bps, max_uses, used, valid_until, active FROM coupons ORDER BY created_at DESC LIMIT 30"),
    members: (await one<{ n: number }>("SELECT count(*)::int AS n FROM memberships WHERE status='active'"))?.n ?? 0 };
}
export async function closeLead(id: string) { await q("UPDATE leads SET status='done' WHERE id=$1", [id]); }
