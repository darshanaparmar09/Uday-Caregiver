import type { PoolClient } from "pg";
import {
  assertTransition, cancelQuote, fees, nextMatch, offerWindowMinutes, POLICY, shiftCode, shiftStart, rupees,
  type BookingStatus, type CareType, type Actor,
} from "@uday/core";
import { one, q, tx } from "./db";
import { dec, enc, decJson } from "./crypto";
import { gateway } from "./payments";
import { notify } from "./notify";
import type { SessionUser } from "./auth";

export class AppError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

const RATE_COL: Record<CareType, string> = { day: "rate_day_paise", night: "rate_night_paise", live: "rate_live_paise" };
const START_TIMES: Record<CareType, string[]> = { day: ["07:00", "09:00", "10:00"], night: ["20:00"], live: ["09:00"] };

// ───────── access ─────────
export async function familyRole(userId: string, recipientId: string): Promise<string | null> {
  const r = await one<{ role: string }>("SELECT role FROM family_members WHERE user_id=$1 AND care_recipient_id=$2 AND accepted_at IS NOT NULL", [userId, recipientId]);
  return r?.role ?? null;
}
async function caregiverFor(userId: string) {
  return one<any>("SELECT * FROM caregivers WHERE user_id=$1", [userId]);
}
async function lockBooking(c: PoolClient, id: string) {
  const r = await c.query("SELECT * FROM bookings WHERE id=$1 FOR UPDATE", [id]);
  if (!r.rows[0]) throw new AppError("Booking not found", 404);
  return r.rows[0];
}
async function event(c: PoolClient, b: any, actor: SessionUser | null, role: Actor, to: BookingStatus | null, message: string) {
  await c.query("INSERT INTO booking_events (booking_id, actor_id, actor_role, from_status, to_status, message) VALUES ($1,$2,$3,$4,$5,$6)",
    [b.id, actor?.id ?? null, role, b.status, to, message]);
}
async function ledger(c: PoolClient, bookingId: string, lines: [string, number, number, string][]) {
  const net = lines.reduce((s, [, d, cr]) => s + d - cr, 0);
  if (net !== 0) throw new Error("ledger lines must balance");
  for (const [account, d, cr, reason] of lines)
    await c.query("INSERT INTO ledger_entries (booking_id, account, debit_paise, credit_paise, reason) VALUES ($1,$2,$3,$4,$5)", [bookingId, account, d, cr, reason]);
}
async function payersOf(recipientId: string): Promise<string[]> {
  return (await q<{ user_id: string }>("SELECT user_id FROM family_members WHERE care_recipient_id=$1 AND role IN ('owner','care_manager','payer') AND accepted_at IS NOT NULL", [recipientId])).map((r) => r.user_id);
}
async function tellFamily(recipientId: string, t: Parameters<typeof notify>[1], p: Record<string, unknown>) {
  for (const u of await payersOf(recipientId)) await notify(u, t, p);
}

// ───────── caregivers list ─────────
export async function listCaregivers(careType: CareType, tier?: number) {
  return q(`SELECT c.id, c.display_name, c.initials, c.tier, c.care_types, c.languages, c.skills, c.area, c.experience_years, c.gender,
      c.rating::float, c.rating_count, c.rate_day_paise, c.rate_night_paise, c.rate_live_paise,
      EXISTS(SELECT 1 FROM caregiver_verifications v WHERE v.caregiver_id=c.id AND v.kind='police' AND v.result='clear') AS police_verified,
      EXISTS(SELECT 1 FROM caregiver_verifications v WHERE v.caregiver_id=c.id AND v.kind='identity' AND v.result='clear') AS id_verified
    FROM caregivers c WHERE c.status='active' AND $1 = ANY(c.care_types) ${tier ? "AND c.tier=$2" : ""}
    ORDER BY c.rating DESC`, tier ? [careType, tier] : [careType]);
}

// ───────── create ─────────
export interface CreateInput { recipientId: string; caregiverId: string; careType: CareType; days: number; startDate: string; startTime: string; method: string; note?: string }

