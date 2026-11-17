import { z } from "zod";
import { rupees, shiftStart, assertTransition } from "@uday/core";
import { one, q, tx } from "./db";
import { dec, enc, lookupHash, normalisePhone } from "./crypto";
import { requireUser, AuthError, type SessionUser } from "./auth";
import { notify } from "./notify";
import { gateway } from "./payments";
import { AppError, closeFuture, escrowBalance, event, ledger, lockBooking, releaseTx, toProposalTx, tellFamily, busyCaregivers } from "./bookings";
import { policyNow, tierRates } from "./settings";

/**
 * Operations console. Every ops user has a team role:
 *   admin   : everything, including pricing, settings, team and caregiver removal
 *   agent   : bookings, help requests, incidents, people, community
 *   finance : payments, refunds, invoices, reconciliation, payouts, reports, audit log
 *   viewer  : read only
 * Every change made here is written to the audit log.
 */
export type OpsRole = "admin" | "agent" | "finance" | "viewer";
export type Perm = "view" | "bookings" | "help" | "incidents" | "people" | "caregiver_admin" | "money" | "pricing" | "settings" | "team" | "audit" | "community";
const CAN: Record<Perm, OpsRole[]> = {
  view: ["admin", "agent", "finance", "viewer"], bookings: ["admin", "agent"], help: ["admin", "agent"], incidents: ["admin", "agent"], people: ["admin", "agent"], community: ["admin", "agent"],
  caregiver_admin: ["admin"], money: ["admin", "finance"], pricing: ["admin"], settings: ["admin"], team: ["admin"], audit: ["admin", "finance"],
};
export async function opsRole(userId: string): Promise<OpsRole | null> {
  const m = await one<{ role: OpsRole; active: boolean }>("SELECT role, active FROM ops_members WHERE user_id=$1", [userId]);
  if (m) return m.active ? m.role : null;
  // First ops user on a fresh system becomes admin.
  const any = await one("SELECT 1 FROM ops_members LIMIT 1");
  if (!any) { await q("INSERT INTO ops_members (user_id, role) VALUES ($1,'admin') ON CONFLICT DO NOTHING", [userId]); return "admin"; }
  return "viewer";
}
export async function requireOps(perm: Perm = "view") {
  const u = await requireUser("ops");
  const role = await opsRole(u.id);
  if (!role) throw new AuthError("Your operations access is switched off", 403);
  if (!CAN[perm].includes(role)) throw new AuthError("Your team role cannot do this", 403);
  return Object.assign(u, { opsRole: role });
}
export function permsFor(role: OpsRole) { return (Object.keys(CAN) as Perm[]).filter((p) => CAN[p].includes(role)); }
export async function audit(actor: string, action: string, entity: string, entityId: string | null, reason?: string) {
  await q("INSERT INTO audit_log (actor_id, action, entity, entity_id, reason) VALUES ($1,$2,$3,$4,$5)", [actor, action, entity, entityId, reason?.slice(0, 500) ?? null]);
}
const code = (p: string) => p + Date.now().toString(36).toUpperCase().slice(-6) + Math.floor(Math.random() * 36).toString(36).toUpperCase();

// ───────── dashboard and search ─────────
export async function dashboard() {
  const [byStatus, counts, sos, incidents, tickets, today] = await Promise.all([
    q("SELECT status, count(*)::int AS n FROM bookings GROUP BY status"),
    one<any>(`SELECT
      (SELECT count(*)::int FROM tickets WHERE status <> 'resolved') AS open_tickets,
      (SELECT count(*)::int FROM tickets WHERE status <> 'resolved' AND sla_due_at < now()) AS late_tickets,
      (SELECT count(*)::int FROM incidents WHERE status <> 'closed') AS open_incidents,
      (SELECT count(*)::int FROM caregiver_applications WHERE status='new') AS applications,
      (SELECT count(*)::int FROM caregivers WHERE status='verifying') AS verifying,
      (SELECT count(*)::int FROM caregivers WHERE status='active') AS active_caregivers,
      (SELECT count(*)::int FROM caregivers WHERE status='active' AND online) AS online_caregivers,
      (SELECT count(*)::int FROM bookings WHERE status='offered') AS waiting_offers,
      (SELECT count(*)::int FROM bookings WHERE status='proposal') AS proposals,
      (SELECT count(*)::int FROM relief_shifts WHERE status IN ('open','offered') AND day <= current_date + 2) AS relief_unfilled,
      (SELECT count(*)::int FROM billing_cycles WHERE status='failed') AS failed_payments,
      (SELECT count(*)::int FROM leave_requests WHERE status='requested') AS leave,
      (SELECT count(*)::int FROM facilities WHERE status='review') AS facilities_review,
      (SELECT count(*)::int FROM post_reports r JOIN group_posts p ON p.id=r.post_id WHERE p.status <> 'hidden') AS reports,
      (SELECT count(*)::int FROM notifications WHERE status='failed' AND at > now() - interval '24 hours') AS failed_messages,
      (SELECT count(*)::int FROM alerts WHERE status='open') AS open_alerts`),
    q(`SELECT s.id, s.role, s.booking_id, s.at, s.lat, s.lng, u.name, b.code FROM sos_events s JOIN users u ON u.id=s.user_id LEFT JOIN bookings b ON b.id=s.booking_id
       WHERE s.resolved_at IS NULL ORDER BY s.at DESC LIMIT 20`),
    q("SELECT id, code, severity, category, status, summary, opened_at FROM incidents WHERE status <> 'closed' ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, opened_at LIMIT 10"),
    q("SELECT id, code, category, urgent, status, sla_due_at FROM tickets WHERE status <> 'resolved' ORDER BY urgent DESC, sla_due_at LIMIT 10"),
    one<any>(`SELECT
      (SELECT count(*)::int FROM checkins WHERE (at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date) AS checkins,
      (SELECT count(*)::int FROM care_recipients WHERE has_phone OR checkin_mode='call') AS seniors,
      (SELECT count(*)::int FROM attendance WHERE kind='start' AND (at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date) AS shifts_started,
      (SELECT COALESCE(sum(amount_paise),0)::bigint FROM payments WHERE status IN ('captured','partially_refunded') AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date) AS collected`),
  ]);
  const { opsAlerts } = await import("./alerts");
  const cron = await q("SELECT job, last_ok_at, last_error, last_error_at FROM cron_runs ORDER BY job");
  const cronStale = !cron.length || cron.some((c: any) => !c.last_ok_at || Date.now() - new Date(c.last_ok_at).getTime() > 5 * 60e3);
  return { byStatus, counts, sos, incidents, tickets, today, alerts: await opsAlerts(), cron, cronStale };
}

