import { z } from "zod";
import { careNeed, checklistFor, distanceKm, matchScore, type CareType } from "@uday/core";
import { one, q } from "./db";
import { dec, decJson, enc } from "./crypto";
import type { SessionUser } from "./auth";
import { AppError } from "./bookings";
import { familyRole } from "./bookings";
import { claudeConnected, claudeJson, claudeText } from "./providers";

/**
 * AI assisted care. The rule for every function here: AI may summarise, flag and suggest, from what people
 * recorded. It never diagnoses, never changes or starts medicines and never decides care. Every AI step has a
 * rules based fallback, and AI runs on a senior's data only when the family turned on "AI help" for that senior.
 */
const NO_CLINICAL = "You support an elder care service in India. Never diagnose, never name an illness, never suggest, change or stop medicines, never give medical advice. Use only the facts given. If something may need a doctor, say the family may want to ask their doctor.";
const LANG_NAME: Record<string, string> = { en: "English", hi: "Hindi", mr: "Marathi" };

// ───────── consent: AI help per senior ─────────
export async function aiHelpOn(recipientId: string | null | undefined) {
  if (!recipientId) return false;
  return !!(await one("SELECT 1 FROM consents WHERE care_recipient_id=$1 AND purpose='ai_help' AND withdrawn_at IS NULL", [recipientId]));
}
/** AI is used for this senior only with the family's consent and a connected Claude account. */
export async function aiAllowed(recipientId: string | null | undefined) { return (await aiHelpOn(recipientId)) && (await claudeConnected()); }
export const AI_HELP_ABOUT = [
  "With AI help on, Uday sends the caregiver's notes for your parent to Claude, an AI made by Anthropic, to write short daily updates and spot notes a person should check.",
  "It can also read a document you upload to suggest appointment dates for you to confirm, and sort what your parent says to Speak to Uday.",
  "AI never diagnoses, never changes medicines and never decides care. A person reviews every flag.",
  "Turn it off at any time. Uday then uses fixed rules and written templates instead.",
];
export async function getAiHelp(u: SessionUser, rid: string) {
  if (!(await familyRole(u.id, rid))) throw new AppError("Not found", 404);
  return { on: await aiHelpOn(rid), connected: await claudeConnected(), about: AI_HELP_ABOUT };
}
export async function setAiHelp(u: SessionUser, rid: string, on: boolean) {
  const role = await familyRole(u.id, rid); if (!role || !["owner", "care_manager"].includes(role)) throw new AppError("Only the family member who manages care can change this", 403);
  await q("UPDATE consents SET withdrawn_at=now() WHERE care_recipient_id=$1 AND purpose='ai_help' AND withdrawn_at IS NULL", [rid]);
  if (on) await q("INSERT INTO consents (care_recipient_id, purpose, scope, granted_by, on_behalf) VALUES ($1,'ai_help','{\"summaries\":true,\"flags\":true,\"documents\":true,\"voice\":true}',$2,true)", [rid, u.id]);
  await q("INSERT INTO audit_log (actor_id, action, entity, entity_id, reason) VALUES ($1,'consent','care_recipient',$2,$3)", [u.id, rid, on ? "AI help on" : "AI help off"]);
  return { on };
}

// ───────── care matching ─────────
const BUSY = "('accepted','enroute','arrived','active')";
export const MatchQuery = z.object({
  type: z.enum(["day", "night", "live"]), tier: z.coerce.number().int().min(1).max(3).optional(),
  recipientId: z.string().uuid().optional(), need: z.string().max(40).optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), days: z.coerce.number().int().min(1).max(90).optional(),
});
/**
 * Caregivers ranked for one booking, each with the reasons behind the rank ("Why this match").
 * Without a senior or dates it still ranks by rating and skills, and says less.
 */
