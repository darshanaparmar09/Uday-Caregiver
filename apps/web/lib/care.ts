import { videoRoom } from "./providers";
import { z } from "zod";
import { shiftCode, shiftStart, CHECKLIST_IDS, RATING_AREAS, careNeed, checklistFor } from "@uday/core";
import { one, q, tx } from "./db";
import { dec, enc, encJson } from "./crypto";
import { notify } from "./notify";
import { gateway } from "./payments";
import { getDecrypted } from "./storage";
import { AppError, busyCaregivers, event, ledger, lockBooking, releaseDay, tellFamily, familyRole } from "./bookings";
import type { SessionUser } from "./auth";

/**
 * Care operations found missing in the end to end journey: relief caregivers for the live in day off,
 * weekly billing, no show alerts, caregiver profiles with reviews and verified photos, intro calls.
 */
const istDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const TEST = ["development", "staging", "test"].includes(process.env.UDAY_ENV ?? "production");
const dstr = (d: any) => String(d instanceof Date ? d.toISOString() : d).slice(0, 10);
const photoUrl = (id: string, st: string) => (st === "verified" ? `/api/caregivers/${id}/photo` : null);

// ───────── relief caregivers ─────────
/** Offer open relief days in the next 7 days to the next free same tier caregiver. Unfilled on the day: the regular caregiver stays. */
export async function sweepRelief() {
  let offered = 0, covered = 0;
  const due = await q<any>(`SELECT r.*, b.tier, b.caregiver_id AS main_id, b.care_recipient_id FROM relief_shifts r JOIN bookings b ON b.id=r.booking_id
    WHERE r.status IN ('open','offered') AND r.day <= current_date + 7 AND b.status IN ('accepted','enroute','arrived','active')`);
  for (const r of due) {
    if (r.day <= istDay() && (r.status === "open" || r.status === "offered")) {
      await q("UPDATE relief_shifts SET status='covered', caregiver_id=NULL WHERE id=$1", [r.id]); covered++;
      for (const u of await famUsers(r.care_recipient_id)) await notify(u, "relief_unfilled", { bookingId: r.booking_id });
      await notify(null, "relief_unfilled", { bookingId: r.booking_id, reliefId: r.id }); continue;
    }
    if (r.status === "offered" && new Date(r.offer_expires_at) > new Date()) continue;
    const tried = Array.from(new Set([...(r.tried ?? []), ...(r.caregiver_id ? [r.caregiver_id] : []), r.main_id]));
    const busy = await busyCaregivers(null, dstr(r.day), 1);
    const relief = await q<{ caregiver_id: string }>("SELECT caregiver_id FROM relief_shifts WHERE day=$1 AND status IN ('offered','accepted','arrived','active') AND id<>$2 AND caregiver_id IS NOT NULL", [r.day, r.id]);
    relief.forEach((x) => busy.add(x.caregiver_id));
    const next = await one<any>(`SELECT id, user_id FROM caregivers WHERE status='active' AND tier=$1 AND 'day' = ANY(care_types) AND NOT (id = ANY($2::uuid[])) ORDER BY rating DESC`, [r.tier, [...tried, ...busy]]);
    if (!next) { await q("UPDATE relief_shifts SET status='open', caregiver_id=NULL, tried=$2 WHERE id=$1", [r.id, tried]); continue; }
    await q("UPDATE relief_shifts SET status='offered', caregiver_id=$2, tried=$3, offer_expires_at=now() + interval '12 hours' WHERE id=$1", [r.id, next.id, tried]);
    if (next.user_id) await notify(next.user_id, "relief_offer", { reliefId: r.id }); offered++;
  }
  return { offered, covered };
}
async function famUsers(rid: string) { return (await q<{ user_id: string }>("SELECT user_id FROM family_members WHERE care_recipient_id=$1 AND accepted_at IS NOT NULL", [rid])).map((x) => x.user_id); }
async function cgOf(u: SessionUser) { const c = await one<any>("SELECT * FROM caregivers WHERE user_id=$1", [u.id]); if (!c) throw new AppError("Not a caregiver", 403); return c; }