/** One box finds people, bookings, tickets and incidents: by name, phone number, last 4 digits or code. */
export async function search(raw: string) {
  const s = raw.trim(); if (s.length < 2) return [];
  const out: { kind: string; id: string; title: string; sub: string; href: string }[] = [];
  const up = s.toUpperCase();
  if (/^UDY/.test(up)) for (const b of await q<any>("SELECT b.id, b.code, b.status, r.name FROM bookings b JOIN care_recipients r ON r.id=b.care_recipient_id WHERE b.code LIKE $1 LIMIT 10", [up + "%"]))
    out.push({ kind: "Booking", id: b.id, title: b.code, sub: `${b.name} · ${b.status}`, href: `/ops/bookings/${b.id}` });
  if (/^TKT/.test(up)) for (const t of await q<any>("SELECT id, code, category, status FROM tickets WHERE code LIKE $1 LIMIT 10", [up + "%"]))
    out.push({ kind: "Help request", id: t.id, title: t.code, sub: `${t.category} · ${t.status}`, href: `/ops/help/${t.id}` });
  if (/^INC/.test(up)) for (const t of await q<any>("SELECT id, code, summary, status FROM incidents WHERE code LIKE $1 LIMIT 10", [up + "%"]))
    out.push({ kind: "Incident", id: t.id, title: t.code, sub: `${t.summary.slice(0, 60)} · ${t.status}`, href: `/ops/incidents/${t.id}` });
  const digits = s.replace(/\D/g, "");
  let users: any[] = [];
  if (digits.length >= 10) { try { users = await q<any>("SELECT id, name, role, phone_last4, city FROM users WHERE phone_hash=$1", [lookupHash(normalisePhone(s))]); } catch { /* not a phone */ } }
  else if (digits.length === 4 && digits === s) users = await q<any>("SELECT id, name, role, phone_last4, city FROM users WHERE phone_last4=$1 ORDER BY created_at DESC LIMIT 20", [digits]);
  if (!digits.length || digits.length < s.length) users.push(...await q<any>("SELECT id, name, role, phone_last4, city FROM users WHERE name ILIKE $1 ORDER BY created_at DESC LIMIT 20", ["%" + s + "%"]));
  const seen = new Set<string>();
  for (const u of users) {
    if (seen.has(u.id)) continue; seen.add(u.id);
    if (u.role === "caregiver") { const c = await one<any>("SELECT id, tier, status FROM caregivers WHERE user_id=$1", [u.id]); if (c) out.push({ kind: "Caregiver", id: c.id, title: u.name ?? "Caregiver", sub: `Tier ${c.tier} · ${c.status} · ••${u.phone_last4}`, href: `/ops/caregivers/${c.id}` }); }
    else out.push({ kind: u.role === "senior" ? "Senior" : u.role === "ops" ? "Team" : u.role === "facility" ? "Facility" : "Family", id: u.id, title: u.name ?? "No name", sub: `${u.city ?? ""} ••${u.phone_last4}`, href: `/ops/people/${u.id}` });
  }
  for (const r of await q<any>("SELECT id, name, locality, owner_id FROM care_recipients WHERE name ILIKE $1 LIMIT 10", ["%" + s + "%"]))
    out.push({ kind: "Parent", id: r.id, title: r.name, sub: r.locality ?? "", href: `/ops/people/${r.owner_id}` });
  return out.slice(0, 40);
}