export async function createBooking(u: SessionUser, i: CreateInput) {
  const role = await familyRole(u.id, i.recipientId);
  if (!role || !["owner", "care_manager", "payer"].includes(role)) throw new AppError("You cannot book for this person", 403);
  if (![1, 7, 30, 90].includes(i.days)) throw new AppError("Choose one day, a week, a month or a quarter");
  if (!START_TIMES[i.careType].includes(i.startTime)) throw new AppError("Choose a valid start time");
  const cg = await one<any>("SELECT * FROM caregivers WHERE id=$1 AND status='active'", [i.caregiverId]);
  if (!cg || !cg.care_types.includes(i.careType)) throw new AppError("This caregiver does not offer that care");
  const start = shiftStart(i.startDate, i.startTime, 0);
  if (start.getTime() < Date.now() + 2 * 3600e3) throw new AppError("Start must be at least 2 hours from now");
  const f = fees(cg[RATE_COL[i.careType]], i.days);
  const code = "UDY" + Date.now().toString(36).toUpperCase().slice(-6);
  const hold = await gateway().hold(f.totalPaise, code, i.method);
  const windowMin = Number(process.env.OFFER_WINDOW_MINUTES) || offerWindowMinutes(start);

  return tx(async (c) => {
    const b = (await c.query(
      `INSERT INTO bookings (code, payer_id, care_recipient_id, caregiver_id, tier, care_type, days, start_date, start_time, status,
        rate_paise, care_paise, platform_paise, gst_paise, total_paise, policy, offer_expires_at, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'offered',$10,$11,$12,$13,$14,$15, now() + ($16 || ' minutes')::interval, $17) RETURNING *`,
      [code, u.id, i.recipientId, cg.id, cg.tier, i.careType, i.days, i.startDate, i.startTime,
       f.ratePaise, f.carePaise, f.platformPaise, f.gstPaise, f.totalPaise, POLICY, String(windowMin), i.note ?? null])).rows[0];
    await c.query("INSERT INTO payments (booking_id, gateway, gateway_ref, method, amount_paise, status) VALUES ($1,$2,$3,$4,$5,'held')",
      [b.id, gateway().name, hold.gatewayRef, i.method, f.totalPaise]);
    await c.query("INSERT INTO booking_events (booking_id, actor_id, actor_role, to_status, message) VALUES ($1,$2,'family','offered',$3)",
      [b.id, u.id, `Request sent to ${cg.display_name}. ${rupees(f.totalPaise)} held via ${i.method}.`]);
    if (cg.user_id) await notify(cg.user_id, "booking_offer", { bookingId: b.id, expiresAt: b.offer_expires_at });
    return { ...b, checkoutUrl: hold.checkoutUrl };
  });
}