export async function myRelief(u: SessionUser) {
  const c = await cgOf(u);
  const rows = await q<any>(`SELECT r.id, r.day_no, r.day::text AS day, r.status, r.offer_expires_at, b.id AS booking_id, b.rate_paise, b.tier, b.start_time, b.care_need, b.days_done, b.away,
      cr.name AS recipient_name, cr.locality, cr.address_enc, cr.access_notes_enc, m.display_name AS main_name
    FROM relief_shifts r JOIN bookings b ON b.id=r.booking_id JOIN care_recipients cr ON cr.id=b.care_recipient_id JOIN caregivers m ON m.id=b.caregiver_id
    WHERE r.caregiver_id=$1 AND r.status IN ('offered','accepted','arrived','active') ORDER BY r.day`, [c.id]);
  return rows.map((r) => ({ id: r.id, dayNo: r.day_no, day: r.day, status: r.status, offerExpiresAt: r.offer_expires_at, bookingId: r.booking_id, ratePaise: r.rate_paise, startTime: String(r.start_time).slice(0, 5),
    careNeed: r.care_need ? careNeed(r.care_need)?.label : null, recipient: r.recipient_name, locality: r.locality, mainCaregiver: r.main_name,
    ready: r.days_done + 1 === r.day_no && r.away, tier: r.tier, checklistTemplate: checklistFor(Math.min(r.tier, 2) as 1 | 2), address: r.status !== "offered" ? dec(r.address_enc) : null, accessNotes: ["arrived", "active"].includes(r.status) ? dec(r.access_notes_enc) : null }));
}

export const ReliefAct = z.discriminatedUnion("action", [z.object({ action: z.literal("accept") }), z.object({ action: z.literal("decline") }), z.object({ action: z.literal("arrive") }),
  z.object({ action: z.literal("start"), code: z.string() }), z.object({ action: z.literal("end"), code: z.string() }),
  z.object({ action: z.literal("log"), mood: z.string().max(40), meal: z.boolean().optional(), meds: z.boolean().optional(), note: z.string().max(1000).optional(), checklist: z.record(z.string()).optional() })]);
