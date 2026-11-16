import type { PoolClient } from "pg";
import {
  assertTransition, cancelQuote, fees, nextMatch, offerWindowMinutes, POLICY, shiftCode, shiftStart, rupees, checklistFor, vitalsFlags, CHECKLIST_IDS, careNeed, homeCommitments, HOME_COMMITMENTS_VERSION, overallRating, billingCycles, reliefDays, WEEKLY_BILLING_FROM_DAYS, WEEKDAYS, postProblem, type RatingArea,
  type BookingStatus, type CareType, type Actor,
} from "@uday/core";
import { one, q, tx } from "./db";
import { dec, enc, decJson, encJson } from "./crypto";
import { gateway } from "./payments";
import { notify } from "./notify";
import type { SessionUser } from "./auth";

export class AppError extends Error { constructor(msg: string, public status = 400, public data?: Record<string, unknown>) { super(msg); } }

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
export async function lockBooking(c: PoolClient, id: string) {
  const r = await c.query("SELECT * FROM bookings WHERE id=$1 FOR UPDATE", [id]);
  if (!r.rows[0]) throw new AppError("Booking not found", 404);
  return r.rows[0];
}
export async function event(c: PoolClient, b: any, actor: SessionUser | null, role: Actor, to: BookingStatus | null, message: string) {
  await c.query("INSERT INTO booking_events (booking_id, actor_id, actor_role, from_status, to_status, message) VALUES ($1,$2,$3,$4,$5,$6)",
    [b.id, actor?.id ?? null, role, b.status, to, message]);
}
export async function ledger(c: PoolClient, bookingId: string, lines: [string, number, number, string][]) {
  const net = lines.reduce((s, [, d, cr]) => s + d - cr, 0);
  if (net !== 0) throw new Error("ledger lines must balance");
  for (const [account, d, cr, reason] of lines)
    await c.query("INSERT INTO ledger_entries (booking_id, account, debit_paise, credit_paise, reason) VALUES ($1,$2,$3,$4,$5)", [bookingId, account, d, cr, reason]);
}
async function payersOf(recipientId: string): Promise<string[]> {
  return (await q<{ user_id: string }>("SELECT user_id FROM family_members WHERE care_recipient_id=$1 AND role IN ('owner','care_manager','payer') AND accepted_at IS NOT NULL", [recipientId])).map((r) => r.user_id);
}
export async function tellFamily(recipientId: string, t: Parameters<typeof notify>[1], p: Record<string, unknown>) {
  for (const u of await payersOf(recipientId)) await notify(u, t, p);
}

// ───────── availability ─────────
/** Caregivers who cannot take care from startDate for `days` days: marked off, on leave, or already booked. */
export async function busyCaregivers(c: { query: PoolClient["query"] } | null, startDate: string, days: number, excludeBooking?: string): Promise<Set<string>> {
  const sql = `SELECT caregiver_id FROM caregiver_unavailable WHERE day BETWEEN $1::date AND $1::date + ($2::int - 1)
    UNION SELECT caregiver_id FROM bookings WHERE status IN ('accepted','enroute','arrived','active') AND ($3::uuid IS NULL OR id <> $3::uuid)
      AND start_date <= $1::date + ($2::int - 1) AND start_date + days - 1 >= $1::date`;
  const rows = c ? (await c.query(sql, [startDate, days, excludeBooking ?? null])).rows : await q(sql, [startDate, days, excludeBooking ?? null]);
  return new Set(rows.map((r: any) => r.caregiver_id));
}

// ───────── caregivers list ─────────
export async function listCaregivers(careType: CareType, tier?: number) {
  return q(`SELECT c.id, c.display_name, c.initials, c.tier, c.care_types, c.languages, c.skills, c.area, c.experience_years, c.gender,
      c.rating::float, c.rating_count, c.rate_day_paise, c.rate_night_paise, c.rate_live_paise, (c.photo_status='verified') AS photo,
      EXISTS(SELECT 1 FROM caregiver_verifications v WHERE v.caregiver_id=c.id AND v.kind='police' AND v.result='clear') AS police_verified,
      EXISTS(SELECT 1 FROM caregiver_verifications v WHERE v.caregiver_id=c.id AND v.kind='identity' AND v.result='clear') AS id_verified
    FROM caregivers c WHERE c.status='active' AND $1 = ANY(c.care_types) ${tier ? "AND c.tier=$2" : ""}
    ORDER BY c.rating DESC`, tier ? [careType, tier] : [careType]);
}

// ───────── create ─────────
export interface CreateInput { recipientId: string; caregiverId: string; careType: CareType; days: number; startDate: string; startTime: string; method: string; note?: string; careNeed: string; careNeedNote?: string; homeCommitments: string[]; dayOff?: number }