// ───────── read ─────────
/** Booking as the viewer may see it. Codes only for family; address and care profile for caregiver only after acceptance. */
export async function getBooking(u: SessionUser, id: string) {
  const b = await one<any>("SELECT b.*, c.display_name AS caregiver_name, c.initials, c.user_id AS caregiver_user, r.name AS recipient_name, r.locality, r.address_enc, r.access_notes_enc, r.care_needs FROM bookings b JOIN caregivers c ON c.id=b.caregiver_id JOIN care_recipients r ON r.id=b.care_recipient_id WHERE b.id=$1", [id]);
  if (!b) throw new AppError("Booking not found", 404);
  const fam = await familyRole(u.id, b.care_recipient_id);
  const isCg = b.caregiver_user === u.id;
  if (!fam && !isCg && u.role !== "ops") throw new AppError("Booking not found", 404);
  const events = await q("SELECT actor_role, to_status, message, at FROM booking_events WHERE booking_id=$1 ORDER BY id", [id]);
  const logs = (await q<any>("SELECT day, meal, meds, mood, note_enc, at FROM shift_logs WHERE booking_id=$1 ORDER BY at", [id]))
    .map((l) => ({ day: l.day, meal: l.meal, meds: l.meds, mood: l.mood, note: dec(l.note_enc), at: l.at }));
  const proposal = b.proposed_caregiver_id ? await one("SELECT id, display_name, initials, tier, rating::float, area, experience_years, skills, rate_day_paise, rate_night_paise, rate_live_paise FROM caregivers WHERE id=$1", [b.proposed_caregiver_id]) : null;
  const confirmed = ["accepted", "enroute", "arrived", "active"].includes(b.status);
  const out: any = {
    id: b.id, code: b.code, status: b.status, careType: b.care_type, days: b.days, daysDone: b.days_done, tier: b.tier,
    startDate: b.start_date, startTime: b.start_time, offerExpiresAt: b.offer_expires_at, note: b.note,
    caregiver: { id: b.caregiver_id, name: b.caregiver_name, initials: b.initials },
    recipient: { id: b.care_recipient_id, name: b.recipient_name, locality: b.locality },
    fees: { ratePaise: b.rate_paise, carePaise: b.care_paise, platformPaise: b.platform_paise, gstPaise: b.gst_paise, totalPaise: b.total_paise },
    cancelFeePaise: b.cancel_fee_paise, refundPaise: b.refund_paise, proposal, events, logs,
    viewer: fam ? "family" : isCg ? "caregiver" : "ops",
  };
  if (fam) {
    if (b.status === "arrived") out.startCode = dec(b.start_code_enc);
    if (b.status === "active") out.endCode = dec(b.end_code_enc);
    out.review = await one("SELECT stars, tags FROM reviews WHERE booking_id=$1", [id]);
    out.tickets = await q("SELECT code, category, status, urgent, sla_due_at FROM tickets WHERE booking_id=$1 ORDER BY created_at", [id]);
  }
  if (isCg && confirmed) {
    out.address = dec(b.address_enc);
    if (["enroute", "arrived", "active"].includes(b.status)) out.accessNotes = dec(b.access_notes_enc);
    out.careNeeds = b.care_needs;
    out.health = await healthForCaregiver(b.care_recipient_id);
  }
  return out;
}

async function healthForCaregiver(recipientId: string) {
  const consent = await one<any>("SELECT scope FROM consents WHERE care_recipient_id=$1 AND purpose='caregiver_access' AND withdrawn_at IS NULL ORDER BY granted_at DESC LIMIT 1", [recipientId]);
  const h = await one<any>("SELECT * FROM health_profiles WHERE care_recipient_id=$1", [recipientId]);
  if (!h) return { shared: false, message: "Health details not shared by the family" };
  const s = consent?.scope ?? {};
  return {
    shared: true,
    allergies: s.allergies ? decJson(h.allergies_enc) : null, noKnownAllergies: s.allergies ? h.no_known_allergies : null,
    medicines: s.medicines ? decJson(h.medicines_enc) : null,
    conditions: s.conditions ? decJson(h.conditions_enc) : null,
  };
}

export async function listBookings(u: SessionUser) {
  if (u.role === "caregiver") {
    const cg = await caregiverFor(u.id);
    if (!cg) return [];
    return q(`SELECT b.id, b.code, b.status, b.care_type, b.days, b.days_done, b.start_date, b.start_time, b.offer_expires_at, b.rate_paise, b.care_paise, r.locality, r.name AS recipient_name
      FROM bookings b JOIN care_recipients r ON r.id=b.care_recipient_id WHERE b.caregiver_id=$1 ORDER BY b.created_at DESC LIMIT 100`, [cg.id]);
  }
  return q(`SELECT b.id, b.code, b.status, b.care_type, b.days, b.days_done, b.start_date, b.start_time, b.offer_expires_at, b.total_paise, c.display_name AS caregiver_name, c.initials, r.name AS recipient_name
    FROM bookings b JOIN caregivers c ON c.id=b.caregiver_id JOIN care_recipients r ON r.id=b.care_recipient_id
    JOIN family_members f ON f.care_recipient_id=b.care_recipient_id AND f.user_id=$1 AND f.accepted_at IS NOT NULL
    ORDER BY b.created_at DESC LIMIT 100`, [u.id]);
}