// ───────── bookings and dispatch overrides ─────────
export async function bookings(f: { status?: string; q?: string; from?: string; to?: string; care?: string; page?: number }) {
  const where: string[] = []; const args: any[] = [];
  const add = (sql: string, v: any) => { args.push(v); where.push(sql.replace("?", "$" + args.length)); };
  if (f.status === "live") where.push("b.status NOT IN ('closed','cancelled','released')");
  else if (f.status === "attention") where.push("(b.status IN ('offered','proposal') OR EXISTS (SELECT 1 FROM tickets t WHERE t.booking_id=b.id AND t.status <> 'resolved') OR EXISTS (SELECT 1 FROM billing_cycles y WHERE y.booking_id=b.id AND y.status='failed'))");
  else if (f.status) add("b.status=?::booking_status", f.status);
  if (f.care) add("b.care_type=?::care_type", f.care);
  if (f.from) add("b.start_date >= ?::date", f.from);
  if (f.to) add("b.start_date <= ?::date", f.to);
  if (f.q) { args.push("%" + f.q + "%"); where.push(`(b.code ILIKE $${args.length} OR r.name ILIKE $${args.length} OR c.display_name ILIKE $${args.length} OR r.locality ILIKE $${args.length})`); }
  const off = Math.max(0, (f.page ?? 0) * 50);
  return q(`SELECT b.id, b.code, b.status, b.care_type, b.days, b.days_done, b.start_date, b.start_time, b.total_paise, b.paid_paise, b.billing, b.offer_expires_at, b.updated_at, b.tier,
      c.display_name AS caregiver, r.name AS recipient, r.locality,
      (SELECT count(*)::int FROM tickets t WHERE t.booking_id=b.id AND t.status <> 'resolved') AS open_tickets
    FROM bookings b JOIN caregivers c ON c.id=b.caregiver_id JOIN care_recipients r ON r.id=b.care_recipient_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY b.updated_at DESC LIMIT 50 OFFSET ${off}`, args);
}
export async function bookingDetail(u: SessionUser, id: string) {
  const b = await one<any>(`SELECT b.*, c.display_name AS caregiver, c.tier AS cg_tier, c.user_id AS cg_user, r.name AS recipient, r.locality, r.owner_id, p.name AS payer, p.phone_last4 AS payer_last4,
      pc.display_name AS proposed FROM bookings b JOIN caregivers c ON c.id=b.caregiver_id JOIN care_recipients r ON r.id=b.care_recipient_id JOIN users p ON p.id=b.payer_id
      LEFT JOIN caregivers pc ON pc.id=b.proposed_caregiver_id WHERE b.id=$1`, [id]);
  if (!b) throw new AppError("Not found", 404);
  const [events, payments, ledgerRows, cycles, tickets, notes, attendance, relief, incidents, invoices, mandate] = await Promise.all([
    q("SELECT actor_role, from_status, to_status, message, at FROM booking_events WHERE booking_id=$1 ORDER BY at, id", [id]),
    q("SELECT gateway, gateway_ref, payment_id, method, amount_paise, captured_paise, refunded_paise, status, created_at FROM payments WHERE booking_id=$1 ORDER BY created_at", [id]),
    q("SELECT account, debit_paise, credit_paise, reason, at FROM ledger_entries WHERE booking_id=$1 ORDER BY id", [id]),
    q("SELECT cycle_no, from_day, to_day, amount_paise, status, due_at, paid_at, fail_reason FROM billing_cycles WHERE booking_id=$1 ORDER BY cycle_no", [id]),
    q("SELECT id, code, category, status, urgent, sla_due_at FROM tickets WHERE booking_id=$1 ORDER BY created_at", [id]),
    q("SELECT n.body, n.created_at, u.name FROM booking_notes n LEFT JOIN users u ON u.id=n.author_id WHERE n.booking_id=$1 ORDER BY n.created_at", [id]),
    q("SELECT day, kind, at FROM attendance WHERE booking_id=$1 ORDER BY at", [id]),
    q("SELECT day_no, day AS day_date, status, (SELECT display_name FROM caregivers WHERE id=relief_shifts.caregiver_id) AS caregiver FROM relief_shifts WHERE booking_id=$1 ORDER BY day_no", [id]),
    q("SELECT id, code, severity, status, summary FROM incidents WHERE booking_id=$1 ORDER BY opened_at", [id]),
    q("SELECT id, kind, number, issued_at, total_paise, status FROM invoices WHERE booking_id=$1 ORDER BY issued_at", [id]),
    one("SELECT status, method, max_paise FROM mandates WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1", [id]),
  ]);
  const escrow = (await one<{ e: number }>("SELECT COALESCE(sum(credit_paise - debit_paise),0)::int AS e FROM ledger_entries WHERE booking_id=$1 AND account='escrow'", [id]))?.e ?? 0;
  const candidates = ["offered", "proposal", "accepted", "enroute"].includes(b.status) ? await reassignCandidates(b) : [];
  await audit(u.id, "view", "booking", id);
  return { booking: { ...b, policy: undefined, home_commitments: undefined }, events, payments, ledger: ledgerRows, cycles, tickets, notes, attendance, relief, incidents, invoices, mandate, escrow, candidates };
}
async function reassignCandidates(b: any) {
  const from = new Date(Date.parse(String(b.start_date instanceof Date ? b.start_date.toISOString() : b.start_date).slice(0, 10) + "T00:00:00Z") + b.days_done * 864e5).toISOString().slice(0, 10);
  const busy = await busyCaregivers(null, from, b.days - b.days_done, b.id);
  const rows = await q<any>("SELECT id, display_name, tier, area, rating::float, care_types FROM caregivers WHERE status='active' AND tier >= $1 AND $2::care_type = ANY(care_types) AND id <> $3 ORDER BY tier, (area = $4) DESC, rating DESC NULLS LAST LIMIT 200", [b.tier, b.care_type, b.caregiver_id, b.locality ?? ""]);
  return rows.filter((r) => !busy.has(r.id)).slice(0, 25);
}
export const OverrideIn = z.discriminatedUnion("action", [
  z.object({ action: z.literal("note"), body: z.string().min(1).max(2000) }),
  z.object({ action: z.literal("reassign"), caregiverId: z.string().uuid(), reason: z.string().min(3).max(300) }),
  z.object({ action: z.literal("extend_offer"), minutes: z.number().int().min(15).max(24 * 60) }),
  z.object({ action: z.literal("propose_next"), reason: z.string().min(3).max(300) }),
  z.object({ action: z.literal("release"), reason: z.string().min(3).max(300) }),
  z.object({ action: z.literal("cancel"), refund: z.enum(["policy", "full"]), reason: z.string().min(3).max(300) }),
  z.object({ action: z.literal("refund"), amountPaise: z.number().int().min(100), reason: z.string().min(3).max(300) }),
]);
/** Dispatch overrides. Each one is recorded on the booking's timeline (seen by the family, except notes) and in the audit log. */
export async function override(u: SessionUser & { opsRole: OpsRole }, id: string, a: z.infer<typeof OverrideIn>) {
  if ((a.action === "cancel" && a.refund === "full") || a.action === "refund") if (!CAN.money.includes(u.opsRole) && u.opsRole !== "agent") throw new AuthError("Your team role cannot give refunds", 403);
  if (a.action === "refund" && !CAN.money.includes(u.opsRole)) throw new AuthError("Only admin or finance can give a goodwill refund", 403);
  const r = await tx(async (c) => {
    const b = await lockBooking(c, id);
    switch (a.action) {
      case "note": await c.query("INSERT INTO booking_notes (booking_id, author_id, body) VALUES ($1,$2,$3)", [id, u.id, a.body]); return { ok: true };
      case "reassign": {
        if (!["offered", "proposal", "accepted", "enroute"].includes(b.status)) throw new AppError("Only a booking that is waiting, proposed or not yet started can be reassigned");
        const cg = (await c.query("SELECT id, display_name, user_id, tier, care_types, status FROM caregivers WHERE id=$1", [a.caregiverId])).rows[0];
        if (!cg || cg.status !== "active") throw new AppError("Choose an active caregiver");
        if (cg.tier < b.tier || !cg.care_types.includes(b.care_type)) throw new AppError("The new caregiver must offer this care at the same tier or higher");
        const from = new Date(Date.parse(String(b.start_date instanceof Date ? b.start_date.toISOString() : b.start_date).slice(0, 10) + "T00:00:00Z") + b.days_done * 864e5).toISOString().slice(0, 10);
        if ((await busyCaregivers(c, from, b.days - b.days_done, b.id)).has(cg.id)) throw new AppError(`${cg.display_name} is booked on some of these days`);
        const old = (await c.query("SELECT display_name, user_id FROM caregivers WHERE id=$1", [b.caregiver_id])).rows[0];
        const pol = await policyNow(); const start = shiftStart(String(b.start_date instanceof Date ? b.start_date.toISOString() : b.start_date).slice(0, 10), String(b.start_time).slice(0, 5), b.days_done);
        const win = start.getTime() - Date.now() < 24 * 3600e3 ? pol.offerWindowSameDayMin : pol.offerWindowFutureMin;
        await c.query(`UPDATE bookings SET caregiver_id=$2, status='offered', tried=array_append(COALESCE(tried,'{}'), caregiver_id), proposed_caregiver_id=NULL,
          offer_expires_at=now() + ($3 || ' minutes')::interval, updated_at=now() WHERE id=$1`, [id, cg.id, String(win)]);
        await c.query("INSERT INTO booking_events (booking_id, actor_id, actor_role, to_status, message) VALUES ($1,$2,'ops','offered',$3)", [id, u.id, `Uday moved this booking from ${old.display_name} to ${cg.display_name}. Same price. Waiting for her to accept.`]);
        if (cg.user_id) await notify(cg.user_id, "booking_offer", { bookingId: id });
        if (old.user_id && old.user_id !== cg.user_id) await notify(old.user_id, "booking_cancelled", { bookingId: id });
        await tellFamily(b.care_recipient_id, "booking_proposal", { bookingId: id });
        return { ok: true };
      }
      case "extend_offer":
        if (b.status !== "offered") throw new AppError("Only a waiting request has an answer window");
        await c.query("UPDATE bookings SET offer_expires_at=GREATEST(offer_expires_at, now()) + ($2 || ' minutes')::interval, updated_at=now() WHERE id=$1", [id, String(a.minutes)]);
        await c.query("INSERT INTO booking_events (booking_id, actor_id, actor_role, message) VALUES ($1,$2,'ops',$3)", [id, u.id, `Uday gave the caregiver ${a.minutes} more minutes to answer.`]);
        return { ok: true };
      case "propose_next": await toProposalTx(c, b, u, "ops", a.reason.endsWith(".") ? a.reason : a.reason + "."); return { ok: true };
      case "release": assertTransition(b.status, "released", "ops"); await releaseTx(c, b, u, "ops", `Uday closed this request: ${a.reason}`); return { ok: true };
      case "cancel": {
        assertTransition(b.status, "cancelled", "ops");
        const pay = (await c.query("SELECT * FROM payments WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [id])).rows[0];
        let refund = 0, fee = 0;
        if (pay && (pay.status === "held" || pay.status === "pending")) { await (await gateway()).release(pay.gateway_ref); await c.query("UPDATE payments SET status='released', updated_at=now() WHERE id=$1", [pay.id]); }
        else if (pay) {
          const avail = await escrowBalance(c, id);
          if (a.refund === "policy") {
            const { cancelQuote } = await import("@uday/core");
            const next = shiftStart(String(b.start_date instanceof Date ? b.start_date.toISOString() : b.start_date).slice(0, 10), String(b.start_time).slice(0, 5), b.days_done);
            fee = Math.min(cancelQuote({ status: b.status, days: b.days, daysDone: b.days_done, totalPaise: b.total_paise, ratePaise: b.rate_paise, nextShiftStart: next }, new Date(), await policyNow()).feePaise, avail);
          }
          refund = Math.max(0, avail - fee); await closeFuture(c, id);
          if (refund > 0) { await (await gateway()).refund(pay.payment_id ?? pay.gateway_ref, refund); await c.query("UPDATE payments SET refunded_paise=refunded_paise+$2, status='partially_refunded', updated_at=now() WHERE id=$1", [pay.id, refund]); }
          const lines: [string, number, number, string][] = [];
          if (refund) lines.push(["escrow", refund, 0, "ops cancellation refund"], ["family_refunds", 0, refund, "ops cancellation refund"]);
          if (fee) lines.push(["escrow", fee, 0, "late cancellation fee"], [`caregiver:${b.caregiver_id}`, 0, fee, "late cancellation fee"]);
          if (lines.length) await ledger(c, id, lines);
        }
        await c.query("UPDATE bookings SET status='cancelled', cancel_fee_paise=$2, refund_paise=$3, offer_expires_at=NULL, updated_at=now() WHERE id=$1", [id, fee, refund]);
        await event(c, b, u, "ops", "cancelled", `Uday cancelled this booking: ${a.reason}. ${refund ? "Refund " + rupees(refund) + "." : "Payment hold released."}`);
        const cgUser = (await c.query("SELECT user_id FROM caregivers WHERE id=$1", [b.caregiver_id])).rows[0]?.user_id;
        if (cgUser) await notify(cgUser, "booking_cancelled", { bookingId: id });
        await tellFamily(b.care_recipient_id, "booking_cancelled", { bookingId: id });
        return { refund, fee };
      }
      case "refund": {
        // Goodwill refund from Uday's fee, for example after a late caregiver. Never taken from the caregiver's pay.
        const pay = (await c.query("SELECT * FROM payments WHERE booking_id=$1 AND status IN ('captured','partially_refunded') ORDER BY created_at LIMIT 1 FOR UPDATE", [id])).rows[0];
        if (!pay) throw new AppError("There is no captured payment to refund");
        const paid = (await one<{ p: number }>("SELECT COALESCE(sum(captured_paise - refunded_paise),0)::int AS p FROM payments WHERE booking_id=$1", [id]))?.p ?? 0;
        if (a.amountPaise > paid) throw new AppError(`At most ${rupees(paid)} can be refunded`);
        await (await gateway()).refund(pay.payment_id ?? pay.gateway_ref, a.amountPaise);
        await c.query("UPDATE payments SET refunded_paise=refunded_paise+$2, status='partially_refunded', updated_at=now() WHERE id=$1", [pay.id, a.amountPaise]);
        await ledger(c, id, [["uday_goodwill", a.amountPaise, 0, "goodwill refund"], ["family_refunds", 0, a.amountPaise, "goodwill refund"]]);
        await c.query("UPDATE bookings SET refund_paise=refund_paise+$2, updated_at=now() WHERE id=$1", [id, a.amountPaise]);
        await c.query("INSERT INTO booking_events (booking_id, actor_id, actor_role, message) VALUES ($1,$2,'ops',$3)", [id, u.id, `Uday refunded ${rupees(a.amountPaise)}: ${a.reason}.`]);
        return { ok: true };
      }
    }
  });
  await audit(u.id, a.action, "booking", id, "reason" in a ? a.reason : a.action === "note" ? "internal note" : undefined);
  if (a.action === "cancel" || a.action === "refund") { const { creditNoteFor } = await import("./finance"); await creditNoteFor(id).catch(() => {}); }
  return r;
}

// ───────── help desk ─────────
export async function tickets(f: { status?: string; mine?: string; q?: string }) {
  const where: string[] = []; const args: any[] = [];
  if (f.status === "open" || !f.status) where.push("t.status <> 'resolved'"); else if (f.status !== "all") { args.push(f.status); where.push(`t.status=$${args.length}`); }
  if (f.mine) { args.push(f.mine); where.push(`t.assigned_to=$${args.length}`); }
  if (f.q) { args.push("%" + f.q + "%"); where.push(`(t.code ILIKE $${args.length} OR t.category ILIKE $${args.length})`); }
  return q(`SELECT t.id, t.code, t.category, t.urgent, t.status, t.sla_due_at, t.created_at, t.resolved_at, b.code AS booking, u.name AS person, u.role, a.name AS assignee,
      (t.status <> 'resolved' AND t.sla_due_at < now()) AS late
    FROM tickets t JOIN users u ON u.id=t.user_id LEFT JOIN bookings b ON b.id=t.booking_id LEFT JOIN users a ON a.id=t.assigned_to
    ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY (t.status='resolved'), t.urgent DESC, t.sla_due_at LIMIT 200`, args);
}
export async function ticketDetail(id: string) {
  const t = await one<any>(`SELECT t.*, b.code AS booking, b.id AS booking_id, u.name AS person, u.role, u.phone_last4, a.name AS assignee FROM tickets t JOIN users u ON u.id=t.user_id
    LEFT JOIN bookings b ON b.id=t.booking_id LEFT JOIN users a ON a.id=t.assigned_to WHERE t.id=$1`, [id]);
  if (!t) throw new AppError("Not found", 404);
  const notes = (await q<any>("SELECT n.id, n.body_enc, n.to_user, n.created_at, u.name FROM ticket_notes n LEFT JOIN users u ON u.id=n.author_id WHERE n.ticket_id=$1 ORDER BY n.id", [id])).map((n) => ({ ...n, body: dec(n.body_enc), body_enc: undefined }));
  const incident = await one("SELECT id, code, status FROM incidents WHERE ticket_id=$1", [id]);
  return { ticket: { ...t, text: dec(t.text_enc), text_enc: undefined }, notes, incident };
}
export const TicketIn = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), userId: z.string().uuid().nullable() }),
  z.object({ action: z.literal("status"), status: z.enum(["open", "in_progress", "waiting"]) }),
  z.object({ action: z.literal("note"), body: z.string().min(1).max(2000) }),
  z.object({ action: z.literal("reply"), body: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("resolve"), resolution: z.string().min(3).max(1000) }),
  z.object({ action: z.literal("reopen") }),
]);
export async function ticketAct(u: SessionUser, id: string, a: z.infer<typeof TicketIn>) {
  const t = await one<any>("SELECT * FROM tickets WHERE id=$1", [id]); if (!t) throw new AppError("Not found", 404);
  switch (a.action) {
    case "assign": await q("UPDATE tickets SET assigned_to=$2, status=CASE WHEN status='open' THEN 'in_progress' ELSE status END, updated_at=now() WHERE id=$1", [id, a.userId]); break;
    case "status": if (t.status === "resolved") throw new AppError("Reopen it first"); await q("UPDATE tickets SET status=$2, updated_at=now() WHERE id=$1", [id, a.status]); break;
    case "note": await q("INSERT INTO ticket_notes (ticket_id, author_id, body_enc) VALUES ($1,$2,$3)", [id, u.id, enc(a.body)]); break;
    case "reply":
      await q("INSERT INTO ticket_notes (ticket_id, author_id, body_enc, to_user) VALUES ($1,$2,$3,true)", [id, u.id, enc(a.body)]);
      await q("UPDATE tickets SET first_response_at=COALESCE(first_response_at, now()), status=CASE WHEN status IN ('open','in_progress') THEN 'waiting' ELSE status END, updated_at=now() WHERE id=$1", [id]);
      await notify(t.user_id, "ticket_reply", { code: t.code, ticketId: id, bookingId: t.booking_id, message: a.body.slice(0, 300) }, "sms");
      break;
    case "resolve":
      await q("UPDATE tickets SET status='resolved', resolution=$2, resolved_at=now(), first_response_at=COALESCE(first_response_at, now()), updated_at=now() WHERE id=$1", [id, a.resolution]);
      await notify(t.user_id, "ticket_resolved", { code: t.code, ticketId: id, bookingId: t.booking_id, message: a.resolution.slice(0, 300) });
      break;
    case "reopen": await q("UPDATE tickets SET status='open', resolved_at=NULL, updated_at=now() WHERE id=$1", [id]); break;
  }
  await audit(u.id, "ticket_" + a.action, "ticket", id);
  return ticketDetail(id);
}
/** A help request opened by the Uday team, for example after a phone call. */
export async function openTicketFor(u: SessionUser, i: { userId: string; bookingId?: string; category: string; text?: string; urgent?: boolean }) {
  const pol = await policyNow(); const c = code("TKT");
  const r = await one<{ id: string }>("INSERT INTO tickets (code, booking_id, user_id, category, text_enc, urgent, sla_due_at, assigned_to, status) VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' minutes')::interval, $8, 'in_progress') RETURNING id",
    [c, i.bookingId ?? null, i.userId, i.category.slice(0, 80), enc(i.text?.slice(0, 2000)), !!i.urgent, String(i.urgent ? pol.urgentTicketSlaMin : pol.ticketSlaMin), u.id]);
  await audit(u.id, "create", "ticket", r!.id, i.category); return { id: r!.id, code: c };
}