export async function createBooking(u: SessionUser, i: CreateInput) {
  const role = await familyRole(u.id, i.recipientId);
  if (!role || !["owner", "care_manager", "payer"].includes(role)) throw new AppError("You cannot book for this person", 403);
  if (![1, 7, 30, 90].includes(i.days)) throw new AppError("Choose one day, a week, a month or a quarter");
  if (!START_TIMES[i.careType].includes(i.startTime)) throw new AppError("Choose a valid start time");
  const need = careNeed(i.careNeed);
  if (!need) throw new AppError("Choose what care is needed");
  if (need.id === "other" && !i.careNeedNote?.trim()) throw new AppError("Tell us briefly what care is needed");
  const required = homeCommitments(i.careType);
  const missing = required.filter((h) => !i.homeCommitments?.includes(h.id));
  if (missing.length) throw new AppError("Please confirm everything the caregiver needs at home", 400, { missing: missing.map((m) => m.id) });
  // Rehire rule: a family must rate this caregiver's last completed care before paying for new care.
  const unrated = await one<{ id: string; code: string }>(`SELECT b.id, b.code FROM bookings b JOIN family_members f ON f.care_recipient_id=b.care_recipient_id AND f.user_id=$1
    WHERE b.caregiver_id=$2 AND b.status='completed' ORDER BY b.updated_at DESC LIMIT 1`, [u.id, i.caregiverId]);
  if (unrated) throw new AppError("Please rate this caregiver's last care before booking again.", 409, { needsRating: unrated.id, code: unrated.code });
  const cg = await one<any>("SELECT * FROM caregivers WHERE id=$1 AND status='active'", [i.caregiverId]);
  if (!cg || !cg.care_types.includes(i.careType)) throw new AppError("This caregiver does not offer that care");
  const start = shiftStart(i.startDate, i.startTime, 0);
  if (start.getTime() < Date.now() + 2 * 3600e3) throw new AppError("Start must be at least 2 hours from now");
  if ((await busyCaregivers(null, i.startDate, i.days)).has(cg.id)) throw new AppError(`${cg.display_name} is not available on these dates. Choose another date or caregiver.`);
  const live = i.careType === "live";
  if (live && i.days >= 7 && (i.dayOff == null || i.dayOff < 0 || i.dayOff > 6)) throw new AppError("Choose the caregiver's weekly day off");
  const dayOff = live && i.days >= 7 ? i.dayOff! : null;
  const rate = cg[RATE_COL[i.careType]];
  const weekly = i.days >= WEEKLY_BILLING_FROM_DAYS;
  const cycles = weekly ? billingCycles(rate, i.days) : null;
  const one_ = fees(rate, i.days);
  // Weekly billing: totals are the sum of the weekly cycles, so every rupee charged matches a cycle.
  const f = cycles ? { ...one_, carePaise: cycles.reduce((t, x) => t + x.care, 0), platformPaise: cycles.reduce((t, x) => t + x.platform, 0), gstPaise: cycles.reduce((t, x) => t + x.gst, 0), totalPaise: cycles.reduce((t, x) => t + x.amount, 0) } : one_;
  const holdAmount = cycles ? cycles[0].amount : f.totalPaise;
  const code = "UDY" + Date.now().toString(36).toUpperCase().slice(-6);
  const hold = await gateway().hold(holdAmount, code, i.method);
  const windowMin = Number(process.env.OFFER_WINDOW_MINUTES) || offerWindowMinutes(start);

  return tx(async (c) => {
    const b = (await c.query(
      `INSERT INTO bookings (code, payer_id, care_recipient_id, caregiver_id, tier, care_type, days, start_date, start_time, status,
        rate_paise, care_paise, platform_paise, gst_paise, total_paise, policy, offer_expires_at, note, care_need, care_need_note, home_commitments, home_commitments_version, billing, day_off)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'offered',$10,$11,$12,$13,$14,$15, now() + ($16 || ' minutes')::interval, $17, $18, $19, $20, $21, $22, $23) RETURNING *`,
      [code, u.id, i.recipientId, cg.id, cg.tier, i.careType, i.days, i.startDate, i.startTime,
       f.ratePaise, f.carePaise, f.platformPaise, f.gstPaise, f.totalPaise, POLICY, String(windowMin), i.note ?? null,
       need.id, i.careNeedNote?.slice(0, 200) ?? null, JSON.stringify(required), HOME_COMMITMENTS_VERSION, weekly ? "weekly" : "upfront", dayOff])).rows[0];
    await c.query("INSERT INTO payments (booking_id, gateway, gateway_ref, method, amount_paise, status) VALUES ($1,$2,$3,$4,$5,'held')",
      [b.id, gateway().name, hold.gatewayRef, i.method, holdAmount]);
    for (const cy of cycles ?? []) {
      const due = new Date(Math.max(Date.now(), shiftStart(i.startDate, i.startTime, cy.fromDay - 1).getTime() - 48 * 3600e3));
      await c.query(`INSERT INTO billing_cycles (booking_id, cycle_no, from_day, to_day, care_paise, platform_paise, gst_paise, amount_paise, status, due_at, gateway_ref)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [b.id, cy.cycleNo, cy.fromDay, cy.toDay, cy.care, cy.platform, cy.gst, cy.amount, cy.cycleNo === 1 ? "held" : "due", due, cy.cycleNo === 1 ? hold.gatewayRef : null]);
    }
    await c.query("INSERT INTO booking_events (booking_id, actor_id, actor_role, to_status, message) VALUES ($1,$2,'family','offered',$3)",
      [b.id, u.id, `Request sent to ${cg.display_name}. ` + (weekly ? `${rupees(holdAmount)} for the first week held via ${i.method}. Each following week is charged two days before it starts.` : `${rupees(f.totalPaise)} held via ${i.method}.`)
        + (dayOff != null ? ` Weekly day off: ${WEEKDAYS[dayOff]}, covered by a relief caregiver.` : "")]);
    if (cg.user_id) await notify(cg.user_id, "booking_offer", { bookingId: b.id, expiresAt: b.offer_expires_at });
    return { ...b, checkoutUrl: hold.checkoutUrl };
  });
}

// ───────── read ─────────
/** Booking as the viewer may see it. Codes only for family; address and care profile for caregiver only after acceptance. */
export async function getBooking(u: SessionUser, id: string) {
  const b = await one<any>("SELECT b.*, c.display_name AS caregiver_name, c.initials, c.user_id AS caregiver_user, c.photo_status, r.name AS recipient_name, r.locality, r.address_enc, r.access_notes_enc, r.care_needs FROM bookings b JOIN caregivers c ON c.id=b.caregiver_id JOIN care_recipients r ON r.id=b.care_recipient_id WHERE b.id=$1", [id]);
  if (!b) throw new AppError("Booking not found", 404);
  const fam = await familyRole(u.id, b.care_recipient_id);
  const isCg = b.caregiver_user === u.id;
  if (!fam && !isCg && u.role !== "ops") throw new AppError("Booking not found", 404);
  const events = await q("SELECT actor_role, to_status, message, at FROM booking_events WHERE booking_id=$1 ORDER BY id", [id]);
  const logs = (await q<any>("SELECT day, meal, meds, mood, note_enc, checklist_enc, vitals_enc, flags, at FROM shift_logs WHERE booking_id=$1 ORDER BY at", [id]))
    .map((l) => ({ day: l.day, meal: l.meal, meds: l.meds, mood: l.mood, note: dec(l.note_enc), checklist: decJson<Record<string, string>>(l.checklist_enc), vitals: decJson(l.vitals_enc), flags: l.flags, at: l.at }));
  const proposal = b.proposed_caregiver_id ? await one("SELECT id, display_name, initials, tier, rating::float, area, experience_years, skills, rate_day_paise, rate_night_paise, rate_live_paise FROM caregivers WHERE id=$1", [b.proposed_caregiver_id]) : null;
  const confirmed = ["accepted", "enroute", "arrived", "active"].includes(b.status);
  const out: any = {
    id: b.id, code: b.code, status: b.status, careType: b.care_type, days: b.days, daysDone: b.days_done, tier: b.tier,
    startDate: b.start_date, startTime: b.start_time, offerExpiresAt: b.offer_expires_at, note: b.note,
    caregiver: { id: b.caregiver_id, name: b.caregiver_name, initials: b.initials, photo: b.photo_status === "verified" ? `/api/caregivers/${b.caregiver_id}/photo` : null },
    recipient: { id: b.care_recipient_id, name: b.recipient_name, locality: b.locality },
    fees: { ratePaise: b.rate_paise, carePaise: b.care_paise, platformPaise: b.platform_paise, gstPaise: b.gst_paise, totalPaise: b.total_paise },
    cancelFeePaise: b.cancel_fee_paise, refundPaise: b.refund_paise, proposal, events, logs,
    viewer: fam ? "family" : isCg ? "caregiver" : "ops",
    careNeed: b.care_need ? { id: b.care_need, label: careNeed(b.care_need)?.label ?? b.care_need, note: b.care_need_note } : null,
    homeCommitments: b.home_commitments ?? [],
    billing: b.billing, dayOff: b.day_off, dayOffName: b.day_off != null ? WEEKDAYS[b.day_off] : null, away: b.away, paidPaise: b.paid_paise, isLive: b.care_type === "live",
  };
  const relief = await q<any>(`SELECT r.id, r.day_no, r.day::text AS day, r.status, r.start_code_enc, r.end_code_enc, c.id AS cg_id, c.display_name, c.photo_status
    FROM relief_shifts r LEFT JOIN caregivers c ON c.id=r.caregiver_id WHERE r.booking_id=$1 AND r.status<>'cancelled' ORDER BY r.day_no`, [id]);
  out.relief = relief.map((r) => ({ id: r.id, dayNo: r.day_no, day: r.day, status: r.status, caregiver: r.cg_id && ["accepted", "arrived", "active", "done"].includes(r.status) ? { id: r.cg_id, name: r.display_name, photo: r.photo_status === "verified" ? `/api/caregivers/${r.cg_id}/photo` : null } : null }));
  out.extension = await one("SELECT id, days, status, expires_at FROM extension_requests WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1", [id]);
  if (fam) {
    // Codes the family reads out at the door. Live in care: start code on day 1, end code on the last day only.
    const codes: { kind: string; label: string; code: string | null }[] = [];
    const lastDay = b.days_done + 1 === b.days;
    if (b.status === "arrived") codes.push({ kind: "start", label: `Start code for ${b.caregiver_name.split(" ")[0]}`, code: dec(b.start_code_enc) });
    if (b.status === "active" && !b.away && (b.care_type !== "live" || lastDay)) codes.push({ kind: "end", label: "End code, at the end of care", code: dec(b.end_code_enc) });
    const rt = relief.find((r) => r.day_no === b.days_done + 1 && ["arrived", "active"].includes(r.status));
    if (rt?.status === "arrived") codes.push({ kind: "relief_start", label: `Start code for relief caregiver ${rt.display_name.split(" ")[0]}`, code: dec(rt.start_code_enc) });
    if (rt?.status === "active") codes.push({ kind: "relief_end", label: `End code for ${rt.display_name.split(" ")[0]} at the end of the relief day`, code: dec(rt.end_code_enc) });
    if (b.away && b.return_code_enc) codes.push({ kind: "return", label: `Welcome back code for ${b.caregiver_name.split(" ")[0]}`, code: dec(b.return_code_enc) });
    out.codes = codes;
    out.startCode = codes.find((x) => x.kind === "start")?.code; out.endCode = codes.find((x) => x.kind === "end")?.code;
    out.cycles = await q("SELECT cycle_no, from_day, to_day, amount_paise, status, due_at, paid_at FROM billing_cycles WHERE booking_id=$1 ORDER BY cycle_no", [id]);
    out.dayChecks = await q("SELECT day, ok FROM day_checks WHERE booking_id=$1 ORDER BY day", [id]);
    out.review = await one("SELECT stars, tags FROM reviews WHERE booking_id=$1", [id]);
    out.tickets = await q("SELECT code, category, status, urgent, sla_due_at FROM tickets WHERE booking_id=$1 ORDER BY created_at", [id]);
  }
  if (isCg && confirmed) {
    out.address = dec(b.address_enc);
    if (["enroute", "arrived", "active"].includes(b.status)) out.accessNotes = dec(b.access_notes_enc);
    out.careNeeds = b.care_needs;
    out.checklistTemplate = checklistFor(b.tier);
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
    const rows = await q<any>(`SELECT b.id, b.code, b.status, b.care_type, b.days, b.days_done, b.start_date, b.start_time, b.offer_expires_at, b.rate_paise, b.care_paise, b.care_need, b.care_need_note, r.locality, r.name AS recipient_name
      FROM bookings b JOIN care_recipients r ON r.id=b.care_recipient_id WHERE b.caregiver_id=$1 ORDER BY b.created_at DESC LIMIT 100`, [cg.id]);
    return rows.map((r) => ({ ...r, care_need_label: r.care_need ? careNeed(r.care_need)?.label ?? r.care_need : null }));
  }
  return q(`SELECT b.id, b.code, b.status, b.care_type, b.days, b.days_done, b.start_date, b.start_time, b.offer_expires_at, b.total_paise, c.display_name AS caregiver_name, c.initials, r.name AS recipient_name
    FROM bookings b JOIN caregivers c ON c.id=b.caregiver_id JOIN care_recipients r ON r.id=b.care_recipient_id
    JOIN family_members f ON f.care_recipient_id=b.care_recipient_id AND f.user_id=$1 AND f.accepted_at IS NOT NULL
    ORDER BY b.created_at DESC LIMIT 100`, [u.id]);
}

// ───────── lifecycle ─────────
/** Money paid for this booking and still held by Uday: captured amounts minus days released, refunds and fees. */
export async function escrowBalance(c: PoolClient, bookingId: string) {
  return Number((await c.query("SELECT COALESCE(SUM(credit_paise - debit_paise),0)::int AS n FROM ledger_entries WHERE booking_id=$1 AND account='escrow'", [bookingId])).rows[0].n);
}
async function closeFuture(c: PoolClient, bookingId: string) {
  await c.query("UPDATE billing_cycles SET status='cancelled' WHERE booking_id=$1 AND status IN ('due','failed','held')", [bookingId]);
  await c.query("UPDATE relief_shifts SET status='cancelled' WHERE booking_id=$1 AND status IN ('open','offered','accepted')", [bookingId]);
}
/** Release one day of care from escrow to whoever gave it: caregiver rate, Uday fee and GST. Rounding lands on the last day. */
export async function releaseDay(c: PoolClient, b: any, day: number, caregiverId: string, label = "shift") {
  const last = day === b.days;
  const pf = last ? b.platform_paise - Math.floor(b.platform_paise / b.days) * (b.days - 1) : Math.floor(b.platform_paise / b.days);
  const gst = last ? b.gst_paise - Math.floor(b.gst_paise / b.days) * (b.days - 1) : Math.floor(b.gst_paise / b.days);
  await ledger(c, b.id, [["escrow", b.rate_paise + pf + gst, 0, `${label} ${day} completed`], [`caregiver:${caregiverId}`, 0, b.rate_paise, `${label} ${day} pay`], ["uday_fee", 0, pf, `${label} ${day} fee`], ["gst_payable", 0, gst, `${label} ${day} GST`]]);
}
async function createReliefRows(c: PoolClient, b: any, fromDay: number) {
  if (b.care_type !== "live" || b.day_off == null) return;
  for (const r of reliefDays(String(b.start_date instanceof Date ? b.start_date.toISOString() : b.start_date).slice(0, 10), b.days, b.day_off, fromDay))
    await c.query("INSERT INTO relief_shifts (booking_id, day_no, day) VALUES ($1,$2,$3) ON CONFLICT (booking_id, day_no) DO NOTHING", [b.id, r.dayNo, r.date]);
}
const TIME_CHECKS = !["development", "staging", "test"].includes(process.env.UDAY_ENV ?? "production");
async function toProposalTx(c: PoolClient, b: any, actor: SessionUser | null, role: Actor, reason: string) {
  const tried: string[] = Array.from(new Set([...(b.tried ?? []), b.caregiver_id]));
  const remainingStart = new Date(Date.parse(String(b.start_date).slice(0, 10) + "T00:00:00Z") + b.days_done * 86400e3).toISOString().slice(0, 10);
  const busy = await busyCaregivers(c, remainingStart, b.days - b.days_done, b.id);
  const pool = (await c.query("SELECT id, tier, care_types, rating::float, status FROM caregivers WHERE status='active'")).rows
    .map((r: any) => ({ id: r.id, tier: r.tier, careTypes: r.care_types, active: !busy.has(r.id), rating: r.rating }));
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
  const unused = await escrowBalance(c, b.id);
  await closeFuture(c, b.id);
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
  | { action: "start"; code: string } | { action: "log"; meal?: boolean; meds?: boolean; mood: string; note?: string; checklist?: Record<string, string>; vitals?: { bpSys?: number; bpDia?: number; pulse?: number; tempC?: number; pain?: number; skinConcern?: boolean; appetite?: string } }
  | { action: "end"; code: string } | { action: "rate"; areas: Partial<Record<RatingArea, number>>; tags?: string[]; note?: string; publicText?: string }
  | { action: "ticket"; category: string; text?: string } | { action: "cg_cancel"; reason?: string }
  | { action: "day_close" } | { action: "return"; code: string } | { action: "day_check"; day: number; ok: boolean; note?: string }
  | { action: "replace"; reason?: string } | { action: "extend"; days: 7 | 30 } | { action: "extension"; accept: boolean };

export async function act(u: SessionUser, id: string, a: Action) {
  await sweepOffers();
  const head = await one<any>("SELECT b.care_recipient_id, c.user_id AS cg_user FROM bookings b JOIN caregivers c ON c.id=b.caregiver_id WHERE b.id=$1", [id]);
  if (!head) throw new AppError("Booking not found", 404);
  const fam = await familyRole(u.id, head.care_recipient_id);
  const isCg = head.cg_user === u.id;
  const famActs = ["approve", "reject", "cancel", "reschedule", "rate", "ticket", "day_check", "replace", "extend"];
  const cgActs = ["accept", "decline", "enroute", "arrive", "start", "log", "end", "cg_cancel", "day_close", "return", "extension"];
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
        let captured = 0;
        // A replacement caregiver taking over paid care: nothing new to capture.
        if (pay.status === "held") {
          captured = pay.amount_paise;
          await gateway().capture(pay.gateway_ref, captured);
          await c.query("UPDATE payments SET status='captured', captured_paise=$2, updated_at=now() WHERE id=$1", [pay.id, captured]);
          await ledger(c, b.id, [["family_payments", captured, 0, "captured on acceptance"], ["escrow", 0, captured, "captured on acceptance"]]);
          if (b.billing === "weekly") await c.query("UPDATE billing_cycles SET status='paid', paid_at=now(), gateway_ref=$2 WHERE booking_id=$1 AND cycle_no=1", [b.id, pay.gateway_ref]);
        }
        await c.query("UPDATE bookings SET status='accepted', start_code_enc=$2, offer_expires_at=NULL, paid_paise=paid_paise+$3, away=false, return_code_enc=NULL, updated_at=now() WHERE id=$1", [b.id, enc(shiftCode()), captured]);
        await createReliefRows(c, b, b.days_done + 2);
        await event(c, b, u, "caregiver", "accepted", captured ? `${cgName} accepted. ${rupees(captured)} captured${b.billing === "weekly" ? " for the first week" : ""}.` : `${cgName} accepted and takes over from day ${b.days_done + 1}.`);
        await tellFamily(b.care_recipient_id, "booking_accepted", { bookingId: b.id });
        break;
      }
      case "decline":
        await toProposalTx(c, b, u, "caregiver", `${cgName} declined: ${a.reason}.`);
        break;
      case "cg_cancel":
        if (!["accepted", "active"].includes(b.status)) throw new AppError("You can cancel before travelling, or stop during care");
        await c.query("UPDATE bookings SET away=false WHERE id=$1", [b.id]); b.away = false;
        await toProposalTx(c, b, u, "caregiver", b.status === "active" ? `${cgName} cannot continue${a.reason ? ": " + a.reason : ""}. Uday is arranging a replacement for the remaining ${b.days - b.days_done} days.` : `${cgName} cancelled after accepting. Uday is arranging a substitute.`);
        break;
      case "replace":
        if (!["accepted", "enroute", "active"].includes(b.status) || b.days_done >= b.days) throw new AppError("This booking cannot be changed now");
        await c.query("UPDATE bookings SET away=false WHERE id=$1", [b.id]);
        await toProposalTx(c, b, u, "family", `You asked for a different caregiver${a.reason ? ": " + a.reason : ""}. ${b.days - b.days_done} days remain.`);
        { const cgUser = (await c.query("SELECT user_id FROM caregivers WHERE id=$1", [b.caregiver_id])).rows[0]?.user_id; if (cgUser) await notify(cgUser, "booking_cancelled", { bookingId: b.id }); }
        break;
      case "approve": {
        assertTransition(b.status, "offered", "family");
        const p = (await c.query("SELECT * FROM caregivers WHERE id=$1", [b.proposed_caregiver_id])).rows[0];
        if (!p) throw new AppError("No proposal to approve");
        if (b.paid_paise > 0) {
          // Care already paid for: the family's price stays the same and the new caregiver takes the remaining days.
          const start = shiftStart(String(b.start_date).slice(0, 10), String(b.start_time).slice(0, 5), b.days_done);
          const win = Number(process.env.OFFER_WINDOW_MINUTES) || offerWindowMinutes(start);
          await c.query("UPDATE bookings SET status='offered', caregiver_id=$2, proposed_caregiver_id=NULL, offer_expires_at=now() + ($3 || ' minutes')::interval, updated_at=now() WHERE id=$1", [b.id, p.id, String(win)]);
          await event(c, b, u, "family", "offered", `You approved ${p.display_name} for the remaining ${b.days - b.days_done} days. Same price.`);
          if (p.user_id) await notify(p.user_id, "booking_offer", { bookingId: b.id });
          break;
        }
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
          const avail = await escrowBalance(c, b.id);
          qte.feePaise = Math.min(qte.feePaise, avail); qte.refundPaise = Math.max(0, avail - qte.feePaise);
          await closeFuture(c, b.id);
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
        if (b.away) throw new AppError("You are on your day off. The relief caregiver keeps today's log.");
        const cgId = b.caregiver_id;
        const checklist = Object.fromEntries(Object.entries(a.checklist ?? {}).filter(([k, v]) => CHECKLIST_IDS.has(k) && !Number.isNaN(Date.parse(v))));
        const v = a.vitals ?? {};
        if (b.tier < 3 && (v.bpSys != null || v.bpDia != null || v.pulse != null || v.tempC != null))
          throw new AppError("Blood pressure, pulse and temperature are recorded by Tier 3 nurses only. Note any concern for the family instead.");
        if (b.tier < 3) delete checklist.vitals;
        const flags = vitalsFlags(v);
        const meal = a.meal ?? !!checklist.breakfast, meds = a.meds ?? !!checklist.medication;
        await c.query("INSERT INTO shift_logs (booking_id, day, caregiver_id, meal, meds, mood, note_enc, checklist_enc, vitals_enc, flags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [b.id, b.days_done + 1, cgId, meal, meds, String(a.mood).slice(0, 40), enc(a.note?.slice(0, 1000), "health"),
           Object.keys(checklist).length ? encJson(checklist) : null, Object.keys(v).length ? encJson(v) : null, flags]);
        const KIND: Record<string, string> = { bpSys: "bp_sys", bpDia: "bp_dia", pulse: "pulse", tempC: "temp_c", pain: "pain" };
        for (const [k, kind] of Object.entries(KIND)) { const val = (v as any)[k]; if (typeof val === "number")
          await c.query("INSERT INTO readings (care_recipient_id, kind, value_enc, source, booking_id, recorded_at, created_by) VALUES ($1,$2,$3,'caregiver',$4, now(), $5)", [b.care_recipient_id, kind, enc(String(val), "health"), b.id, u.id]); }
        if (flags.length) {
          await event(c, b, u, "caregiver", null, `Readings outside the usual range: ${flags.join(", ")}. Family and Uday alerted.`);
          await tellFamily(b.care_recipient_id, "vitals_alert", { bookingId: b.id });
          await notify(null, "vitals_alert", { bookingId: b.id, flags });
        } else await tellFamily(b.care_recipient_id, "shift_log", { bookingId: b.id });
        break;
      }
      case "end": {
        if (b.status !== "active") throw new AppError("No shift in progress");
        const logged = (await c.query("SELECT 1 FROM shift_logs WHERE booking_id=$1 AND day=$2 LIMIT 1", [b.id, b.days_done + 1])).rowCount;
        if (!logged) throw new AppError("Save a shift log entry first");
        const day = b.days_done + 1;
        const last = day === b.days;
        if (b.care_type === "live" && !last) throw new AppError("For live in care, close each day instead. The end code is for the last day.");
        if (b.away) throw new AppError("You are on your day off");
        if (dec(b.end_code_enc) !== a.code) throw new AppError("Code does not match.");
        await releaseDay(c, b, day, b.caregiver_id);
        await c.query("INSERT INTO attendance (booking_id, day, kind) VALUES ($1,$2,'end')", [b.id, day]);
        const nextStatus: BookingStatus = last ? "completed" : "accepted";
        assertTransition("active", nextStatus, "caregiver");
        await c.query("UPDATE bookings SET status=$2, days_done=$3, start_code_enc=$4, end_code_enc=NULL, updated_at=now() WHERE id=$1",
          [b.id, nextStatus, day, last ? null : enc(shiftCode())]);
        await event(c, b, u, "caregiver", nextStatus, `Shift ${day} of ${b.days} completed. ${rupees(b.rate_paise)} added to ${first}'s payout.` + (last ? " All shifts done." : " Next shift scheduled."));
        await tellFamily(b.care_recipient_id, last ? "rate_request" : "shift_ended", { bookingId: b.id });
        break;
      }
      case "day_close": {
        // Live in: the caregiver stays in the home. Each day ends with her log, not with codes.
        if (b.care_type !== "live") throw new AppError("Only for live in care");
        if (b.status !== "active" || b.away) throw new AppError("No day in progress");
        const day = b.days_done + 1;
        if (day >= b.days) throw new AppError("This is the last day. Use the end code from the family.");
        if (TIME_CHECKS && Date.now() < shiftStart(String(b.start_date).slice(0, 10), String(b.start_time).slice(0, 5), day).getTime() - 3600e3) throw new AppError("You can close the day from one hour before it ends");
        if (!(await c.query("SELECT 1 FROM shift_logs WHERE booking_id=$1 AND day=$2 LIMIT 1", [b.id, day])).rowCount) throw new AppError("Save today's care log first");
        await releaseDay(c, b, day, b.caregiver_id, "day");
        await c.query("INSERT INTO attendance (booking_id, day, kind) VALUES ($1,$2,'day_close')", [b.id, day]);
        const relief = (await c.query("SELECT r.id, c.display_name FROM relief_shifts r JOIN caregivers c ON c.id=r.caregiver_id WHERE r.booking_id=$1 AND r.day_no=$2 AND r.status='accepted'", [b.id, day + 1])).rows[0];
        const lastNext = day + 1 === b.days;
        await c.query("UPDATE bookings SET days_done=$2, away=$3, end_code_enc=CASE WHEN $4 THEN $5 ELSE end_code_enc END, updated_at=now() WHERE id=$1", [b.id, day, !!relief, lastNext, enc(shiftCode())]);
        await event(c, b, u, "caregiver", null, `Day ${day} of ${b.days} done. ${rupees(b.rate_paise)} added to ${first}'s payout.` + (relief ? ` Tomorrow is ${first}'s day off. ${relief.display_name} covers.` : ""));
        await tellFamily(b.care_recipient_id, "day_closed", { bookingId: b.id, day });
        break;
      }
      case "return": {
        if (!b.away) throw new AppError("You are not on a day off");
        if (!b.return_code_enc) throw new AppError("The relief day has not ended yet");
        if (dec(b.return_code_enc) !== a.code) throw new AppError("Code does not match. Ask the family to read it again.");
        await c.query("UPDATE bookings SET away=false, return_code_enc=NULL, updated_at=now() WHERE id=$1", [b.id]);
        await c.query("INSERT INTO attendance (booking_id, day, kind) VALUES ($1,$2,'return')", [b.id, b.days_done + 1]);
        await event(c, b, u, "caregiver", null, `${first} is back after her day off.`);
        await tellFamily(b.care_recipient_id, "caregiver_back", { bookingId: b.id });
        break;
      }
      case "day_check": {
        if (!Number.isInteger(a.day) || a.day < 1 || a.day > b.days_done) throw new AppError("Choose a completed day");
        await c.query("INSERT INTO day_checks (booking_id, day, ok, note_enc, by_user) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (booking_id, day) DO UPDATE SET ok=$3, note_enc=$4, at=now()", [b.id, a.day, a.ok, enc(a.note?.slice(0, 500)), u.id]);
        if (!a.ok) { await openTicket(c, u, b.id, `Concern about day ${a.day}`, a.note); await event(c, b, u, "family", null, `You flagged a concern about day ${a.day}. Uday will call you.`); }
        break;
      }
      case "extend": {
        if (![7, 30].includes(a.days)) throw new AppError("Extend by a week or a month");
        if (!["accepted", "enroute", "arrived", "active"].includes(b.status)) throw new AppError("Only ongoing care can be extended");
        if (b.days - b.days_done > 7) throw new AppError("You can extend in the last week of care");
        if ((await c.query("SELECT 1 FROM extension_requests WHERE booking_id=$1 AND status='requested' AND expires_at > now()", [b.id])).rowCount) throw new AppError("An extension request is already waiting");
        await c.query("INSERT INTO extension_requests (booking_id, days, requested_by, expires_at) VALUES ($1,$2,$3, now() + interval '24 hours')", [b.id, a.days, u.id]);
        await event(c, b, u, "family", null, `You asked ${first} to continue for ${a.days === 7 ? "another week" : "another month"}.`);
        const cgUser = (await c.query("SELECT user_id FROM caregivers WHERE id=$1", [b.caregiver_id])).rows[0]?.user_id;
        if (cgUser) await notify(cgUser, "extension_request", { bookingId: b.id, days: a.days });
        break;
      }
      case "extension": {
        const r = (await c.query("SELECT * FROM extension_requests WHERE booking_id=$1 AND status='requested' AND expires_at > now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [b.id])).rows[0];
        if (!r) throw new AppError("No extension request");
        if (!a.accept) {
          await c.query("UPDATE extension_requests SET status='declined' WHERE id=$1", [r.id]);
          await event(c, b, u, "caregiver", null, `${first} cannot continue after day ${b.days}. Uday can find another caregiver.`);
          await tellFamily(b.care_recipient_id, "extension_declined", { bookingId: b.id }); break;
        }
        const from = new Date(Date.parse(String(b.start_date instanceof Date ? b.start_date.toISOString() : b.start_date).slice(0, 10) + "T00:00:00Z") + b.days * 864e5).toISOString().slice(0, 10);
        if ((await busyCaregivers(c, from, r.days, b.id)).has(b.caregiver_id)) throw new AppError("You have leave or other care on those dates");
        const f = fees(b.rate_paise, r.days);
        const pay = (await c.query("SELECT * FROM payments WHERE booking_id=$1 ORDER BY created_at LIMIT 1", [b.id])).rows[0];
        let paidNow = 0;
        if (b.billing === "weekly") {
          const last = (await c.query("SELECT COALESCE(max(cycle_no),0)::int AS n FROM billing_cycles WHERE booking_id=$1", [b.id])).rows[0].n;
          for (const cy of billingCycles(b.rate_paise, r.days, b.days + 1)) {
            const due = new Date(Math.max(Date.now(), shiftStart(String(b.start_date instanceof Date ? b.start_date.toISOString() : b.start_date).slice(0, 10), String(b.start_time).slice(0, 5), cy.fromDay - 1).getTime() - 48 * 3600e3));
            await c.query(`INSERT INTO billing_cycles (booking_id, cycle_no, from_day, to_day, care_paise, platform_paise, gst_paise, amount_paise, due_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [b.id, last + cy.cycleNo, cy.fromDay, cy.toDay, cy.care, cy.platform, cy.gst, cy.amount, due]);
          }
        } else {
          const h = await gateway().hold(f.totalPaise, b.code + "-X", pay.method); await gateway().capture(h.gatewayRef, f.totalPaise);
          await c.query("INSERT INTO payments (booking_id, gateway, gateway_ref, method, amount_paise, captured_paise, status) VALUES ($1,$2,$3,$4,$5,$5,'captured')", [b.id, gateway().name, h.gatewayRef, pay.method, f.totalPaise]);
          await ledger(c, b.id, [["family_payments", f.totalPaise, 0, "extension captured"], ["escrow", 0, f.totalPaise, "extension captured"]]); paidNow = f.totalPaise;
        }
        await c.query("UPDATE bookings SET days=days+$2, care_paise=care_paise+$3, platform_paise=platform_paise+$4, gst_paise=gst_paise+$5, total_paise=total_paise+$6, paid_paise=paid_paise+$7, updated_at=now() WHERE id=$1",
          [b.id, r.days, f.carePaise, f.platformPaise, f.gstPaise, f.totalPaise, paidNow]);
        await c.query("UPDATE extension_requests SET status='accepted' WHERE id=$1", [r.id]);
        await createReliefRows(c, { ...b, days: b.days + r.days }, b.days);
        await event(c, b, u, "caregiver", null, `${first} will continue for ${r.days} more days, until day ${b.days + r.days}. ` + (paidNow ? `${rupees(paidNow)} charged.` : "Billed weekly."));
        await tellFamily(b.care_recipient_id, "extension_accepted", { bookingId: b.id });
        break;
      }
      case "rate": {
        assertTransition(b.status, "closed", "family");
        let overall: number;
        try { overall = overallRating(a.areas); } catch (e: any) { throw new AppError(e.message); }
        const s = Math.round(overall);
        const pub = a.publicText?.trim() || null;
        if (pub) { const pr = postProblem(pub); if (pr) throw new AppError(pr.replace("in groups", "in reviews")); }
        await c.query("INSERT INTO reviews (booking_id, stars, tags, note_enc, areas, overall, public_text) VALUES ($1,$2,$3,$4,$5,$6,$7)", [b.id, s, (a.tags ?? []).slice(0, 8), enc(a.note, "pii"), a.areas, overall, pub]);
        await c.query("UPDATE caregivers SET rating = ROUND(((rating*rating_count)+$2)/(rating_count+1), 1), rating_count=rating_count+1 WHERE id=$1", [b.caregiver_id, overall]);
        await c.query("UPDATE bookings SET status='closed', updated_at=now() WHERE id=$1", [b.id]);
        await event(c, b, u, "family", "closed", `You rated ${overall} out of 5 across five areas.`);
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