// ───────── lifecycle ─────────
async function toProposalTx(c: PoolClient, b: any, actor: SessionUser | null, role: Actor, reason: string) {
  const tried: string[] = Array.from(new Set([...(b.tried ?? []), b.caregiver_id]));
  const pool = (await c.query("SELECT id, tier, care_types, rating::float, status FROM caregivers WHERE status='active'")).rows
    .map((r: any) => ({ id: r.id, tier: r.tier, careTypes: r.care_types, active: true, rating: r.rating }));
  const n = nextMatch(pool, b.tier, b.care_type, tried);
  const unused = Math.floor((b.total_paise * (b.days - b.days_done)) / b.days);
  if (n) {
    assertTransition(b.status, "proposal", role);
    await c.query("UPDATE bookings SET status='proposal', tried=$2, proposed_caregiver_id=$3, offer_expires_at=NULL, updated_at=now() WHERE id=$1", [b.id, tried, n.id]);
    await event(c, b, actor, role, "proposal", reason + " Uday found a same tier caregiver and needs your approval.");
    await tellFamily(b.care_recipient_id, "booking_proposal", { bookingId: b.id });
  } else {
    await releaseTx(c, b, actor, role === "caregiver" ? "system" : role, reason + ` No similar caregiver is free. ${rupees(unused)} released.`, tried);
  }
}