// ───────── incidents and SOS ─────────
export const IncidentNew = z.object({
  severity: z.enum(["critical", "high", "medium", "low"]), category: z.enum(["safety", "medical", "theft", "abuse", "conduct", "no_show", "data", "payment", "other"]),
  summary: z.string().min(5).max(500), bookingId: z.string().uuid().optional(), caregiverId: z.string().uuid().optional(), ticketId: z.string().uuid().optional(), sosId: z.number().int().optional(),
});
export async function openIncident(u: SessionUser | null, i: z.infer<typeof IncidentNew>) {
  let caregiverId = i.caregiverId ?? null, recipientId: string | null = null;
  if (i.bookingId) { const b = await one<any>("SELECT caregiver_id, care_recipient_id FROM bookings WHERE id=$1", [i.bookingId]); caregiverId ??= b?.caregiver_id ?? null; recipientId = b?.care_recipient_id ?? null; }
  const c = code("INC");
  const r = await one<{ id: string }>(`INSERT INTO incidents (code, severity, category, summary, booking_id, caregiver_id, care_recipient_id, ticket_id, sos_id, owner_id, opened_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`, [c, i.severity, i.category, i.summary, i.bookingId ?? null, caregiverId, recipientId, i.ticketId ?? null, i.sosId ?? null, u?.id ?? null]);
  await q("INSERT INTO incident_events (incident_id, author_id, kind, body_enc) VALUES ($1,$2,'status',$3)", [r!.id, u?.id ?? null, enc(`Opened: ${i.severity}, ${i.category}. ${i.summary}`)]);
  if (["critical", "high"].includes(i.severity)) await notify(null, "incident_opened", { code: c, severity: i.severity, incidentId: r!.id }, "sms");
  if (u) await audit(u.id, "create", "incident", r!.id, `${i.severity} ${i.category}`);
  return { id: r!.id, code: c };
}
export async function incidents(f: { status?: string }) {
  const open = !f.status || f.status === "open";
  return q(`SELECT i.id, i.code, i.severity, i.category, i.status, i.summary, i.opened_at, i.closed_at, i.caregiver_action, o.name AS owner, b.code AS booking, c.display_name AS caregiver
    FROM incidents i LEFT JOIN users o ON o.id=i.owner_id LEFT JOIN bookings b ON b.id=i.booking_id LEFT JOIN caregivers c ON c.id=i.caregiver_id
    ${open ? "WHERE i.status <> 'closed'" : f.status === "all" ? "" : "WHERE i.status=$1"} ORDER BY (i.status='closed'), CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, i.opened_at DESC LIMIT 200`,
    open || f.status === "all" ? [] : [f.status]);
}
export async function incidentDetail(id: string) {
  const i = await one<any>(`SELECT i.*, o.name AS owner, b.code AS booking, c.display_name AS caregiver, c.status AS caregiver_status, r.name AS recipient, t.code AS ticket
    FROM incidents i LEFT JOIN users o ON o.id=i.owner_id LEFT JOIN bookings b ON b.id=i.booking_id LEFT JOIN caregivers c ON c.id=i.caregiver_id
    LEFT JOIN care_recipients r ON r.id=i.care_recipient_id LEFT JOIN tickets t ON t.id=i.ticket_id WHERE i.id=$1`, [id]);
  if (!i) throw new AppError("Not found", 404);
  const events = (await q<any>("SELECT e.kind, e.body_enc, e.at, u.name FROM incident_events e LEFT JOIN users u ON u.id=e.author_id WHERE e.incident_id=$1 ORDER BY e.id", [id])).map((e) => ({ ...e, body: dec(e.body_enc), body_enc: undefined }));
  return { incident: i, events };
}
export const IncidentIn = z.discriminatedUnion("action", [
  z.object({ action: z.literal("note"), body: z.string().min(1).max(3000) }),
  z.object({ action: z.literal("status"), status: z.enum(["open", "investigating", "action_taken"]) }),
  z.object({ action: z.literal("owner"), userId: z.string().uuid() }),
  z.object({ action: z.literal("severity"), severity: z.enum(["critical", "high", "medium", "low"]) }),
  z.object({ action: z.literal("caregiver"), caregiverAction: z.enum(["none", "coaching", "warning", "paused", "removed"]), reason: z.string().min(3).max(500) }),
  z.object({ action: z.literal("police"), reported: z.boolean(), reference: z.string().max(100).optional() }),
  z.object({ action: z.literal("close"), outcome: z.string().min(5).max(2000) }),
  z.object({ action: z.literal("reopen") }),
]);
export async function incidentAct(u: SessionUser & { opsRole: OpsRole }, id: string, a: z.infer<typeof IncidentIn>) {
  const i = await one<any>("SELECT * FROM incidents WHERE id=$1", [id]); if (!i) throw new AppError("Not found", 404);
  const log = (kind: string, body: string) => q("INSERT INTO incident_events (incident_id, author_id, kind, body_enc) VALUES ($1,$2,$3,$4)", [id, u.id, kind, enc(body)]);
  switch (a.action) {
    case "note": await log("note", a.body); break;
    case "status": await q("UPDATE incidents SET status=$2, updated_at=now() WHERE id=$1", [id, a.status]); await log("status", `Status: ${a.status.replace("_", " ")}`); break;
    case "owner": { const n = await one<any>("SELECT name FROM users WHERE id=$1 AND role='ops'", [a.userId]); if (!n) throw new AppError("Choose a team member");
      await q("UPDATE incidents SET owner_id=$2, updated_at=now() WHERE id=$1", [id, a.userId]); await log("status", `Owner: ${n.name}`); break; }
    case "severity": await q("UPDATE incidents SET severity=$2, updated_at=now() WHERE id=$1", [id, a.severity]); await log("status", `Severity: ${a.severity}`); break;
    case "caregiver": {
      if (!i.caregiver_id) throw new AppError("No caregiver is linked to this incident");
      if (a.caregiverAction === "removed" && u.opsRole !== "admin") throw new AuthError("Only an admin can remove a caregiver", 403);
      await q("UPDATE incidents SET caregiver_action=$2, status=CASE WHEN status IN ('open','investigating') THEN 'action_taken' ELSE status END, updated_at=now() WHERE id=$1", [id, a.caregiverAction]);
      if (a.caregiverAction === "paused" || a.caregiverAction === "removed") await setCaregiverStatus(u, i.caregiver_id, a.caregiverAction === "paused" ? "paused" : "exited", `Incident ${i.code}: ${a.reason}`);
      await log("action", `Caregiver: ${a.caregiverAction}. ${a.reason}`); break;
    }
    case "police": await q("UPDATE incidents SET police_reported=$2, updated_at=now() WHERE id=$1", [id, a.reported]); await log("action", a.reported ? `Reported to police${a.reference ? ", reference " + a.reference : ""}` : "Not reported to police"); break;
    case "close":
      if (["critical", "high"].includes(i.severity) && !i.caregiver_action && i.caregiver_id) throw new AppError("Record the caregiver action before closing a serious incident");
      await q("UPDATE incidents SET status='closed', outcome=$2, closed_at=now(), updated_at=now() WHERE id=$1", [id, a.outcome]); await log("status", `Closed: ${a.outcome}`);
      if (i.sos_id) await q("UPDATE sos_events SET resolved_at=COALESCE(resolved_at, now()), resolved_by=COALESCE(resolved_by,$2), resolution=COALESCE(resolution,$3) WHERE id=$1", [i.sos_id, u.id, a.outcome]);
      break;
    case "reopen": await q("UPDATE incidents SET status='investigating', closed_at=NULL, updated_at=now() WHERE id=$1", [id]); await log("status", "Reopened"); break;
  }
  await audit(u.id, "incident_" + a.action, "incident", id, "reason" in a ? a.reason : undefined);
  return incidentDetail(id);
}
export async function resolveSos(u: SessionUser, id: number, resolution: string) {
  await q("UPDATE sos_events SET resolved_at=now(), resolved_by=$2, resolution=$3 WHERE id=$1 AND resolved_at IS NULL", [id, u.id, resolution]);
  const inc = await one<any>("SELECT id FROM incidents WHERE sos_id=$1", [id]);
  if (inc) await q("INSERT INTO incident_events (incident_id, author_id, kind, body_enc) VALUES ($1,$2,'action',$3)", [inc.id, u.id, enc(`SOS handled: ${resolution}`)]);
  await q("UPDATE alerts SET status='resolved', resolved_at=now(), resolved_by=$2, resolution=$3, next_escalation_at=NULL WHERE id=(SELECT alert_id FROM incidents WHERE sos_id=$1) AND status <> 'resolved'", [id, u.id, resolution]);
  await audit(u.id, "resolve", "sos", String(id), resolution); return { ok: true };
}