export async function matchCaregivers(u: SessionUser | null, i: z.infer<typeof MatchQuery>) {
  let r: any = null;
  if (i.recipientId && u) {
    if (!(await familyRole(u.id, i.recipientId))) throw new AppError("Not found", 404);
    r = await one<any>("SELECT id, languages, locality, lat, lng FROM care_recipients WHERE id=$1", [i.recipientId]);
  }
  const need = i.need ? careNeed(i.need) : undefined;
  const days = i.start ? i.days ?? 1 : 0;
  const rows = await q<any>(`SELECT c.id, c.display_name, c.initials, c.tier, c.care_types, c.languages, c.skills, c.area, c.service_areas, c.lat, c.lng, c.experience_years, c.gender,
      c.rating::float, c.rating_count, c.rate_day_paise, c.rate_night_paise, c.rate_live_paise, (c.photo_status='verified') AS photo,
      EXISTS(SELECT 1 FROM caregiver_verifications v WHERE v.caregiver_id=c.id AND v.kind='police' AND v.result='clear') AS police_verified,
      EXISTS(SELECT 1 FROM caregiver_verifications v WHERE v.caregiver_id=c.id AND v.kind='identity' AND v.result='clear') AS id_verified,
      CASE WHEN $4::int > 0 THEN (SELECT count(*)::int FROM generate_series($3::date, $3::date + ($4::int - 1), interval '1 day') d(day)
         WHERE EXISTS (SELECT 1 FROM bookings b WHERE b.caregiver_id=c.id AND b.status IN ${BUSY} AND d.day >= b.start_date AND d.day < b.start_date + b.days)
            OR EXISTS (SELECT 1 FROM caregiver_unavailable x WHERE x.caregiver_id=c.id AND x.day=d.day::date)
            OR EXISTS (SELECT 1 FROM leave_requests l WHERE l.caregiver_id=c.id AND l.status='approved' AND d.day BETWEEN l.from_day AND l.to_day)) ELSE 0 END AS busy,
      (SELECT rv.stars FROM bookings b JOIN reviews rv ON rv.booking_id=b.id WHERE b.caregiver_id=c.id AND b.care_recipient_id=$5::uuid ORDER BY rv.created_at DESC LIMIT 1) AS rehire
    FROM caregivers c WHERE c.status='active' AND $1 = ANY(c.care_types) AND ($2::int IS NULL OR c.tier=$2::int)`,
    [i.type, i.tier ?? null, days ? i.start : null, days, r?.id ?? null]);
  const out = rows.map((c) => {
    const km = r?.lat != null && c.lat != null ? distanceKm({ lat: r.lat, lng: r.lng }, { lat: c.lat, lng: c.lng }) : null;
    const loc = (r?.locality ?? "").toLowerCase();
    const sameArea = !!loc && [c.area, ...(c.service_areas ?? [])].some((a: string) => (a ?? "").toLowerCase() === loc);
    const m = matchScore({ tier: c.tier, skills: c.skills ?? [], languages: c.languages ?? [], rating: Number(c.rating ?? 0), ratingCount: c.rating_count ?? 0,
      needTier: need?.tier, needSkills: need?.skills, seniorLanguages: r?.languages ?? [], km, sameArea, daysAsked: days, daysBusy: c.busy ?? 0, rehireStars: c.rehire ?? null });
    const { lat, lng, service_areas, busy, rehire, ...pub } = c;
    return { ...pub, match: m };
  });
  return out.sort((a, b) => b.match.score - a.match.score || b.rating - a.rating);
}

