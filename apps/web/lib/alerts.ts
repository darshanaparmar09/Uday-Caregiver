import { createHash, randomBytes } from "node:crypto";
import { one, q } from "./db";
import { dec } from "./crypto";
import { notify, type Template } from "./notify";
import { sendSmsAuto } from "./providers";
import { AppError } from "./bookings";
import { SITE_URL } from "./seo";
import type { SessionUser } from "./auth";

/**
 * Urgent alerts: SOS, "I need help", "I need medical help", a missed daily check in, a safety report,
 * and danger words in the companion chat.
 *
 * Rules this module enforces:
 *  1. Nothing is called "sent" unless a provider accepted it. Test mode logging is recorded as "simulated".
 *  2. An alert stays OPEN until a person acknowledges it: a family member in the app, a contact through the
 *     link in their SMS, or the Uday team. Sending a message is not an acknowledgement.
 *  3. Until then it escalates on a timer: local contact and family first, then every emergency contact and the
 *     Uday on call phone again, repeating, and it stays on the operations console throughout.
 *  4. The person who raised it is told the truth: who was reached, who has responded, and to call 112 if nobody has.
 *
 * Uday is not an emergency service. Every message says to call 112 when there is danger to life.
 */
export type AlertKind = "sos" | "checkin_help" | "checkin_medical" | "checkin_missed" | "safety_report" | "companion_crisis";
const URGENT: AlertKind[] = ["sos", "checkin_help", "checkin_medical", "companion_crisis"];
const TEMPLATE: Record<AlertKind, Template> = { sos: "sos", checkin_help: "checkin_help", checkin_medical: "checkin_medical", checkin_missed: "checkin_missed", safety_report: "safety_report", companion_crisis: "checkin_help" };
const WORDS: Record<AlertKind, string> = { sos: "pressed SOS", checkin_help: "asked for help", checkin_medical: "asked for medical help", checkin_missed: "has not checked in today", safety_report: "reported fraud or a crime", companion_crisis: "may need help now" };
const MAX_LEVEL = 4;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

async function settings() {
  const p = await one<any>("SELECT oncall_phones, urgent_escalate_min, missed_escalate_min FROM policy_settings WHERE id=1").catch(() => null);
  const phones = [...(p?.oncall_phones ?? "").split(","), ...(process.env.OPS_ONCALL_PHONES ?? "").split(",")].map((x: string) => x.trim()).filter((x: string) => /^\+\d{8,15}$/.test(x));
  return { oncall: [...new Set(phones)] as string[], urgentMin: p?.urgent_escalate_min ?? 5, missedMin: p?.missed_escalate_min ?? 30 };
}

export interface RaiseIn { kind: AlertKind; recipientId?: string | null; bookingId?: string | null; raisedBy: string | null; raisedRole: string; lat?: number; lng?: number }
/** Raises an alert, or joins the one already open for the same person, and sends the first round of messages. */
export async function raiseAlert(i: RaiseIn) {
  // One open alert per person and kind: pressing SOS five times is one emergency, not five.
  const open = await one<{ id: string }>(`SELECT id FROM alerts WHERE status <> 'resolved' AND kind=$1 AND created_at > now() - interval '6 hours'
    AND ((care_recipient_id IS NOT NULL AND care_recipient_id=$2) OR (care_recipient_id IS NULL AND raised_by=$3)) ORDER BY created_at DESC LIMIT 1`, [i.kind, i.recipientId ?? null, i.raisedBy]);
  if (open) { await q("UPDATE alerts SET repeats=repeats+1, lat=COALESCE($2,lat), lng=COALESCE($3,lng) WHERE id=$1", [open.id, i.lat ?? null, i.lng ?? null]); return alertStatus(open.id); }
  const s = await settings(); const mins = URGENT.includes(i.kind) ? s.urgentMin : s.missedMin;
  const a = await one<{ id: string }>(`INSERT INTO alerts (kind, care_recipient_id, booking_id, raised_by, raised_role, lat, lng, next_escalation_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7, now() + ($8 || ' minutes')::interval) RETURNING id`, [i.kind, i.recipientId ?? null, i.bookingId ?? null, i.raisedBy, i.raisedRole, i.lat ?? null, i.lng ?? null, String(mins)]);
  await dispatch(a!.id, 0);
  // The operations console always gets it. A critical incident is opened for the kinds that can mean danger.
  if (i.kind === "sos" || i.kind === "checkin_medical") {
    const { openIncident } = await import("./ops");
    const name = await subjectName(i.recipientId ?? null, i.raisedBy);
    const inc = await openIncident(null, { severity: "critical", category: i.kind === "sos" ? "safety" : "medical", summary: `${name} ${WORDS[i.kind]} (${i.raisedRole})`, bookingId: i.bookingId ?? undefined }).catch((e) => { console.error("incident for alert failed", e); return null; });
    if (inc) await q("UPDATE incidents SET alert_id=$2 WHERE id=$1", [inc.id, a!.id]);
  }
  return alertStatus(a!.id);
}
async function subjectName(recipientId: string | null, userId: string | null) {
  if (recipientId) { const r = await one<{ name: string }>("SELECT name FROM care_recipients WHERE id=$1", [recipientId]); if (r) return r.name; }
  if (userId) { const u = await one<{ name: string }>("SELECT name FROM users WHERE id=$1", [userId]); if (u?.name) return u.name; }
  return "Someone";
}