// ───────── people ─────────
export async function caregivers(f: { status?: string; tier?: string; q?: string }) {
  const where: string[] = []; const args: any[] = [];
  if (f.status) { args.push(f.status); where.push(`c.status=$${args.length}::caregiver_status`); }
  if (f.tier) { args.push(Number(f.tier)); where.push(`c.tier=$${args.length}`); }
  if (f.q) { args.push("%" + f.q + "%"); where.push(`(c.display_name ILIKE $${args.length} OR c.area ILIKE $${args.length})`); }
  return q(`SELECT c.id, c.display_name, c.tier, c.status, c.area, c.online, c.rating::float, c.rating_count, c.care_types, c.photo_status,
      (SELECT count(*)::int FROM bookings b WHERE b.caregiver_id=c.id AND b.status IN ('accepted','enroute','arrived','active')) AS live_bookings,
      (SELECT count(*)::int FROM incidents i WHERE i.caregiver_id=c.id AND i.status <> 'closed') AS open_incidents
    FROM caregivers c ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY c.status, c.display_name LIMIT 300`, args);
}
export async function caregiverDetail(u: SessionUser, id: string) {
  const c = await one<any>("SELECT c.*, u.phone_last4, u.name AS user_name, u.created_at AS joined FROM caregivers c LEFT JOIN users u ON u.id=c.user_id WHERE c.id=$1", [id]);
  if (!c) throw new AppError("Not found", 404);
  const [stages, checks, books, earnings, incidentsRows, leave, ratings] = await Promise.all([
    q("SELECT stage, status, note, updated_at FROM onboarding_steps WHERE caregiver_id=$1 ORDER BY stage", [id]),
    q("SELECT kind, provider, result, last4, verified_at, expires_at FROM caregiver_verifications WHERE caregiver_id=$1", [id]),
    q("SELECT b.id, b.code, b.status, b.care_type, b.days, b.days_done, b.start_date, r.locality FROM bookings b JOIN care_recipients r ON r.id=b.care_recipient_id WHERE b.caregiver_id=$1 ORDER BY b.start_date DESC LIMIT 30", [id]),
    one<any>(`SELECT COALESCE(sum(credit_paise) FILTER (WHERE reason NOT LIKE 'weekly payout%'),0)::bigint AS earned, COALESCE(sum(debit_paise),0)::bigint AS paid_out,
      COALESCE(sum(credit_paise - debit_paise),0)::bigint AS balance FROM ledger_entries WHERE account=$1`, ["caregiver:" + id]),
    q("SELECT id, code, severity, status, summary, opened_at FROM incidents WHERE caregiver_id=$1 ORDER BY opened_at DESC", [id]),
    q("SELECT from_day, to_day, status, reason FROM leave_requests WHERE caregiver_id=$1 ORDER BY from_day DESC LIMIT 10", [id]),
    q("SELECT r.overall, r.areas, r.tags, r.public_text, r.created_at FROM reviews r JOIN bookings b ON b.id=r.booking_id WHERE b.caregiver_id=$1 ORDER BY r.created_at DESC LIMIT 10", [id]),
  ]);
  await audit(u.id, "view", "caregiver", id);
  return { caregiver: { ...c, pan_enc: undefined, bank_ref: c.bank_ref ? "on file" : null, lat: undefined, lng: undefined }, stages, checks, bookings: books, earnings, incidents: incidentsRows, leave, ratings };
}
async function setCaregiverStatus(u: SessionUser, id: string, status: "active" | "paused" | "exited", reason: string) {
  const c = await one<any>("SELECT user_id, status FROM caregivers WHERE id=$1", [id]); if (!c) throw new AppError("Not found", 404);
  await q("UPDATE caregivers SET status=$2::caregiver_status, online=CASE WHEN $2='active' THEN online ELSE false END WHERE id=$1", [id, status]);
  if (status !== "active") {
    // Waiting requests move to the next caregiver; families approve the substitute.
    const waiting = await q<{ id: string }>("SELECT id FROM bookings WHERE caregiver_id=$1 AND status IN ('offered','accepted')", [id]);
    for (const w of waiting) await tx(async (cl) => { const b = await lockBooking(cl, w.id); if (["offered", "accepted"].includes(b.status)) await toProposalTx(cl, b, u, "ops", "The caregiver is not available."); });
  }
  if (status === "exited" && c.user_id) {
    // Removed from Uday: every session ends now and her phone stops receiving family alerts.
    await q("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [c.user_id]); await q("DELETE FROM push_tokens WHERE user_id=$1", [c.user_id]);
  }
  if (status !== "active") {
    // Care already under way is never cut off by the system: a person decides. Each such booking gets an urgent help request.
    const live = await q<{ id: string; code: string; payer_id: string }>("SELECT id, code, payer_id FROM bookings WHERE caregiver_id=$1 AND status IN ('enroute','arrived','active')", [id]);
    for (const b of live) await q("INSERT INTO tickets (code, booking_id, user_id, category, urgent, sla_due_at) VALUES ($1,$2,$3,$4,true, now() + interval '15 minutes')",
      [code("TKT"), b.id, b.payer_id, `Caregiver ${status === "paused" ? "paused" : "removed"} while care is in progress: arrange a replacement`]);
  }
  if (c.user_id && status !== "exited") await notify(c.user_id, "stage_updated", { status });
  await audit(u.id, "status_" + status, "caregiver", id, reason);
}
export const CaregiverIn = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(["active", "paused", "exited"]), reason: z.string().min(3).max(300) }),
  z.object({ action: z.literal("tier"), tier: z.number().int().min(1).max(3), applyRates: z.boolean().default(true), reason: z.string().min(3).max(300) }),
  z.object({ action: z.literal("rates"), dayPaise: z.number().int().min(10000), nightPaise: z.number().int().min(10000), livePaise: z.number().int().min(10000), reason: z.string().min(3).max(300) }),
  z.object({ action: z.literal("care_types"), careTypes: z.array(z.enum(["day", "night", "live"])).min(1) }),
]);
export async function caregiverAct(u: SessionUser & { opsRole: OpsRole }, id: string, a: z.infer<typeof CaregiverIn>) {
  if (a.action !== "status" || a.status === "exited") if (u.opsRole !== "admin") throw new AuthError("Only an admin can change tier, rates or remove a caregiver", 403);
  if (a.action === "status") {
    if (a.status === "active") { const ok = await one("SELECT 1 FROM onboarding_steps WHERE caregiver_id=$1 AND stage=15 AND status='clear'", [id]);
      if (!ok) throw new AppError("Onboarding is not complete, so she cannot be made active"); }
    await setCaregiverStatus(u, id, a.status, a.reason);
  } else if (a.action === "tier") {
    const r = await tierRates(a.tier);
    await q(`UPDATE caregivers SET tier=$2 ${a.applyRates ? ", rate_day_paise=$3, rate_night_paise=$4, rate_live_paise=$5" : ""} WHERE id=$1`, a.applyRates ? [id, a.tier, ...r] : [id, a.tier]);
    await audit(u.id, "tier", "caregiver", id, `Tier ${a.tier}. ${a.reason}`);
  } else if (a.action === "rates") {
    await q("UPDATE caregivers SET rate_day_paise=$2, rate_night_paise=$3, rate_live_paise=$4 WHERE id=$1", [id, a.dayPaise, a.nightPaise, a.livePaise]);
    await audit(u.id, "rates", "caregiver", id, a.reason);
  } else { await q("UPDATE caregivers SET care_types=$2::care_type[] WHERE id=$1", [id, a.careTypes]); await audit(u.id, "care_types", "caregiver", id, a.careTypes.join(",")); }
  return caregiverDetail(u, id);
}
export async function families(f: { q?: string }) {
  const args: any[] = []; let where = "WHERE u.role IN ('family','senior')";
  if (f.q) { args.push("%" + f.q + "%"); where += ` AND (u.name ILIKE $1 OR u.city ILIKE $1 OR EXISTS (SELECT 1 FROM care_recipients r WHERE (r.owner_id=u.id OR r.senior_user_id=u.id) AND r.name ILIKE $1))`; }
  return q(`SELECT u.id, u.name, u.role, u.city, u.country, u.phone_last4, u.created_at, u.kyc_status,
      (SELECT string_agg(r.name, ', ') FROM care_recipients r JOIN family_members m ON m.care_recipient_id=r.id WHERE m.user_id=u.id) AS parents,
      (SELECT count(*)::int FROM bookings b WHERE b.payer_id=u.id) AS bookings,
      EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=u.id AND m.status='active') AS plus
    FROM users u ${where} ORDER BY u.created_at DESC LIMIT 200`, args);
}
export async function personDetail(u: SessionUser, id: string) {
  const p = await one<any>("SELECT id, name, role, city, country, email, phone_last4, created_at, kyc_status, aadhaar_last4, language FROM users WHERE id=$1", [id]);
  if (!p) throw new AppError("Not found", 404);
  const recipients = await q<any>(`SELECT r.id, r.name, r.locality, r.checkin_by, r.has_phone, r.checkin_mode, m.role AS family_role,
      (SELECT max(at) FROM checkins k WHERE k.care_recipient_id=r.id) AS last_checkin,
      (SELECT count(*)::int FROM checkins k WHERE k.care_recipient_id=r.id AND k.at > now() - interval '7 days') AS checkins_7d
    FROM care_recipients r LEFT JOIN family_members m ON m.care_recipient_id=r.id AND m.user_id=$1 WHERE m.user_id=$1 OR r.senior_user_id=$1`, [id]);
  const rids = recipients.map((r) => r.id);
  const [books, tks, family, sos, leads] = await Promise.all([
    rids.length ? q("SELECT b.id, b.code, b.status, b.care_type, b.days, b.start_date, b.total_paise, c.display_name FROM bookings b JOIN caregivers c ON c.id=b.caregiver_id WHERE b.care_recipient_id = ANY($1::uuid[]) ORDER BY b.start_date DESC LIMIT 30", [rids]) : [],
    q("SELECT id, code, category, status, created_at FROM tickets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20", [id]),
    rids.length ? q("SELECT DISTINCT u.id, u.name, m.role, u.phone_last4 FROM family_members m JOIN users u ON u.id=m.user_id WHERE m.care_recipient_id = ANY($1::uuid[]) AND u.id <> $2", [rids, id]) : [],
    q("SELECT id, at, resolved_at FROM sos_events WHERE user_id=$1 ORDER BY at DESC LIMIT 10", [id]),
    q("SELECT kind, status, created_at FROM leads WHERE user_id=$1 ORDER BY created_at DESC", [id]),
  ]);
  await audit(u.id, "view", "user", id);
  return { person: p, recipients, bookings: books, tickets: tks, family, sos, leads };
}