// ───────── daily family update ─────────
async function dayFacts(bookingId: string, day: number) {
  const b = await one<any>(`SELECT b.id, b.care_recipient_id, b.tier, b.payer_id, r.name AS senior, c.display_name AS caregiver,
      (SELECT language FROM users WHERE id=b.payer_id) AS lang
    FROM bookings b JOIN care_recipients r ON r.id=b.care_recipient_id LEFT JOIN caregivers c ON c.id=b.caregiver_id WHERE b.id=$1`, [bookingId]);
  if (!b) return null;
  const logs = await q<any>("SELECT id, meal, meds, mood, note_enc, checklist_enc, vitals_enc, at FROM shift_logs WHERE booking_id=$1 AND day=$2 ORDER BY at", [bookingId, day]);
  if (!logs.length) return null;
  const times = await q<any>("SELECT kind, min(at) AS at FROM attendance WHERE booking_id=$1 AND day=$2 AND kind IN ('start','end','day_close') GROUP BY kind", [bookingId, day]);
  const done = new Set<string>(); logs.forEach((l) => Object.keys(decJson<Record<string, string>>(l.checklist_enc) ?? {}).forEach((k) => done.add(k)));
  const items = checklistFor(Math.min(b.tier, 3) as 1 | 2 | 3).flatMap((s) => s.items);
  const last = logs[logs.length - 1];
  const t = (k: string) => { const x = times.find((y) => y.kind === k)?.at; return x ? new Date(x).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null; };
  return { b, facts: {
    senior: b.senior, caregiver: (b.caregiver ?? "The caregiver").split(" ")[0], day,
    started: t("start"), ended: t("end") ?? t("day_close"),
    tasksDone: items.filter((i) => done.has(i.id)).length, tasksTotal: items.length,
    notMarked: items.filter((i) => !done.has(i.id)).map((i) => i.label),
    mood: last.mood, meal: logs.some((l) => l.meal === true) ? "caregiver says given" : logs.some((l) => l.meal === false) ? "caregiver says not eaten" : null,
    medicines: logs.some((l) => l.meds === false) ? "caregiver says NOT given" : logs.some((l) => l.meds === true) ? "caregiver says given as prescribed" : null,
    notes: logs.map((l) => dec(l.note_enc)).filter(Boolean) as string[],
  } };
}
function templateUpdate(f: NonNullable<Awaited<ReturnType<typeof dayFacts>>>["facts"]) {
  const first = f.senior.split(" ")[0];
  const lines = [`${f.caregiver} was with ${first}${f.started ? ` from ${f.started}` : ""}${f.ended ? ` to ${f.ended}` : ""}.`,
    `${f.tasksDone} of ${f.tasksTotal} care tasks marked done. Mood: ${f.mood}.`];
  const extra = [f.meal && `Meal: ${f.meal}`, f.medicines && `Medicines: ${f.medicines}`].filter(Boolean);
  if (extra.length) lines.push(extra.join(". ") + ".");
  if (f.notes.length) lines.push(`${f.caregiver} wrote: "${f.notes[f.notes.length - 1].slice(0, 160)}"`);
  if (f.notMarked.length && f.ended) lines.push(`Not marked done: ${f.notMarked.slice(0, 4).join(", ")}${f.notMarked.length > 4 ? " and more" : ""}.`);
  return lines.join(" ");
}
/**
 * Writes the day's short update for the family from what the caregiver recorded. The template version is written
 * at once; when AI help is on, Claude then rewrites it in the family's language from the same facts only.
 */
export async function refreshDailyUpdate(bookingId: string, day: number, opts: { ai?: boolean } = {}) {
  const x = await dayFacts(bookingId, day); if (!x) return null;
  const text = templateUpdate(x.facts);
  await q(`INSERT INTO daily_updates (booking_id, day, care_recipient_id, summary_enc, source) VALUES ($1,$2,$3,$4,'template')
    ON CONFLICT (booking_id, day) DO UPDATE SET summary_enc=EXCLUDED.summary_enc, source='template', updated_at=now()`, [bookingId, day, x.b.care_recipient_id, enc(text, "health")]);
  if (opts.ai !== false && (await aiAllowed(x.b.care_recipient_id))) {
    const lang = LANG_NAME[x.b.lang] ?? "English";
    const ai = await claudeText(`${NO_CLINICAL}\nWrite a warm, plain update for a family member about their parent's care today, in ${lang}. Three or four short sentences. Say who cared, what was done, mood, meal and medicines exactly as the caregiver recorded them, anything not marked done, and anything the caregiver noted. Do not add facts. Do not reassure about health.`,
      JSON.stringify(x.facts), 300);
    if (ai) await q("UPDATE daily_updates SET summary_enc=$3, source='ai', updated_at=now() WHERE booking_id=$1 AND day=$2", [bookingId, day, enc(ai.slice(0, 900), "health")]);
  }
  return text;
}
export async function dailyUpdates(bookingId: string) {
  return (await q<any>("SELECT day, summary_enc, source, updated_at FROM daily_updates WHERE booking_id=$1 ORDER BY day DESC", [bookingId]))
    .map((d) => ({ day: d.day, text: dec(d.summary_enc), source: d.source, label: d.source === "ai" ? "Summary written by AI from the caregiver's records" : "Summary from the caregiver's records", at: d.updated_at }));
}
/** The latest update for each senior this family member follows. */
export async function latestUpdates(u: SessionUser) {
  return (await q<any>(`SELECT DISTINCT ON (d.care_recipient_id) d.booking_id, d.day, d.summary_enc, d.source, d.updated_at, r.name, b.code
    FROM daily_updates d JOIN family_members f ON f.care_recipient_id=d.care_recipient_id AND f.user_id=$1 AND f.accepted_at IS NOT NULL
    JOIN care_recipients r ON r.id=d.care_recipient_id JOIN bookings b ON b.id=d.booking_id
    ORDER BY d.care_recipient_id, d.updated_at DESC`, [u.id]))
    .map((d) => ({ bookingId: d.booking_id, code: d.code, day: d.day, name: d.name, text: dec(d.summary_enc), source: d.source, at: d.updated_at }));
}