export async function reliefAct(u: SessionUser, id: string, a: z.infer<typeof ReliefAct>) {
  const c = await cgOf(u);
  return tx(async (cl) => {
    const r = (await cl.query("SELECT * FROM relief_shifts WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!r || r.caregiver_id !== c.id) throw new AppError("Not found", 404);
    const b = await lockBooking(cl, r.booking_id); const first = c.display_name.split(" ")[0];
    const need = (st: string) => { if (r.status !== st) throw new AppError("Not possible now"); };
    switch (a.action) {
      case "accept": need("offered");
        await cl.query("UPDATE relief_shifts SET status='accepted', offer_expires_at=NULL WHERE id=$1", [id]);
        await event(cl, b, u, "caregiver", null, `${c.display_name} will cover the day off on day ${r.day_no} (${dstr(r.day)}).`);
        await tellFamily(b.care_recipient_id, "relief_assigned", { bookingId: b.id });
        // If the regular caregiver already closed the day before, she can go home now.
        if (b.status === "active" && b.days_done + 1 === r.day_no && !b.away) await cl.query("UPDATE bookings SET away=true WHERE id=$1", [b.id]);
        break;
      case "decline": need("offered");
        await cl.query("UPDATE relief_shifts SET status='open', caregiver_id=NULL, tried=array_append(tried, $2) WHERE id=$1", [id, c.id]); break;
      case "arrive": need("accepted");
        if (!(b.away && b.days_done + 1 === r.day_no)) throw new AppError("The regular caregiver has not handed over yet");
        if (!TEST && dstr(r.day) !== istDay()) throw new AppError("This relief day is not today");
        await cl.query("UPDATE relief_shifts SET status='arrived', start_code_enc=$2 WHERE id=$1", [id, enc(shiftCode())]);
        await event(cl, b, u, "caregiver", null, `Relief caregiver ${first} arrived for day ${r.day_no}.`);
        await tellFamily(b.care_recipient_id, "caregiver_arrived", { bookingId: b.id }); break;
      case "start": need("arrived");
        if (dec(r.start_code_enc) !== a.code) throw new AppError("Code does not match. Ask the family to read it again.");
        await cl.query("UPDATE relief_shifts SET status='active', end_code_enc=$2 WHERE id=$1", [id, enc(shiftCode())]);
        await event(cl, b, u, "caregiver", null, `Relief day ${r.day_no} started, code verified.`); break;
      case "log": need("active");
        const checklist = Object.fromEntries(Object.entries(a.checklist ?? {}).filter(([k, v]) => CHECKLIST_IDS.has(k) && !Number.isNaN(Date.parse(v))));
        await cl.query("INSERT INTO shift_logs (booking_id, day, caregiver_id, meal, meds, mood, note_enc, checklist_enc) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          [b.id, r.day_no, c.id, a.meal ?? !!checklist.breakfast, a.meds ?? !!checklist.medication, a.mood, enc(a.note, "health"), Object.keys(checklist).length ? encJson(checklist) : null]);
        await tellFamily(b.care_recipient_id, "shift_log", { bookingId: b.id }); break;
      case "end": need("active");
        if (!(await cl.query("SELECT 1 FROM shift_logs WHERE booking_id=$1 AND day=$2 AND caregiver_id=$3", [b.id, r.day_no, c.id])).rowCount) throw new AppError("Save the care log first");
        if (dec(r.end_code_enc) !== a.code) throw new AppError("Code does not match.");
        await releaseDay(cl, b, r.day_no, c.id, "relief day");
        await cl.query("UPDATE relief_shifts SET status='done' WHERE id=$1", [id]);
        await cl.query("UPDATE bookings SET days_done=$2, return_code_enc=$3, updated_at=now() WHERE id=$1", [b.id, r.day_no, enc(shiftCode())]);
        await event(cl, b, u, "caregiver", null, `Relief day ${r.day_no} done by ${c.display_name}. The regular caregiver needs the welcome back code when she returns.`);
        await tellFamily(b.care_recipient_id, "day_closed", { bookingId: b.id, day: r.day_no });
        const main = (await cl.query("SELECT user_id FROM caregivers WHERE id=$1", [b.caregiver_id])).rows[0]; if (main?.user_id) await notify(main.user_id, "shift_reminder", { bookingId: b.id });
        break;
    }
    return { ok: true };
  });
}
/** Ops: the regular caregiver covers a relief day (no relief found, or the relief caregiver did not come). */
export async function coverRelief(id: string) {
  await tx(async (c) => { const r = (await c.query("UPDATE relief_shifts SET status='covered' WHERE id=$1 AND status IN ('open','offered','accepted','arrived') RETURNING booking_id, day_no", [id])).rows[0];
    if (r) await c.query("UPDATE bookings SET away=false WHERE id=$1 AND days_done+1=$2", [r.booking_id, r.day_no]); });
}

// ───────── weekly billing ─────────
/**
 * Charge weekly cycles that are due, on the family's auto pay mandate. With Razorpay the charge is confirmed by
 * webhook, so the cycle waits as "held" (charging) until then. Without auto pay the family is asked to pay the week
 * by hand. Failures retry every 24 hours and alert the family and Uday. The mock gateway in tests charges at once.
 */
export async function sweepBilling(forceBooking?: string) {
  const due = await q<any>(`SELECT y.*, b.status AS bstatus, b.care_recipient_id, b.code, u.email, u.phone_enc FROM billing_cycles y JOIN bookings b ON b.id=y.booking_id JOIN users u ON u.id=b.payer_id
    WHERE y.status IN ('due','failed') AND (y.due_at <= now() OR ($1::uuid IS NOT NULL AND y.booking_id=$1::uuid)) ORDER BY y.booking_id, y.cycle_no LIMIT 100`, [forceBooking ?? null]);
  let paid = 0, failed = 0, charging = 0;
  const gw = await gateway();
  for (const y of due) {
    if (!["accepted", "enroute", "arrived", "active", "proposal", "offered"].includes(y.bstatus)) { await q("UPDATE billing_cycles SET status='cancelled' WHERE id=$1", [y.id]); continue; }
    if (["proposal", "offered"].includes(y.bstatus)) continue;
    const m = await one<any>("SELECT token_ref FROM mandates WHERE booking_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1", [y.booking_id]);
    const tokenRef = m?.token_ref ?? (gw.name === "mock" ? "mock:mock" : null);
    const r = tokenRef ? await gw.chargeRenewal(tokenRef, y.amount_paise, { email: y.email, contact: dec(y.phone_enc) ?? "", receipt: `${y.code}-W${y.cycle_no}` }).catch((e: any) => ({ ok: false, reason: String(e?.message ?? e) }))
      : { ok: false, reason: "no_autopay" } as any;
    if (r.ok && r.pending) { await q("UPDATE billing_cycles SET status='held', gateway_ref=$2, attempts=attempts+1, fail_reason=NULL WHERE id=$1", [y.id, r.ref]); charging++; continue; }
    if (r.ok) { await cyclePaid(y.id, r.ref ?? `auto-${y.id.slice(0, 8)}`); paid++; continue; }
    await q("UPDATE billing_cycles SET status='failed', attempts=attempts+1, fail_reason=$2, due_at=now() + interval '24 hours' WHERE id=$1", [y.id, r.reason === "no_autopay" ? "no_autopay" : "declined"]);
    const tpl = r.reason === "no_autopay" ? "payment_due" : "payment_failed";
    for (const u of await famUsers(y.care_recipient_id)) await notify(u, tpl, { bookingId: y.booking_id, cycle: y.cycle_no }, "sms");
    await notify(null, tpl, { bookingId: y.booking_id, cycle: y.cycle_no }); failed++;
  }
  return { paid, failed, charging };
}
/** Records a weekly payment once the money is confirmed. Safe to call twice for the same cycle. */
export async function cyclePaid(cycleId: string, paymentRef: string) {
  const done = await cyclePaidTx(cycleId, paymentRef);
  if (done) { const y = await one<{ booking_id: string }>("SELECT booking_id FROM billing_cycles WHERE id=$1", [cycleId]); const { ensureInvoices } = await import("./finance"); if (y) await ensureInvoices(y.booking_id).catch((e) => console.error("invoice", e)); }
  return done;
}
async function cyclePaidTx(cycleId: string, paymentRef: string) {
  return tx(async (c) => {
    const y = (await c.query("SELECT y.*, b.care_recipient_id FROM billing_cycles y JOIN bookings b ON b.id=y.booking_id WHERE y.id=$1 FOR UPDATE", [cycleId])).rows[0];
    if (!y || y.status === "paid") return false;
    const gw = await gateway(); const first = (await c.query("SELECT method FROM payments WHERE booking_id=$1 ORDER BY created_at LIMIT 1", [y.booking_id])).rows[0];
    await c.query("UPDATE billing_cycles SET status='paid', paid_at=now(), gateway_ref=$2, fail_reason=NULL WHERE id=$1", [y.id, paymentRef]);
    await c.query("INSERT INTO payments (booking_id, gateway, gateway_ref, payment_id, method, amount_paise, captured_paise, status) VALUES ($1,$2,$3,$3,$4,$5,$5,'captured')", [y.booking_id, gw.name, `${paymentRef}-w${y.cycle_no}`, first?.method ?? "UPI", y.amount_paise]);
    await c.query("UPDATE bookings SET paid_paise=paid_paise+$2 WHERE id=$1", [y.booking_id, y.amount_paise]);
    await ledger(c, y.booking_id, [["family_payments", y.amount_paise, 0, `week ${y.cycle_no} charged`], ["escrow", 0, y.amount_paise, `week ${y.cycle_no} charged`]]);
    await c.query("INSERT INTO booking_events (booking_id, actor_role, message) VALUES ($1,'system',$2)", [y.booking_id, `Week ${y.cycle_no} (days ${y.from_day} to ${y.to_day}) paid: ₹${Math.round(y.amount_paise / 100).toLocaleString("en-IN")}.`]);
    for (const u of await famUsers(y.care_recipient_id)) await notify(u, "payment_taken", { bookingId: y.booking_id });
    return true;
  });
}
export async function cycleFailed(paymentRef: string) {
  const y = await one<any>("UPDATE billing_cycles SET status='failed', fail_reason='declined', due_at=now() + interval '24 hours' WHERE gateway_ref=$1 AND status='held' RETURNING booking_id, cycle_no, (SELECT care_recipient_id FROM bookings WHERE id=booking_id) AS rid", [paymentRef]);
  if (y) { for (const u of await famUsers(y.rid)) await notify(u, "payment_failed", { bookingId: y.booking_id, cycle: y.cycle_no }, "sms"); await notify(null, "payment_failed", { bookingId: y.booking_id, cycle: y.cycle_no }); }
  return !!y;
}

// ───────── auto pay and paying a week by hand ─────────
const MAX_DEFAULT = 50_000_00;
export async function autopayStatus(u: SessionUser, bookingId: string) {
  const b = await one<any>("SELECT care_recipient_id, billing FROM bookings WHERE id=$1", [bookingId]);
  if (!b || !(await familyRole(u.id, b.care_recipient_id))) throw new AppError("Not found", 404);
  const m = await one<any>("SELECT status, method, max_paise, created_at FROM mandates WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1", [bookingId]);
  return { mandate: m ?? null, weekly: b.billing === "weekly" };
}
export async function startAutopay(u: SessionUser, bookingId: string, method: string) {
  const b = await one<any>("SELECT b.*, x.name, x.email, x.phone_enc FROM bookings b JOIN users x ON x.id=$2 WHERE b.id=$1", [bookingId, u.id]);
  if (!b || !(await familyRole(u.id, b.care_recipient_id))) throw new AppError("Not found", 404);
  if (b.billing !== "weekly") throw new AppError("Auto pay is for weekly billed care");
  if (await one("SELECT 1 FROM mandates WHERE booking_id=$1 AND status='active'", [bookingId])) throw new AppError("Auto pay is already on");
  const gw = await gateway(); const conf = (await import("./settings").then((m) => m.cfg("razorpay"))) ?? {};
  const maxPaise = Math.max(Number(conf.mandateMaxRupees || 0) * 100 || MAX_DEFAULT, (await one<any>("SELECT max(amount_paise) AS m FROM billing_cycles WHERE booking_id=$1", [bookingId]))?.m ?? 0);
  const allowed = (conf.mandateMethods || "upi,card").split(","); const meth = allowed.includes(method) ? method : allowed[0];
  const s = await gw.startMandate({ name: b.name ?? "Uday family", email: b.email, contact: dec(b.phone_enc) ?? undefined, maxPaise, method: meth, receipt: `${b.code}-AP` });
  await q("UPDATE mandates SET status='cancelled', updated_at=now() WHERE booking_id=$1 AND status='pending'", [bookingId]);
  await q("INSERT INTO mandates (booking_id, user_id, gateway, customer_ref, order_ref, token_ref, method, max_paise, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [bookingId, u.id, gw.name, s.customerId, s.orderId, s.tokenRef ?? null, meth, maxPaise, s.active ? "active" : "pending"]);
  if (s.active) { await q("INSERT INTO booking_events (booking_id, actor_id, actor_role, message) VALUES ($1,$2,'family',$3)", [bookingId, u.id, "Auto pay switched on for weekly payments."]); return { active: true }; }
  return { active: false, checkout: { orderId: s.orderId, customerId: s.customerId, keyId: s.keyId, amountPaise: s.amountPaise, recurring: true, name: "Uday", description: `Auto pay for ${b.code}. ₹1 now to confirm; each week is charged up to ₹${Math.round(maxPaise / 100).toLocaleString("en-IN")}.` } };
}
/** After the family authorises at checkout. Also called from the webhook. */
export async function mandateAuthorised(orderId: string, paymentId: string) {
  const m = await one<any>("SELECT * FROM mandates WHERE order_ref=$1", [orderId]); if (!m) return null;
  if (m.status === "active") return { active: true };
  const tokenRef = await (await gateway()).confirmMandate(paymentId).catch(() => null);
  if (!tokenRef) { await q("UPDATE mandates SET status='failed', updated_at=now() WHERE id=$1", [m.id]); return { active: false }; }
  await q("UPDATE mandates SET status='active', token_ref=$2, updated_at=now() WHERE id=$1", [m.id, tokenRef]);
  await q("INSERT INTO booking_events (booking_id, actor_id, actor_role, message) VALUES ($1,$2,'family',$3)", [m.booking_id, m.user_id, "Auto pay switched on for weekly payments."]);
  return { active: true, bookingId: m.booking_id };
}
export async function stopAutopay(u: SessionUser, bookingId: string) {
  const b = await one<any>("SELECT care_recipient_id FROM bookings WHERE id=$1", [bookingId]);
  if (!b || !(await familyRole(u.id, b.care_recipient_id))) throw new AppError("Not found", 404);
  const m = await one<any>("SELECT * FROM mandates WHERE booking_id=$1 AND status='active'", [bookingId]); if (!m) return { ok: true };
  await (await gateway()).cancelMandate(m.token_ref).catch(() => {});
  await q("UPDATE mandates SET status='cancelled', updated_at=now() WHERE id=$1", [m.id]);
  await q("INSERT INTO booking_events (booking_id, actor_id, actor_role, message) VALUES ($1,$2,'family',$3)", [bookingId, u.id, "Auto pay switched off. Each week will need to be paid by hand."]);
  return { ok: true };
}
/** Pay one week by hand (no auto pay, or a failed charge). */
export async function payCycle(u: SessionUser, bookingId: string, cycleNo: number) {
  const b = await one<any>("SELECT care_recipient_id, code FROM bookings WHERE id=$1", [bookingId]);
  if (!b || !(await familyRole(u.id, b.care_recipient_id))) throw new AppError("Not found", 404);
  const y = await one<any>("SELECT * FROM billing_cycles WHERE booking_id=$1 AND cycle_no=$2", [bookingId, cycleNo]);
  if (!y || !["due", "failed"].includes(y.status)) throw new AppError("This week is not waiting for payment");
  const o = await (await gateway()).order(y.amount_paise, `${b.code}-W${cycleNo}`);
  if (o.paid) { await cyclePaid(y.id, o.orderId); return { paid: true }; }
  await q("UPDATE billing_cycles SET order_ref=$2 WHERE id=$1", [y.id, o.orderId]);
  return { paid: false, checkout: { orderId: o.orderId, keyId: o.keyId, amountPaise: y.amount_paise, name: "Uday", description: `Week ${cycleNo} of ${b.code}` } };
}

// ───────── no show ─────────
/** One hour before: remind the caregiver. Thirty minutes after start with no arrival: alert family and Uday, open an urgent ticket. */
export async function sweepNoShows() {
  let reminded = 0, alerted = 0;
  const rows = await q<any>("SELECT b.*, c.user_id AS cg_user, c.display_name FROM bookings b JOIN caregivers c ON c.id=b.caregiver_id WHERE b.status IN ('accepted','enroute') AND b.start_date <= current_date + 1 AND b.start_date + b.days >= current_date - 1");
  for (const b of rows) {
    const day = b.days_done + 1; const start = shiftStart(dstr(b.start_date), String(b.start_time).slice(0, 5), b.days_done).getTime(); const now = Date.now();
    const has = async (k: string) => !!(await one("SELECT 1 FROM attendance WHERE booking_id=$1 AND day=$2 AND kind=$3", [b.id, day, k]));
    if (b.status === "accepted" && now > start - 3600e3 && now < start && !(await has("reminder"))) {
      await q("INSERT INTO attendance (booking_id, day, kind) VALUES ($1,$2,'reminder')", [b.id, day]);
      if (b.cg_user) await notify(b.cg_user, "shift_reminder", { bookingId: b.id }); reminded++;
    }
    if (now > start + 30 * 60e3 && !(await has("arrived")) && !(await has("late_alert"))) {
      await tx(async (c) => {
        await c.query("INSERT INTO attendance (booking_id, day, kind) VALUES ($1,$2,'late_alert')", [b.id, day]);
        await c.query("INSERT INTO booking_events (booking_id, actor_role, message) VALUES ($1,'system',$2)", [b.id, `${b.display_name} has not arrived 30 minutes after the start time. Uday is calling her. You can ask for a different caregiver.`]);
        const code = "TKT" + Date.now().toString(36).toUpperCase().slice(-6) + Math.floor(Math.random() * 10);
        await c.query("INSERT INTO tickets (code, booking_id, user_id, category, urgent, sla_due_at) VALUES ($1,$2,$3,'Caregiver did not arrive',true, now() + interval '15 minutes')", [code, b.id, b.payer_id]);
      });
      await tellFamily(b.care_recipient_id, "caregiver_late", { bookingId: b.id });
      await notify(null, "caregiver_late", { bookingId: b.id }); alerted++;
    }
  }
  return { reminded, alerted };
}

// ───────── caregiver profile, reviews, photo ─────────
export async function caregiverProfile(id: string) {
  const c = await one<any>(`SELECT c.id, c.display_name, c.initials, c.tier, c.care_types, c.languages, c.skills, c.area, c.experience_years, c.rating::float, c.rating_count, c.photo_status,
      c.rate_day_paise, c.rate_night_paise, c.rate_live_paise,
      EXISTS(SELECT 1 FROM caregiver_verifications v WHERE v.caregiver_id=c.id AND v.kind='police' AND v.result='clear') AS police_verified,
      EXISTS(SELECT 1 FROM caregiver_verifications v WHERE v.caregiver_id=c.id AND v.kind='identity' AND v.result='clear') AS id_verified
    FROM caregivers c WHERE c.id=$1 AND c.status='active'`, [id]);
  if (!c) throw new AppError("Caregiver not found", 404);
  const reviews = await q<any>(`SELECT r.overall::float, r.areas, r.tags, r.public_text, r.created_at, b.care_type, b.days, u.city
    FROM reviews r JOIN bookings b ON b.id=r.booking_id JOIN users u ON u.id=b.payer_id WHERE b.caregiver_id=$1 ORDER BY r.created_at DESC LIMIT 20`, [id]);
  const avg: Record<string, number> = {};
  for (const [k] of RATING_AREAS) { const v = reviews.map((r) => r.areas?.[k]).filter((x) => typeof x === "number"); if (v.length) avg[k] = Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10; }
  const done = await one<{ n: number }>("SELECT count(*)::int AS n FROM bookings WHERE caregiver_id=$1 AND status IN ('completed','closed')", [id]);
  // Next 30 days: which dates are already taken (booked, leave or day off), so families can plan.
  const today = new Date().toISOString().slice(0, 10);
  const busy = await q<{ d: string }>(`SELECT DISTINCT d::date::text AS d FROM (
      SELECT day AS d FROM caregiver_unavailable WHERE caregiver_id=$1 AND day BETWEEN $2::date AND $2::date + 29
      UNION SELECT generate_series(GREATEST(start_date, $2::date), LEAST(start_date + days - 1, $2::date + 29), interval '1 day') FROM bookings
        WHERE caregiver_id=$1 AND status IN ('offered','accepted','enroute','arrived','active') AND start_date <= $2::date + 29 AND start_date + days - 1 >= $2::date) x ORDER BY 1`, [id, today]);
  const { photo_status, ...rest } = c;
  return { ...rest, photo: photoUrl(c.id, photo_status), completedBookings: done?.n ?? 0, areaAverages: avg, busyDates: busy.map((b) => b.d), calendarFrom: today,
    reviews: reviews.map((r) => ({ overall: r.overall, tags: r.tags, text: r.public_text, month: new Date(r.created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" }), careType: r.care_type, days: r.days, familyCity: r.city })) };
}
export async function photo(id: string, viewer?: SessionUser | null) {
  const c = await one<any>("SELECT c.photo_status, d.storage_key, d.file_key_enc, d.mime FROM caregivers c JOIN caregiver_documents d ON d.id=c.photo_doc_id WHERE c.id=$1", [id]);
  if (!c || (c.photo_status !== "verified" && viewer?.role !== "ops")) throw new AppError("No photo", 404);
  return { body: await getDecrypted(c.storage_key, c.file_key_enc), mime: c.mime };
}
export async function opsPhoto(id: string, verified: boolean) {
  await q("UPDATE caregivers SET photo_status=$2 WHERE id=$1 AND photo_doc_id IS NOT NULL", [id, verified ? "verified" : "rejected"]);
}

// ───────── intro calls ─────────
export const IntroIn = z.object({ caregiverId: z.string().uuid(), recipientId: z.string().uuid(), slots: z.array(z.string()).min(1).max(3), note: z.string().max(300).optional() });
export async function requestIntro(u: SessionUser, i: z.infer<typeof IntroIn>) {
  if (!(await familyRole(u.id, i.recipientId))) throw new AppError("Not allowed", 403);
  const slots = i.slots.map((s) => new Date(s)); if (slots.some((d) => Number.isNaN(d.getTime()) || d.getTime() < Date.now() + 3600e3)) throw new AppError("Choose times at least an hour from now");
  const c = await one<any>("SELECT id, user_id, display_name FROM caregivers WHERE id=$1 AND status='active'", [i.caregiverId]); if (!c) throw new AppError("Caregiver not found", 404);
  if (await one("SELECT 1 FROM intro_requests WHERE family_user=$1 AND caregiver_id=$2 AND status IN ('requested','confirmed')", [u.id, c.id])) throw new AppError("You already have an intro call with this caregiver");
  const r = await one("INSERT INTO intro_requests (family_user, care_recipient_id, caregiver_id, slots, note) VALUES ($1,$2,$3,$4,$5) RETURNING id", [u.id, i.recipientId, c.id, slots, i.note ?? null]);
  if (c.user_id) await notify(c.user_id, "intro_request", { introId: (r as any).id });
  return r;
}
export async function intros(u: SessionUser) {
  if (u.role === "caregiver") { const c = await cgOf(u);
    return q(`SELECT i.id, i.slots, i.chosen, i.note, i.status, i.room_url, r.name AS recipient_name, r.locality FROM intro_requests i JOIN care_recipients r ON r.id=i.care_recipient_id
      WHERE i.caregiver_id=$1 AND i.status IN ('requested','confirmed') ORDER BY i.created_at DESC`, [c.id]); }
  return q(`SELECT i.id, i.slots, i.chosen, i.status, i.room_url, c.display_name, c.id AS caregiver_id FROM intro_requests i JOIN caregivers c ON c.id=i.caregiver_id
    WHERE i.family_user=$1 ORDER BY i.created_at DESC LIMIT 20`, [u.id]);
}
/** The call link comes from the video service chosen in Settings (Jitsi by default, or Daily). If it fails, Uday connects both by phone. */
export async function introAct(u: SessionUser, id: string, a: { action: "choose"; slot: string } | { action: "decline" } | { action: "cancel" } | { action: "done" }) {
  const i = await one<any>("SELECT i.*, c.user_id AS cg_user FROM intro_requests i JOIN caregivers c ON c.id=i.caregiver_id WHERE i.id=$1", [id]);
  if (!i) throw new AppError("Not found", 404);
  const isCg = i.cg_user === u.id, isFam = i.family_user === u.id;
  if (a.action === "choose" && isCg && i.status === "requested") {
    const slot = i.slots.find((s: Date) => new Date(s).toISOString() === new Date(a.slot).toISOString()); if (!slot) throw new AppError("Choose one of the offered times");
    const room = await videoRoom(id).catch(() => null);
    await q("UPDATE intro_requests SET status='confirmed', chosen=$2, room_url=$3 WHERE id=$1", [id, slot, room]);
    await notify(i.family_user, "intro_confirmed", { introId: id }); if (!room) await notify(null, "intro_confirmed", { introId: id, bridge: true });
  } else if (a.action === "decline" && isCg && i.status === "requested") { await q("UPDATE intro_requests SET status='declined' WHERE id=$1", [id]); await notify(i.family_user, "intro_declined", { introId: id }); }
  else if (a.action === "cancel" && (isFam || isCg) && ["requested", "confirmed"].includes(i.status)) await q("UPDATE intro_requests SET status='cancelled' WHERE id=$1", [id]);
  else if (a.action === "done" && u.role === "ops") await q("UPDATE intro_requests SET status='done' WHERE id=$1", [id]);
  else throw new AppError("Not possible now");
  return { ok: true };
}

// ───────── ops view ─────────
export async function opsCare() {
  const relief = await q(`SELECT r.id, r.day::text AS day, r.day_no, r.status, cr.name AS recipient_name, cr.locality, m.display_name AS main_name, c.display_name AS relief_name
    FROM relief_shifts r JOIN bookings b ON b.id=r.booking_id JOIN care_recipients cr ON cr.id=b.care_recipient_id JOIN caregivers m ON m.id=b.caregiver_id LEFT JOIN caregivers c ON c.id=r.caregiver_id
    WHERE r.status IN ('open','offered','accepted') AND r.day <= current_date + 7 ORDER BY r.day LIMIT 50`);
  const billing = await q(`SELECT y.booking_id, y.cycle_no, y.amount_paise, y.attempts, b.code, cr.name AS recipient_name FROM billing_cycles y JOIN bookings b ON b.id=y.booking_id JOIN care_recipients cr ON cr.id=b.care_recipient_id WHERE y.status='failed' ORDER BY y.due_at LIMIT 50`);
  const introCalls = await q(`SELECT i.id, i.chosen, i.room_url, c.display_name, cr.name AS recipient_name FROM intro_requests i JOIN caregivers c ON c.id=i.caregiver_id JOIN care_recipients cr ON cr.id=i.care_recipient_id WHERE i.status='confirmed' ORDER BY i.chosen LIMIT 50`);
  const photos = await q(`SELECT id, display_name FROM caregivers WHERE photo_status='pending' ORDER BY created_at LIMIT 50`);
  const late = await q(`SELECT t.code, t.created_at, b.id AS booking_id, c.display_name, cr.name AS recipient_name FROM tickets t JOIN bookings b ON b.id=t.booking_id JOIN caregivers c ON c.id=b.caregiver_id JOIN care_recipients cr ON cr.id=b.care_recipient_id WHERE t.category='Caregiver did not arrive' AND t.status='open' ORDER BY t.created_at DESC LIMIT 50`);
  return { relief, billing, introCalls, photos, late };
}