// ───────── team ─────────
export async function team() {
  return q(`SELECT u.id, u.name, u.phone_last4, m.role, m.active, m.created_at, (SELECT max(created_at) FROM sessions s WHERE s.user_id=u.id) AS last_sign_in
    FROM users u JOIN ops_members m ON m.user_id=u.id ORDER BY m.active DESC, u.name`);
}
export const TeamIn = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), phone: z.string().min(10).max(16), name: z.string().min(2).max(80), role: z.enum(["admin", "agent", "finance", "viewer"]) }),
  z.object({ action: z.literal("role"), userId: z.string().uuid(), role: z.enum(["admin", "agent", "finance", "viewer"]) }),
  z.object({ action: z.literal("active"), userId: z.string().uuid(), active: z.boolean() }),
]);
export async function teamAct(u: SessionUser, a: z.infer<typeof TeamIn>) {
  if (a.action === "add") {
    let phone: string; try { phone = normalisePhone(a.phone); } catch { throw new AppError("Check the phone number"); }
    const ex = await one<any>("SELECT id, role FROM users WHERE phone_hash=$1", [lookupHash(phone)]);
    if (ex && ex.role !== "ops") throw new AppError("This number is already used by a family, senior or caregiver account. Use a different number for team work.");
    const id = ex?.id ?? (await one<{ id: string }>("INSERT INTO users (phone_hash, phone_enc, phone_last4, name, role) VALUES ($1,$2,$3,$4,'ops') RETURNING id", [lookupHash(phone), enc(phone), phone.slice(-4), a.name]))!.id;
    await q("INSERT INTO ops_members (user_id, role, added_by) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET role=$2, active=true, updated_at=now()", [id, a.role, u.id]);
    await audit(u.id, "add", "team", id, a.role);
  } else {
    if (a.userId === u.id) throw new AppError("You cannot change your own access");
    const admins = (await one<{ n: number }>("SELECT count(*)::int AS n FROM ops_members WHERE role='admin' AND active AND user_id <> $1", [a.userId]))?.n ?? 0;
    if (((a.action === "role" && a.role !== "admin") || (a.action === "active" && !a.active)) && !admins) throw new AppError("Keep at least one active admin");
    if (a.action === "role") await q("UPDATE ops_members SET role=$2, updated_at=now() WHERE user_id=$1", [a.userId, a.role]);
    else { await q("UPDATE ops_members SET active=$2, updated_at=now() WHERE user_id=$1", [a.userId, a.active]); if (!a.active) await q("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [a.userId]); }
    await audit(u.id, a.action, "team", a.userId, a.action === "role" ? a.role : a.active ? "on" : "off");
  }
  return team();
}

// ───────── audit and message log ─────────
export async function auditLog(f: { entity?: string; actor?: string; from?: string; to?: string }) {
  const where: string[] = []; const args: any[] = [];
  if (f.entity) { args.push(f.entity); where.push(`a.entity=$${args.length}`); }
  if (f.actor) { args.push(f.actor); where.push(`a.actor_id=$${args.length}`); }
  if (f.from) { args.push(f.from); where.push(`a.at >= $${args.length}::date`); }
  if (f.to) { args.push(f.to); where.push(`a.at < $${args.length}::date + 1`); }
  return q(`SELECT a.id, a.action, a.entity, a.entity_id, a.reason, a.at, u.name AS actor, u.role FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY a.id DESC LIMIT 300`, args);
}
export async function messageLog(f: { channel?: string; template?: string }) {
  const where: string[] = []; const args: any[] = [];
  if (f.channel) { args.push(f.channel); where.push(`n.channel=$${args.length}`); }
  if (f.template) { args.push(f.template); where.push(`n.template=$${args.length}`); }
  return q(`SELECT n.id, n.channel, n.template, n.status, n.at, u.name, u.role FROM notifications n LEFT JOIN users u ON u.id=n.user_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY n.id DESC LIMIT 300`, args);
}