// ───────── care monitoring ─────────
export const FLAG_WORDS: Record<string, string> = {
  fall: "possible fall", medicines_not_given: "medicines not given", meal_not_eaten: "did not eat", low_mood: "low mood",
  skin: "skin concern", pain: "pain reported", breathing: "breathing", confusion: "confusion", vomiting: "vomiting", fever: "fever", bleeding: "bleeding", observation: "note to check",
};
/** English words only. Notes in Hindi or Marathi are checked by AI when AI help is on. */
const RULES: [string, RegExp][] = [
  ["fall", /\b(fell|fall(en)?|slipped|tripped)\b/i], ["breathing", /\b(breath(less|ing)?|short of breath|gasp)/i],
  ["confusion", /\b(confus|disorient|did not recogni[sz]e|forgetful today)/i], ["vomiting", /\b(vomit|threw up|nause)/i],
  ["fever", /\b(fever|temperature high|hot to touch)\b/i], ["bleeding", /\b(blood|bleed)/i], ["pain", /\b(pain|hurt|ache)/i],
  ["meal_not_eaten", /\b(did ?n[o']t eat|not eating|refused (food|lunch|dinner|breakfast)|skipped (lunch|dinner|breakfast))/i],
  ["medicines_not_given", /\b(refused (medicine|meds|tablet)|missed (medicine|meds|tablet|dose))/i],
];
/** Reads one shift record for things a person should look at. Flags go to Operations, never as an emergency. */
export async function checkShiftLog(logId: string) {
  const l = await one<any>("SELECT s.*, b.care_recipient_id FROM shift_logs s JOIN bookings b ON b.id=s.booking_id WHERE s.id=$1", [logId]);
  if (!l) return [];
  const note = dec(l.note_enc) ?? ""; const vitals = decJson<any>(l.vitals_enc) ?? {};
  const found = new Map<string, { detail: string; source: "rules" | "ai" }>();
  if (l.meds === false) found.set("medicines_not_given", { detail: "Caregiver recorded medicines as not given", source: "rules" });
  if (l.meal === false) found.set("meal_not_eaten", { detail: "Caregiver recorded the meal as not eaten", source: "rules" });
  if (/^(low|sad|upset|unwell|withdrawn|anxious)/i.test(l.mood ?? "")) found.set("low_mood", { detail: `Mood recorded as ${l.mood}`, source: "rules" });
  if (vitals.skinConcern) found.set("skin", { detail: "Caregiver ticked a skin concern", source: "rules" });
  if ((vitals.pain ?? 0) >= 5) found.set("pain", { detail: `Pain recorded as ${vitals.pain} out of 10`, source: "rules" });
  for (const [kind, re] of RULES) { const m = note.match(re); if (m && !found.has(kind)) found.set(kind, { detail: `Note says: "${excerpt(note, m.index ?? 0)}"`, source: "rules" }); }
  if (note && (await aiAllowed(l.care_recipient_id))) {
    const ai = await claudeJson<{ flags: { kind: string; quote: string }[] }>(`${NO_CLINICAL}\nYou read a caregiver's shift note, in any language, and list observations a care coordinator should look at: a fall, not eating, medicines refused or missed, pain, breathing trouble, confusion, vomiting, fever, bleeding, low mood, skin problems, or anything else unusual. Do not judge how serious it is. Use kind values: ${Object.keys(FLAG_WORDS).join(", ")}. Quote the note's own words. Format: {"flags":[{"kind":"...","quote":"..."}]}. If nothing, {"flags":[]}.`, note, 400);
    for (const f of ai?.flags ?? []) if (FLAG_WORDS[f.kind] && !found.has(f.kind)) found.set(f.kind, { detail: `Note says: "${String(f.quote).slice(0, 200)}"`, source: "ai" });
  }
  for (const [kind, f] of found) await q(`INSERT INTO care_flags (booking_id, care_recipient_id, shift_log_id, day, kind, detail_enc, source) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (shift_log_id, kind) DO NOTHING`,
    [l.booking_id, l.care_recipient_id, l.id, l.day, kind, enc(f.detail, "health"), f.source]);
  return [...found.keys()];
}
const excerpt = (t: string, at: number) => t.slice(Math.max(0, at - 50), at + 90).trim();
export async function opsFlags(status: "open" | "reviewed" = "open") {
  return (await q<any>(`SELECT f.id, f.booking_id, f.day, f.kind, f.detail_enc, f.source, f.status, f.created_at, f.review_note, r.name, r.locality, b.code, c.display_name AS caregiver
    FROM care_flags f LEFT JOIN care_recipients r ON r.id=f.care_recipient_id LEFT JOIN bookings b ON b.id=f.booking_id LEFT JOIN caregivers c ON c.id=b.caregiver_id
    WHERE f.status=$1 ORDER BY f.created_at DESC LIMIT 200`, [status]))
    .map((f) => ({ id: Number(f.id), bookingId: f.booking_id, code: f.code, day: f.day, what: FLAG_WORDS[f.kind] ?? f.kind, kind: f.kind, detail: dec(f.detail_enc), source: f.source, at: f.created_at, senior: f.name, locality: f.locality, caregiver: f.caregiver, note: f.review_note }));
}
export async function reviewFlag(u: SessionUser, id: number, note: string) {
  const r = await one("UPDATE care_flags SET status='reviewed', review_note=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$1 AND status='open' RETURNING id", [id, note.slice(0, 500), u.id]);
  if (!r) throw new AppError("Not found", 404);
  await q("INSERT INTO audit_log (actor_id, action, entity, entity_id, reason) VALUES ($1,'care_flag_reviewed','care_flag',$2,$3)", [u.id, String(id), note.slice(0, 200)]);
  return { ok: true };
}

/** After a care record is saved: rebuild the family's daily update and check the note. Never blocks the caregiver on AI. */
export async function afterCareRecord(bookingId: string, action: string) {
  const b = await one<any>("SELECT days_done FROM bookings WHERE id=$1", [bookingId]); if (!b) return;
  const day = action === "log" ? b.days_done + 1 : b.days_done;
  const last = await one<{ id: string; day: number }>("SELECT id, day FROM shift_logs WHERE booking_id=$1 ORDER BY at DESC LIMIT 1", [bookingId]);
  const d = action === "log" && last ? last.day : day;
  await refreshDailyUpdate(bookingId, d, { ai: false }).catch((e) => console.error("[daily update]", e));
  if (action === "log" && last) await checkShiftLog(last.id).catch((e) => console.error("[care check]", e));
  // The AI rewrite can take seconds: run it after the response.
  setTimeout(() => refreshDailyUpdate(bookingId, d).catch(() => {}), 0);
}

// ───────── tomorrow's risks ─────────
const istDate = (offsetDays: number) => new Date(Date.now() + 5.5 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
/**
 * Shifts on a day that are likely to go wrong, with the reasons and up to three free standby caregivers.
 * Rules only, from Uday's own records: nothing here is sent to an AI.
 */
export async function shiftRisks(date = istDate(1)) {
  const rows = await q<any>(`SELECT b.id, b.code, b.status, b.care_type, b.tier, b.start_date, b.start_time, b.days, b.care_need, b.caregiver_id, b.care_recipient_id,
      ($1::date - b.start_date) + 1 AS day_no, r.name, r.locality, r.lat AS rlat, r.lng AS rlng,
      c.display_name AS caregiver, c.status AS cg_status, c.lat AS clat, c.lng AS clng
    FROM bookings b JOIN care_recipients r ON r.id=b.care_recipient_id LEFT JOIN caregivers c ON c.id=b.caregiver_id
    WHERE b.status IN ('offered','proposal','accepted','enroute','arrived','active') AND $1::date >= b.start_date AND $1::date < b.start_date + b.days
    ORDER BY b.start_time`, [date]);
  const out = [];
  for (const b of rows) {
    const reasons: { text: string; level: "high" | "medium" }[] = [];
    if (["offered", "proposal"].includes(b.status)) reasons.push({ text: "No caregiver has accepted yet", level: "high" });
    if (b.caregiver_id) {
      if (b.cg_status !== "active") reasons.push({ text: `Caregiver is ${b.cg_status}`, level: "high" });
      if (await one("SELECT 1 FROM caregiver_unavailable WHERE caregiver_id=$1 AND day=$2", [b.caregiver_id, date])) reasons.push({ text: "Caregiver marked this day unavailable", level: "high" });
      const lv = await one<any>("SELECT status FROM leave_requests WHERE caregiver_id=$1 AND status IN ('pending','approved') AND $2::date BETWEEN from_day AND to_day LIMIT 1", [b.caregiver_id, date]);
      if (lv) reasons.push({ text: lv.status === "approved" ? "Caregiver has approved leave" : "Caregiver asked for leave on this day", level: "high" });
      const dbl = await one<{ n: number }>(`SELECT count(*)::int AS n FROM bookings WHERE caregiver_id=$1 AND id<>$2 AND status IN ${BUSY} AND $3::date >= start_date AND $3::date < start_date + days`, [b.caregiver_id, b.id, date]);
      if ((dbl?.n ?? 0) > 0) reasons.push({ text: "Caregiver is booked elsewhere the same day", level: "high" });
      const late = await one<{ late: number; total: number }>(`SELECT count(*) FILTER (WHERE a.at > ((x.start_date + (a.day - 1)) + x.start_time) AT TIME ZONE 'Asia/Kolkata' + interval '15 minutes')::int AS late, count(*)::int AS total
        FROM attendance a JOIN bookings x ON x.id=a.booking_id WHERE x.caregiver_id=$1 AND a.kind='arrived' AND a.at > now() - interval '30 days'`, [b.caregiver_id]);
      if (late && late.total >= 3 && late.late / late.total >= 0.3) reasons.push({ text: `Arrived late on ${late.late} of the last ${late.total} shifts`, level: "medium" });
      const ns = await one<{ n: number }>(`SELECT count(*)::int AS n FROM tickets t JOIN bookings x ON x.id=t.booking_id WHERE x.caregiver_id=$1 AND t.category='Caregiver did not arrive' AND t.created_at > now() - interval '60 days'`, [b.caregiver_id]);
      if ((ns?.n ?? 0) > 0) reasons.push({ text: `${ns!.n} no show${ns!.n > 1 ? "s" : ""} in the last 60 days`, level: "medium" });
      if (b.rlat != null && b.clat != null) { const km = distanceKm({ lat: b.rlat, lng: b.rlng }, { lat: b.clat, lng: b.clng }); if (km > 12) reasons.push({ text: `Long journey, about ${Math.round(km)} km`, level: "medium" }); }
    }
    if (!reasons.length) continue;
    const standby = (await matchCaregivers(null, { type: b.care_type as CareType, tier: b.tier, need: b.care_need ?? undefined, start: date, days: 1 }))
      .filter((c: any) => c.id !== b.caregiver_id && c.match.available).slice(0, 3).map((c: any) => ({ id: c.id, name: c.display_name, tier: c.tier, rating: c.rating, reasons: c.match.reasons }));
    out.push({ bookingId: b.id, code: b.code, senior: b.name, locality: b.locality, caregiver: b.caregiver, day: b.day_no, time: String(b.start_time).slice(0, 5), careType: b.care_type,
      level: reasons.some((r) => r.level === "high") ? "high" : "medium", reasons, standby });
  }
  return { date, shifts: rows.length, atRisk: out.sort((a, b) => (a.level === b.level ? 0 : a.level === "high" ? -1 : 1)) };
}

// ───────── weekly quality report ─────────
export function weekStart(d = istDate(0)) { const x = new Date(d + "T00:00:00Z"); const dow = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - dow); return x.toISOString().slice(0, 10); }
/**
 * One week of reliability and complaints, per caregiver and per area. Numbers come straight from Uday's records.
 * Reliability score out of 100: on time 40, care records complete 20, family rating 30, minus 15 for each no show.
 */
export async function weeklyQuality(week = weekStart()) {
  const from = week, to = new Date(new Date(week + "T00:00:00Z").getTime() + 7 * 86400e3).toISOString().slice(0, 10);
  const span = `$1::date AND $2::date`;
  const cg = await q<any>(`WITH att AS (
      SELECT x.caregiver_id, a.booking_id, a.day, a.at, ((x.start_date + (a.day - 1)) + x.start_time) AT TIME ZONE 'Asia/Kolkata' AS due
      FROM attendance a JOIN bookings x ON x.id=a.booking_id WHERE a.kind='arrived' AND (a.at AT TIME ZONE 'Asia/Kolkata')::date >= $1::date AND (a.at AT TIME ZONE 'Asia/Kolkata')::date < $2::date)
    SELECT c.id, c.display_name, c.tier, c.area,
      (SELECT count(*)::int FROM att WHERE att.caregiver_id=c.id) AS shifts,
      (SELECT count(*)::int FROM att WHERE att.caregiver_id=c.id AND att.at <= att.due + interval '15 minutes') AS on_time,
      (SELECT count(*)::int FROM att WHERE att.caregiver_id=c.id AND EXISTS (SELECT 1 FROM shift_logs s WHERE s.booking_id=att.booking_id AND s.day=att.day)) AS logged,
      (SELECT count(*)::int FROM tickets t JOIN bookings x ON x.id=t.booking_id WHERE x.caregiver_id=c.id AND t.category='Caregiver did not arrive' AND (t.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $1::date AND (t.created_at AT TIME ZONE 'Asia/Kolkata')::date < $2::date) AS no_shows,
      (SELECT count(*)::int FROM tickets t JOIN bookings x ON x.id=t.booking_id WHERE x.caregiver_id=c.id AND (t.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $1::date AND (t.created_at AT TIME ZONE 'Asia/Kolkata')::date < $2::date) AS complaints,
      (SELECT round(avg(rv.stars)::numeric, 2)::float FROM reviews rv JOIN bookings x ON x.id=rv.booking_id WHERE x.caregiver_id=c.id AND (rv.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $1::date AND (rv.created_at AT TIME ZONE 'Asia/Kolkata')::date < $2::date) AS rating
    FROM caregivers c WHERE c.status IN ('active','paused')`, [from, to]);
  const caregivers = cg.filter((c) => c.shifts || c.no_shows || c.complaints).map((c) => {
    const onTime = c.shifts ? c.on_time / c.shifts : null, logged = c.shifts ? c.logged / c.shifts : null;
    const score = Math.max(0, Math.round((onTime ?? 1) * 40 + (logged ?? 1) * 20 + ((c.rating ?? 4.5) / 5) * 30 + 10 - c.no_shows * 15));
    return { id: c.id, name: c.display_name, tier: c.tier, area: c.area, shifts: c.shifts, onTimePct: onTime == null ? null : Math.round(onTime * 100), recordsPct: logged == null ? null : Math.round(logged * 100),
      noShows: c.no_shows, complaints: c.complaints, rating: c.rating, score, watch: c.no_shows > 0 || (onTime != null && onTime < 0.85) || (c.rating != null && c.rating < 4.3) };
  }).sort((a, b) => a.score - b.score);
  const areas = new Map<string, { area: string; shifts: number; late: number; noShows: number; complaints: number }>();
  for (const c of caregivers) { const k = c.area || "Unknown"; const a = areas.get(k) ?? { area: k, shifts: 0, late: 0, noShows: 0, complaints: 0 };
    a.shifts += c.shifts; a.late += c.shifts - Math.round(((c.onTimePct ?? 100) / 100) * c.shifts); a.noShows += c.noShows; a.complaints += c.complaints; areas.set(k, a); }
  const categories = await q<any>(`SELECT category, count(*)::int AS n FROM tickets WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date >= $1::date AND (created_at AT TIME ZONE 'Asia/Kolkata')::date < $2::date GROUP BY category ORDER BY n DESC`, [from, to]);
  const lowTags = await q<any>(`SELECT t AS tag, count(*)::int AS n FROM reviews rv, unnest(rv.tags) t WHERE rv.stars <= 3 AND (rv.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $1::date AND (rv.created_at AT TIME ZONE 'Asia/Kolkata')::date < $2::date GROUP BY t ORDER BY n DESC LIMIT 10`, [from, to]);
  const flags = await q<any>(`SELECT kind, count(*)::int AS n FROM care_flags WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date >= $1::date AND (created_at AT TIME ZONE 'Asia/Kolkata')::date < $2::date GROUP BY kind ORDER BY n DESC`, [from, to]);
  const themes = await one<any>("SELECT themes, source, created_at FROM quality_themes WHERE week=$1", [week]);
  void span;
  return { week, to, caregivers, areas: [...areas.values()].sort((a, b) => b.noShows + b.late - (a.noShows + a.late)),
    complaints: categories, lowRatingTags: lowTags, careFlags: flags.map((f) => ({ what: FLAG_WORDS[f.kind] ?? f.kind, n: f.n })),
    themes: themes ? { items: themes.themes, source: themes.source, at: themes.created_at } : null, aiConnected: await claudeConnected() };
}
const redact = (t: string) => t.replace(/\+?\d[\d\s-]{7,}\d/g, "[number]").replace(/\S+@\S+/g, "[email]");
/** Groups the week's complaint and review texts into recurring themes. Phone numbers and emails are removed first. */
export async function buildThemes(u: SessionUser, week = weekStart()) {
  const to = new Date(new Date(week + "T00:00:00Z").getTime() + 7 * 86400e3).toISOString().slice(0, 10);
  const texts = [
    ...(await q<any>(`SELECT t.category, t.text_enc, x.caregiver_id, c.area FROM tickets t LEFT JOIN bookings x ON x.id=t.booking_id LEFT JOIN caregivers c ON c.id=x.caregiver_id
      WHERE t.created_at >= $1::date AND t.created_at < $2::date`, [week, to])).map((t) => `Complaint [${t.category}] in ${t.area ?? "unknown area"}: ${redact(dec(t.text_enc) ?? "")}`),
    ...(await q<any>(`SELECT rv.stars, rv.note_enc, rv.public_text, c.area FROM reviews rv JOIN bookings x ON x.id=rv.booking_id LEFT JOIN caregivers c ON c.id=x.caregiver_id
      WHERE rv.stars <= 3 AND rv.created_at >= $1::date AND rv.created_at < $2::date`, [week, to])).map((r) => `Review ${r.stars} stars in ${r.area ?? "unknown area"}: ${redact(dec(r.note_enc) ?? r.public_text ?? "")}`),
  ].slice(0, 200);
  let items: { theme: string; count: number; example: string }[] = []; let source = "rules";
  if (texts.length) {
    const ai = await claudeJson<{ themes: typeof items }>("You help an elder care company improve service. Group these complaints and low reviews into at most 6 recurring service themes (for example lateness in one area, poor communication, hygiene). Count how many items fall under each. Give one short example in the people's own words with names removed. Do not name individuals. Format: {\"themes\":[{\"theme\":\"...\",\"count\":3,\"example\":\"...\"}]}", texts.join("\n"), 700);
    if (ai?.themes?.length) { items = ai.themes.slice(0, 6); source = "ai"; }
  }
  if (!items.length) {
    const m = new Map<string, number>(); for (const t of texts) { const k = t.match(/^(Complaint \[[^\]]+\]|Review \d stars)/)?.[0] ?? "Other"; m.set(k, (m.get(k) ?? 0) + 1); }
    items = [...m].map(([theme, count]) => ({ theme, count, example: "" })).sort((a, b) => b.count - a.count);
  }
  await q(`INSERT INTO quality_themes (week, themes, source, created_by) VALUES ($1,$2,$3,$4) ON CONFLICT (week) DO UPDATE SET themes=EXCLUDED.themes, source=EXCLUDED.source, created_by=EXCLUDED.created_by, created_at=now()`, [week, JSON.stringify(items), source, u.id]);
  return { items, source };
}