/** One round of messages. Level 0: family in the app and by SMS, local contacts, on call. Level 1 and up: everyone, again. */
async function dispatch(alertId: string, level: number) {
  const a = await one<any>("SELECT * FROM alerts WHERE id=$1", [alertId]); if (!a || a.status !== "open") return;
  const name = await subjectName(a.care_recipient_id, a.raised_by); const first = name.split(" ")[0];
  const where = a.lat != null ? ` Location: https://maps.google.com/?q=${a.lat},${a.lng}` : "";
  const record = (target: string, userId: string | null, who: string | null, last4: string | null, channel: string, status: string, error?: string, tokenHash?: string) =>
    q("INSERT INTO alert_deliveries (alert_id, level, target, user_id, name, phone_last4, channel, status, error, token_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [alertId, level, target, userId, who, last4, channel, status, error ?? null, tokenHash ?? null]);
  let reached = 0;
  // 1. Family members with an Uday account: push and SMS.
  const family = a.care_recipient_id ? await q<any>("SELECT u.id, u.name, u.phone_last4 FROM family_members m JOIN users u ON u.id=m.user_id WHERE m.care_recipient_id=$1 AND m.accepted_at IS NOT NULL AND u.deleted_at IS NULL", [a.care_recipient_id]) : [];
  const familyLast4 = new Set(family.map((f) => f.phone_last4));
  for (const f of family) {
    if (f.id === a.raised_by) continue;
    const o = await notify(f.id, TEMPLATE[a.kind as AlertKind], { alertId, recipientId: a.care_recipient_id, level }, "sms").catch((e) => ({ status: "failed" as const, error: String(e?.message ?? e), channels: {} }));
    const st = o.status === "sent" ? "sent" : o.status === "simulated" ? "simulated" : o.status === "no_channel" ? "no_channel" : "failed";
    await record("family", f.id, f.name, f.phone_last4, Object.keys(o.channels ?? {}).join("+") || "push", st, (o as any).error);
    if (st === "sent") reached++;
  }
  // 2. Emergency contacts by SMS, with a link to acknowledge without the app. Local contacts first; everyone from level 1, and at once for SOS.
  const contacts = a.care_recipient_id ? await q<any>("SELECT id, name, phone_enc, is_local FROM emergency_contacts WHERE care_recipient_id=$1 ORDER BY is_local DESC", [a.care_recipient_id]) : [];
  for (const c of contacts) {
    if (!c.is_local && level === 0 && a.kind !== "sos") continue;
    const phone = dec(c.phone_enc); if (!phone) { await record("contact", null, c.name, null, "sms", "no_channel", "No phone number"); continue; }
    if (familyLast4.has(phone.slice(-4)) && level === 0) continue; // already messaged as a family member
    const token = randomBytes(9).toString("base64url");
    const text = `Uday alert: ${first} ${WORDS[a.kind as AlertKind]}. Please call or visit them now. If you cannot reach them and fear danger, call 112.${where} Tell us you are responding: ${SITE_URL}/a/${token}`;
    try { const r: any = await sendSmsAuto(phone, text); await record("contact", null, c.name, phone.slice(-4), "sms", r.simulated ? "simulated" : "sent", undefined, hash(token)); if (!r.simulated) reached++; }
    catch (e: any) { await record("contact", null, c.name, phone.slice(-4), "sms", "failed", String(e?.message ?? e).slice(0, 200)); }
  }
  // 3. The Uday on call phone, so an alert never depends on someone watching a screen.
  const s = await settings();
  if (!s.oncall.length) await record("ops", null, "Uday on call", null, "sms", "no_channel", "No on call phone is set in Operations, Pricing and policy");
  for (const p of s.oncall) {
    try { const r: any = await sendSmsAuto(p, `Uday ${level ? "ESCALATION " + level : "ALERT"}: ${name} ${WORDS[a.kind as AlertKind]}. Not yet acknowledged. Open the operations console.${where}`);
      await record("ops", null, "Uday on call", p.slice(-4), "sms", r.simulated ? "simulated" : "sent"); if (!r.simulated) reached++; }
    catch (e: any) { await record("ops", null, "Uday on call", p.slice(-4), "sms", "failed", String(e?.message ?? e).slice(0, 200)); }
  }
  await notify(null, TEMPLATE[a.kind as AlertKind], { alertId, recipientId: a.care_recipient_id, level, escalate: level > 0 });
  await q("UPDATE alerts SET reached=reached+$2 WHERE id=$1", [alertId, reached]);
}

/** Cron: every open alert past its timer goes up one level and is sent again. After the last level it stays open on the console. */
export async function sweepAlerts() {
  const s = await settings();
  const due = await q<any>("SELECT id, kind, level FROM alerts WHERE status='open' AND next_escalation_at <= now() ORDER BY created_at LIMIT 50");
  for (const a of due) {
    const level = a.level + 1; const mins = URGENT.includes(a.kind) ? s.urgentMin : s.missedMin;
    // Claim the row first, so two overlapping cron runs cannot both send.
    const got = await one("UPDATE alerts SET level=$2::int, next_escalation_at=CASE WHEN $2::int >= $3::int THEN NULL ELSE now() + ($4 || ' minutes')::interval END WHERE id=$1 AND status='open' AND level=$5 RETURNING id", [a.id, level, MAX_LEVEL, String(mins), a.level]);
    if (!got) continue;
    await dispatch(a.id, level).catch((e) => console.error("alert escalation failed", a.id, e));
    if (level === 1) {
      // An unanswered alert also becomes an urgent help request, so it has an owner and a clock on the help desk.
      const al = await one<any>("SELECT raised_by, care_recipient_id, booking_id FROM alerts WHERE id=$1", [a.id]);
      const owner = al.raised_by ?? (await one<{ owner_id: string }>("SELECT owner_id FROM care_recipients WHERE id=$1", [al.care_recipient_id]))?.owner_id;
      if (owner) await q(`INSERT INTO tickets (code, booking_id, user_id, category, urgent, sla_due_at) VALUES ($1,$2,$3,$4,true, now() + interval '15 minutes')`,
        ["TKT" + Date.now().toString(36).toUpperCase().slice(-6) + Math.floor(Math.random() * 36).toString(36).toUpperCase(), al.booking_id, owner, `Unanswered alert: ${WORDS[a.kind as AlertKind]}`]).catch((e) => console.error("ticket for alert failed", e));
    }
  }
  return due.length;
}

/** What the person who raised the alert, the family and the console are shown. Counts only real deliveries as reached. */
export async function alertStatus(id: string) {
  const a = await one<any>("SELECT * FROM alerts WHERE id=$1", [id]); if (!a) throw new AppError("Not found", 404);
  const d = await q<any>("SELECT target, name, phone_last4, channel, status, level, at FROM alert_deliveries WHERE alert_id=$1 ORDER BY id", [id]);
  const people = (st: string) => [...new Set(d.filter((x) => x.status === st && x.target !== "ops").map((x) => x.name).filter(Boolean))];
  return {
    id: a.id, kind: a.kind, status: a.status, level: a.level, createdAt: a.created_at, recipientId: a.care_recipient_id,
    reached: people("sent"), simulated: people("simulated"), failed: people("failed"),
    opsReached: d.some((x) => x.target === "ops" && x.status === "sent"), opsSimulated: d.some((x) => x.target === "ops" && x.status === "simulated"),
    anyoneReached: d.some((x) => x.status === "sent"), testMode: d.length > 0 && d.every((x) => x.status === "simulated" || x.status === "no_channel"),
    acknowledgedBy: a.acknowledged_name ?? null, acknowledgedAt: a.acknowledged_at, resolvedAt: a.resolved_at,
  };
}
/** The person who raised it can watch for a response. Family members of the same parent can too. */
export async function alertFor(u: SessionUser, id: string) {
  const a = await one<any>("SELECT raised_by, care_recipient_id FROM alerts WHERE id=$1", [id]); if (!a) throw new AppError("Not found", 404);
  if (a.raised_by !== u.id && u.role !== "ops" && !(await canSee(u.id, a.care_recipient_id))) throw new AppError("Not found", 404);
  return alertStatus(id);
}
async function canSee(userId: string, recipientId: string | null) {
  if (!recipientId) return false;
  return !!(await one("SELECT 1 FROM family_members WHERE care_recipient_id=$1 AND user_id=$2 AND accepted_at IS NOT NULL UNION SELECT 1 FROM care_recipients WHERE id=$1 AND senior_user_id=$2", [recipientId, userId]));
}

async function ack(id: string, by: string | null, name: string, via: string) {
  const a = await one<any>(`UPDATE alerts SET status='acknowledged', acknowledged_at=now(), acknowledged_by=$2, acknowledged_name=$3, ack_via=$4, next_escalation_at=NULL
    WHERE id=$1 AND status='open' RETURNING raised_by, care_recipient_id, kind`, [id, by, name, via]);
  if (!a) return false;
  // Tell the person who needs help, and the rest of the family, that someone is responding. Only now may any screen say so.
  const tell = new Set<string>(); if (a.raised_by) tell.add(a.raised_by);
  if (a.care_recipient_id) { const r = await one<{ senior_user_id: string }>("SELECT senior_user_id FROM care_recipients WHERE id=$1", [a.care_recipient_id]); if (r?.senior_user_id) tell.add(r.senior_user_id);
    for (const f of await q<{ user_id: string }>("SELECT user_id FROM family_members WHERE care_recipient_id=$1 AND accepted_at IS NOT NULL", [a.care_recipient_id])) tell.add(f.user_id); }
  if (by) tell.delete(by);
  for (const t of tell) await notify(t, "alert_ack", { alertId: id, by: name }).catch(() => {});
  return true;
}
/** Family member in the app or on the website: "I am responding". */
export async function acknowledge(u: SessionUser, id: string) {
  const a = await one<any>("SELECT care_recipient_id, raised_by, status FROM alerts WHERE id=$1", [id]); if (!a) throw new AppError("Not found", 404);
  if (u.role !== "ops" && !(await one("SELECT 1 FROM family_members WHERE care_recipient_id=$1 AND user_id=$2 AND accepted_at IS NOT NULL", [a.care_recipient_id, u.id]))) throw new AppError("Not found", 404);
  if (a.raised_by === u.id && u.role !== "ops") throw new AppError("Someone else needs to respond to your alert");
  await ack(id, u.id, u.role === "ops" ? "Uday team" : (u.name ?? "A family member").split(" ")[0], u.role === "ops" ? "console" : "app");
  return alertStatus(id);
}
/** Contact without the app: the link in their SMS. Shows only a first name and what happened. */
export async function linkInfo(token: string) {
  const d = await one<any>(`SELECT d.name AS contact, a.id, a.kind, a.status, a.created_at, a.acknowledged_name, a.care_recipient_id, a.raised_by FROM alert_deliveries d JOIN alerts a ON a.id=d.alert_id
    WHERE d.token_hash=$1 AND a.created_at > now() - interval '48 hours'`, [hash(token)]);
  if (!d) return null;
  const first = (await subjectName(d.care_recipient_id, d.raised_by)).split(" ")[0];
  return { contact: d.contact, first, what: WORDS[d.kind as AlertKind], status: d.status, at: d.created_at, acknowledgedBy: d.acknowledged_name, alertId: d.id as string };
}
export async function acknowledgeByLink(token: string) {
  const i = await linkInfo(token); if (!i) throw new AppError("This link has expired", 404);
  await ack(i.alertId, null, (i.contact ?? "A contact").split(" ")[0], "sms_link");
  return linkInfo(token);
}
/** Closes alerts once the cause is gone, for example the senior checks in after a missed check in alert. */
export async function resolveAlertsFor(recipientId: string, kinds: AlertKind[], why: string, by?: string) {
  await q("UPDATE alerts SET status='resolved', resolved_at=now(), resolved_by=$4, resolution=$3, next_escalation_at=NULL WHERE care_recipient_id=$1 AND kind = ANY($2::text[]) AND status <> 'resolved'", [recipientId, kinds, why, by ?? null]);
}
export async function resolveAlert(u: SessionUser, id: string, why: string) {
  const a = await one<any>("SELECT care_recipient_id, raised_by FROM alerts WHERE id=$1", [id]); if (!a) throw new AppError("Not found", 404);
  const fam = await one("SELECT 1 FROM family_members WHERE care_recipient_id=$1 AND user_id=$2 AND accepted_at IS NOT NULL", [a.care_recipient_id, u.id]);
  if (u.role !== "ops" && !fam && a.raised_by !== u.id) throw new AppError("Not found", 404);
  await q("UPDATE alerts SET status='resolved', resolved_at=now(), resolved_by=$2, resolution=$3, next_escalation_at=NULL WHERE id=$1 AND status <> 'resolved'", [id, u.id, why.slice(0, 300)]);
  return alertStatus(id);
}
/** Open alerts for the parents this family member looks after, newest first. Shown as a banner in the app and on the website. */
export async function myAlerts(u: SessionUser) {
  const rows = await q<any>(`SELECT a.id, a.kind, a.status, a.level, a.created_at, a.acknowledged_name, a.raised_by, r.name FROM alerts a JOIN care_recipients r ON r.id=a.care_recipient_id
    JOIN family_members m ON m.care_recipient_id=r.id AND m.user_id=$1 AND m.accepted_at IS NOT NULL WHERE a.status <> 'resolved' AND a.created_at > now() - interval '24 hours' ORDER BY a.created_at DESC LIMIT 10`, [u.id]);
  return rows.map((a) => ({ id: a.id, kind: a.kind, what: WORDS[a.kind as AlertKind], name: a.name, status: a.status, level: a.level, at: a.created_at, acknowledgedBy: a.acknowledged_name, mine: a.raised_by === u.id }));
}
/** Operations console: every alert that is not resolved, with who was reached and who has responded. */
export async function opsAlerts() {
  const rows = await q<any>(`SELECT a.*, r.name AS recipient, r.locality, u.name AS raised_name, b.code AS booking,
      (SELECT count(*)::int FROM alert_deliveries d WHERE d.alert_id=a.id AND d.status='sent') AS sent,
      (SELECT count(*)::int FROM alert_deliveries d WHERE d.alert_id=a.id AND d.status='failed') AS failed,
      (SELECT count(*)::int FROM alert_deliveries d WHERE d.alert_id=a.id AND d.status='simulated') AS simulated
    FROM alerts a LEFT JOIN care_recipients r ON r.id=a.care_recipient_id LEFT JOIN users u ON u.id=a.raised_by LEFT JOIN bookings b ON b.id=a.booking_id
    WHERE a.status <> 'resolved' ORDER BY (a.status='open') DESC, a.created_at DESC LIMIT 50`);
  return rows.map((a) => ({ id: a.id, kind: a.kind, what: WORDS[a.kind as AlertKind], status: a.status, level: a.level, at: a.created_at, who: a.recipient ?? a.raised_name ?? "Someone", locality: a.locality, role: a.raised_role,
    booking: a.booking, bookingId: a.booking_id, lat: a.lat, lng: a.lng, sent: a.sent, failed: a.failed, simulated: a.simulated, acknowledgedBy: a.acknowledged_name, repeats: a.repeats, recipientId: a.care_recipient_id, raisedBy: a.raised_by }));
}