async function releaseTx(c: PoolClient, b: any, actor: SessionUser | null, role: Actor, msg: string, tried?: string[]) {
  const pay = (await c.query("SELECT * FROM payments WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [b.id])).rows[0];
  const unused = Math.floor((b.total_paise * (b.days - b.days_done)) / b.days);
  if (pay?.status === "held") { await gateway().release(pay.gateway_ref); await c.query("UPDATE payments SET status='released', updated_at=now() WHERE id=$1", [pay.id]); }
  else if (pay && unused > 0) { await gateway().refund(pay.gateway_ref, unused); await c.query("UPDATE payments SET refunded_paise=refunded_paise+$2, status='partially_refunded', updated_at=now() WHERE id=$1", [pay.id, unused]);
    await ledger(c, b.id, [["escrow", unused, 0, "refund unused days"], ["family_refunds", 0, unused, "refund unused days"]]); }
  await c.query("UPDATE bookings SET status='released', refund_paise=$2, tried=COALESCE($3, tried), proposed_caregiver_id=NULL, offer_expires_at=NULL, updated_at=now() WHERE id=$1", [b.id, unused, tried ?? null]);
  await event(c, b, actor, role, "released", msg);
  await tellFamily(b.care_recipient_id, "booking_released", { bookingId: b.id });
}

/** Expire unanswered offers. Called by the cron endpoint every minute, and lazily on reads. */
export async function sweepOffers() {
  const due = await q<{ id: string }>("SELECT id FROM bookings WHERE status='offered' AND offer_expires_at < now() LIMIT 50");
  for (const { id } of due) {
    await tx(async (c) => {
      const b = await lockBooking(c, id);
      if (b.status !== "offered" || new Date(b.offer_expires_at) > new Date()) return;
      const cg = (await c.query("SELECT display_name FROM caregivers WHERE id=$1", [b.caregiver_id])).rows[0];
      await toProposalTx(c, b, null, "system", `${cg.display_name} did not respond in time.`);
    });
  }
  return due.length;
}

export type Action =
  | { action: "accept" } | { action: "decline"; reason: string }
  | { action: "approve" } | { action: "reject" }
  | { action: "cancel" } | { action: "reschedule"; startDate: string }
  | { action: "enroute"; lat?: number; lng?: number } | { action: "arrive"; lat?: number; lng?: number }
  | { action: "start"; code: string } | { action: "log"; meal: boolean; meds: boolean; mood: string; note?: string }
  | { action: "end"; code: string } | { action: "rate"; stars: number; tags: string[]; note?: string }
  | { action: "ticket"; category: string; text?: string } | { action: "cg_cancel" };

export async function act(u: SessionUser, id: string, a: Action) {
  await sweepOffers();
  const head = await one<any>("SELECT b.care_recipient_id, c.user_id AS cg_user FROM bookings b JOIN caregivers c ON c.id=b.caregiver_id WHERE b.id=$1", [id]);
  if (!head) throw new AppError("Booking not found", 404);
  const fam = await familyRole(u.id, head.care_recipient_id);
  const isCg = head.cg_user === u.id;
  const famActs = ["approve", "reject", "cancel", "reschedule", "rate", "ticket"];
  const cgActs = ["accept", "decline", "enroute", "arrive", "start", "log", "end", "cg_cancel"];
  if (famActs.includes(a.action) && !(fam && ["owner", "care_manager", "payer"].includes(fam))) throw new AppError("Not allowed", 403);
  if (cgActs.includes(a.action) && !isCg) throw new AppError("Not allowed", 403);

  return tx(async (c) => {
    const b = await lockBooking(c, id);
    const cgName = (await c.query("SELECT display_name FROM caregivers WHERE id=$1", [b.caregiver_id])).rows[0].display_name;
    const first = cgName.split(" ")[0];
    switch (a.action) {
      case "accept": {
        assertTransition(b.status, "accepted", "caregiver");
        const pay = (await c.query("SELECT * FROM payments WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [b.id])).rows[0];
        await gateway().capture(pay.gateway_ref, b.total_paise);
        await c.query("UPDATE payments SET status='captured', captured_paise=$2, updated_at=now() WHERE id=$1", [pay.id, b.total_paise]);
        await ledger(c, b.id, [["family_payments", b.total_paise, 0, "captured on acceptance"], ["escrow", 0, b.total_paise, "captured on acceptance"]]);
        await c.query("UPDATE bookings SET status='accepted', start_code_enc=$2, offer_expires_at=NULL, updated_at=now() WHERE id=$1", [b.id, enc(shiftCode())]);
        await event(c, b, u, "caregiver", "accepted", `${cgName} accepted. ${rupees(b.total_paise)} captured.`);
        await tellFamily(b.care_recipient_id, "booking_accepted", { bookingId: b.id });
        break;
      }
      case "decline":
        await toProposalTx(c, b, u, "caregiver", `${cgName} declined: ${a.reason}.`);
        break;
      case "cg_cancel":
        if (b.status !== "accepted") throw new AppError("You can only cancel before travelling");
        await toProposalTx(c, b, u, "caregiver", `${cgName} cancelled after accepting. Uday is arranging a substitute.`);
        break;
      case "approve": {
        assertTransition(b.status, "offered", "family");
        const p = (await c.query("SELECT * FROM caregivers WHERE id=$1", [b.proposed_caregiver_id])).rows[0];
        if (!p) throw new AppError("No proposal to approve");
        const f = fees(p[RATE_COL[b.care_type as CareType]], b.days);
        if (f.totalPaise !== b.total_paise) {
          // Price differs: adjust the hold. Gateway adapters treat a new hold for the difference as one payment.
          const pay = (await c.query("SELECT * FROM payments WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1", [b.id])).rows[0];
          if (pay.status === "held") { await gateway().release(pay.gateway_ref); await c.query("UPDATE payments SET status='released' WHERE id=$1", [pay.id]); }
          const h = await gateway().hold(f.totalPaise, b.code, pay.method);
          await c.query("INSERT INTO payments (booking_id, gateway, gateway_ref, method, amount_paise, status) VALUES ($1,$2,$3,$4,$5,'held')", [b.id, gateway().name, h.gatewayRef, pay.method, f.totalPaise]);
        }
        const start = shiftStart(String(b.start_date).slice(0, 10), String(b.start_time).slice(0, 5), b.days_done);
        const win = Number(process.env.OFFER_WINDOW_MINUTES) || offerWindowMinutes(start);
        await c.query(`UPDATE bookings SET status='offered', caregiver_id=$2, proposed_caregiver_id=NULL, rate_paise=$3, care_paise=$4, platform_paise=$5, gst_paise=$6, total_paise=$7,
          offer_expires_at=now() + ($8 || ' minutes')::interval, updated_at=now() WHERE id=$1`, [b.id, p.id, f.ratePaise, f.carePaise, f.platformPaise, f.gstPaise, f.totalPaise, String(win)]);
        await event(c, b, u, "family", "offered", `You approved ${p.display_name}. Request sent.` + (f.totalPaise !== b.total_paise ? ` New total ${rupees(f.totalPaise)}.` : ""));
        if (p.user_id) await notify(p.user_id, "booking_offer", { bookingId: b.id });
        break;
      }
      case "reject":
        assertTransition(b.status, "released", "family");
        await releaseTx(c, b, u, "family", "You declined the substitute. Hold released.");
        break;
      case "cancel": {
        assertTransition(b.status, "cancelled", "family");
        const next = shiftStart(String(b.start_date).slice(0, 10), String(b.start_time).slice(0, 5), b.days_done);
        const qte = cancelQuote({ status: b.status, days: b.days, daysDone: b.days_done, totalPaise: b.total_paise, ratePaise: b.rate_paise, nextShiftStart: next });
        const pay = (await c.query("SELECT * FROM payments WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [b.id])).rows[0];
        if (pay.status === "held") { await gateway().release(pay.gateway_ref); await c.query("UPDATE payments SET status='released', updated_at=now() WHERE id=$1", [pay.id]); }
        else {
          if (qte.refundPaise > 0) { await gateway().refund(pay.gateway_ref, qte.refundPaise); await c.query("UPDATE payments SET refunded_paise=refunded_paise+$2, status='partially_refunded', updated_at=now() WHERE id=$1", [pay.id, qte.refundPaise]); }
          const lines: [string, number, number, string][] = [];
          if (qte.refundPaise) lines.push(["escrow", qte.refundPaise, 0, "cancellation refund"], ["family_refunds", 0, qte.refundPaise, "cancellation refund"]);
          if (qte.feePaise) lines.push(["escrow", qte.feePaise, 0, "late cancellation fee"], [`caregiver:${b.caregiver_id}`, 0, qte.feePaise, "late cancellation fee"]);
          if (lines.length) await ledger(c, b.id, lines);
        }
        await c.query("UPDATE bookings SET status='cancelled', cancel_fee_paise=$2, refund_paise=$3, offer_expires_at=NULL, updated_at=now() WHERE id=$1", [b.id, qte.feePaise, qte.refundPaise]);
        await event(c, b, u, "family", "cancelled", `You cancelled. ${qte.feePaise ? "Fee " + rupees(qte.feePaise) + "." : "No fee."} Refund ${rupees(qte.refundPaise)}.`);
        const cgUser = (await c.query("SELECT user_id FROM caregivers WHERE id=$1", [b.caregiver_id])).rows[0].user_id;
        if (cgUser) await notify(cgUser, "booking_cancelled", { bookingId: b.id });
        break;
      }
      case "reschedule": {
        if (b.status !== "accepted" || b.days_done > 0) throw new AppError("Only a booking that has not started can be rescheduled");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a.startDate)) throw new AppError("Invalid date");
        const next = shiftStart(String(b.start_date).slice(0, 10), String(b.start_time).slice(0, 5), 0);
        const qte = cancelQuote({ status: b.status, days: b.days, daysDone: 0, totalPaise: b.total_paise, ratePaise: b.rate_paise, nextShiftStart: next });
        if (shiftStart(a.startDate, String(b.start_time).slice(0, 5), 0).getTime() < Date.now() + 2 * 3600e3) throw new AppError("New start must be at least 2 hours away");
        await c.query("UPDATE bookings SET start_date=$2, cancel_fee_paise=cancel_fee_paise+$3, updated_at=now() WHERE id=$1", [b.id, a.startDate, qte.feePaise]);
        await event(c, b, u, "family", null, `Rescheduled to start ${a.startDate}. ${qte.feePaise ? "Fee " + rupees(qte.feePaise) + "." : "No fee."}`);
        break;
      }
      case "enroute":
        assertTransition(b.status, "enroute", "caregiver");
        await c.query("UPDATE bookings SET status='enroute', updated_at=now() WHERE id=$1", [b.id]);
        await c.query("INSERT INTO attendance (booking_id, day, kind, lat, lng) VALUES ($1,$2,'enroute',$3,$4)", [b.id, b.days_done + 1, a.lat ?? null, a.lng ?? null]);
        await event(c, b, u, "caregiver", "enroute", `${first} started travelling.`);
        await tellFamily(b.care_recipient_id, "caregiver_enroute", { bookingId: b.id });
        break;
      case "arrive": {
        assertTransition(b.status, "arrived", "caregiver");
        const r = (await c.query("SELECT lat, lng FROM care_recipients WHERE id=$1", [b.care_recipient_id])).rows[0];
        const geofenceM = Number(process.env.GEOFENCE_METRES ?? 150);
        if (r.lat != null && a.lat != null && a.lng != null && distanceM(r.lat, r.lng, a.lat, a.lng) > geofenceM)
          throw new AppError(`You need to be within ${geofenceM} metres of the home to mark arrival`);
        await c.query("UPDATE bookings SET status='arrived', updated_at=now() WHERE id=$1", [b.id]);
        await c.query("INSERT INTO attendance (booking_id, day, kind, lat, lng) VALUES ($1,$2,'arrived',$3,$4)", [b.id, b.days_done + 1, a.lat ?? null, a.lng ?? null]);
        await event(c, b, u, "caregiver", "arrived", `${first} arrived.`);
        await tellFamily(b.care_recipient_id, "caregiver_arrived", { bookingId: b.id });
        break;
      }
      case "start":
        assertTransition(b.status, "active", "caregiver");
        if (dec(b.start_code_enc) !== a.code) throw new AppError("Code does not match. Ask the family to read it again.");
        await c.query("UPDATE bookings SET status='active', end_code_enc=$2, updated_at=now() WHERE id=$1", [b.id, enc(shiftCode())]);
        await c.query("INSERT INTO attendance (booking_id, day, kind) VALUES ($1,$2,'start')", [b.id, b.days_done + 1]);
        await event(c, b, u, "caregiver", "active", `Shift ${b.days_done + 1} started, code verified.`);
        await tellFamily(b.care_recipient_id, "shift_started", { bookingId: b.id });
        break;
      case "log": {
        if (b.status !== "active") throw new AppError("Logs can only be added during a shift");
        const cgId = b.caregiver_id;
        await c.query("INSERT INTO shift_logs (booking_id, day, caregiver_id, meal, meds, mood, note_enc) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [b.id, b.days_done + 1, cgId, a.meal, a.meds, String(a.mood).slice(0, 40), enc(a.note?.slice(0, 1000), "health")]);
        await tellFamily(b.care_recipient_id, "shift_log", { bookingId: b.id });
        break;
      }
      case "end": {
        if (b.status !== "active") throw new AppError("No shift in progress");
        const logged = (await c.query("SELECT 1 FROM shift_logs WHERE booking_id=$1 AND day=$2 LIMIT 1", [b.id, b.days_done + 1])).rowCount;
        if (!logged) throw new AppError("Save a shift log entry first");
        if (dec(b.end_code_enc) !== a.code) throw new AppError("Code does not match.");
        const day = b.days_done + 1;
        const last = day === b.days;
        // Release one day from escrow: caregiver rate, Uday fee and GST. Rounding remainder lands on the last day.
        const pf = last ? b.platform_paise - Math.floor(b.platform_paise / b.days) * (b.days - 1) : Math.floor(b.platform_paise / b.days);
        const gst = last ? b.gst_paise - Math.floor(b.gst_paise / b.days) * (b.days - 1) : Math.floor(b.gst_paise / b.days);
        await ledger(c, b.id, [["escrow", b.rate_paise + pf + gst, 0, `shift ${day} completed`], [`caregiver:${b.caregiver_id}`, 0, b.rate_paise, `shift ${day} pay`], ["uday_fee", 0, pf, `shift ${day} fee`], ["gst_payable", 0, gst, `shift ${day} GST`]]);
        await c.query("INSERT INTO attendance (booking_id, day, kind) VALUES ($1,$2,'end')", [b.id, day]);
        const nextStatus: BookingStatus = last ? "completed" : "accepted";
        assertTransition("active", nextStatus, "caregiver");
        await c.query("UPDATE bookings SET status=$2, days_done=$3, start_code_enc=$4, end_code_enc=NULL, updated_at=now() WHERE id=$1",
          [b.id, nextStatus, day, last ? null : enc(shiftCode())]);
        await event(c, b, u, "caregiver", nextStatus, `Shift ${day} of ${b.days} completed. ${rupees(b.rate_paise)} added to ${first}'s payout.` + (last ? " All shifts done." : " Next shift scheduled."));
        await tellFamily(b.care_recipient_id, last ? "rate_request" : "shift_ended", { bookingId: b.id });
        break;
      }
      case "rate": {
        assertTransition(b.status, "closed", "family");
        const s = Math.round(a.stars);
        if (s < 1 || s > 5) throw new AppError("Stars must be 1 to 5");
        await c.query("INSERT INTO reviews (booking_id, stars, tags, note_enc) VALUES ($1,$2,$3,$4)", [b.id, s, (a.tags ?? []).slice(0, 8), enc(a.note, "pii")]);
        await c.query("UPDATE caregivers SET rating = ROUND(((rating*rating_count)+$2)/(rating_count+1), 1), rating_count=rating_count+1 WHERE id=$1", [b.caregiver_id, s]);
        await c.query("UPDATE bookings SET status='closed', updated_at=now() WHERE id=$1", [b.id]);
        await event(c, b, u, "family", "closed", `You rated ${s} stars.`);
        if (s <= 3) await openTicket(c, u, b.id, "Low rating follow up", undefined);
        break;
      }
      case "ticket":
        await openTicket(c, u, b.id, a.category, a.text);
        await event(c, b, u, "family", null, `Help request: ${a.category}.`);
        break;
      default: throw new AppError("Unknown action");
    }
    return { ok: true };
  });
}

async function openTicket(c: PoolClient, u: SessionUser, bookingId: string, category: string, text?: string) {
  const urgent = /safety|late|did not arrive/i.test(category);
  const code = "TKT" + Date.now().toString(36).toUpperCase().slice(-6);
  await c.query("INSERT INTO tickets (code, booking_id, user_id, category, text_enc, urgent, sla_due_at) VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' minutes')::interval)",
    [code, bookingId, u.id, category.slice(0, 80), enc(text?.slice(0, 2000)), urgent, urgent ? "15" : "120"]);
  await notify(null, "ticket_opened", { code, urgent, bookingId });
}

export async function quote(u: SessionUser, id: string) {
  const b = await getBooking(u, id);
  if (b.viewer !== "family") throw new AppError("Not allowed", 403);
  return cancelQuote({ status: b.status, days: b.days, daysDone: b.daysDone, totalPaise: b.fees.totalPaise, ratePaise: b.fees.ratePaise,
    nextShiftStart: shiftStart(String(b.startDate instanceof Date ? b.startDate.toISOString() : b.startDate).slice(0, 10), String(b.startTime).slice(0, 5), b.daysDone) });
}

function distanceM(a: number, b: number, c: number, d: number) {
  const R = 6371e3, r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export { START_TIMES };
