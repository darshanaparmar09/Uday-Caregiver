import { z } from "zod";
import { THOUGHTS, TRIVIA, WORDS, dailyPick, medSlots, postProblem } from "@uday/core";
import { one, q, tx } from "./db";
import { dec, decJson, encJson, enc } from "./crypto";
import { notify } from "./notify";
import { AppError, familyRole } from "./bookings";
import type { SessionUser } from "./auth";

/**
 * Senior mode, restored from the first Uday builds: home with streak and "your people",
 * medicines taken, brain games, community groups, events and people nearby, safety help.
 */
export const istDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const display = (name: string | null) => { const p = (name ?? "Member").trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; };

export async function recipientOf(u: SessionUser) {
  if (u.role !== "senior") throw new AppError("For seniors only", 403);
  const r = await one<any>("SELECT id, name, locality, checkin_by FROM care_recipients WHERE senior_user_id=$1 AND senior_link='confirmed' ORDER BY created_at LIMIT 1", [u.id]);
  if (!r) throw new AppError("Your family has not linked your profile yet. Ask them to add your number in Uday.", 404);
  return r as { id: string; name: string; locality: string; checkin_by: string };
}
async function familyOf(rid: string) { return q<{ user_id: string }>("SELECT user_id FROM family_members WHERE care_recipient_id=$1 AND accepted_at IS NOT NULL", [rid]); }

/** Consecutive days with a check in, counting back from today (or yesterday if not yet today). */
export async function streak(rid: string) {
  const days = (await q<{ d: string }>("SELECT DISTINCT (at AT TIME ZONE 'Asia/Kolkata')::date::text AS d FROM checkins WHERE care_recipient_id=$1 AND at > now() - interval '400 days' ORDER BY d DESC", [rid])).map((r) => r.d);
  const set = new Set(days); let n = 0; const d = new Date();
  if (!set.has(istDay(d))) d.setDate(d.getDate() - 1);
  while (set.has(istDay(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ───────── home ─────────
/** Families who entered this person's number and are waiting for them to agree. Shown before anything else in senior mode. */
export async function linkRequests(u: SessionUser) {
  const me = await one<{ phone_hash: string }>("SELECT phone_hash FROM users WHERE id=$1", [u.id]);
  return q<any>(`SELECT r.id, r.name AS your_name, o.name AS family_name, o.phone_last4, o.city FROM care_recipients r JOIN users o ON o.id=r.owner_id
    WHERE r.senior_phone_hash=$1 AND r.senior_link='pending' AND r.senior_user_id IS NULL AND o.deleted_at IS NULL ORDER BY r.created_at`, [me?.phone_hash ?? ""]);
}
/** The parent says yes or no. Only yes lets that family see check ins, medicines and alerts, and adds them to "your people". */
export async function answerLink(u: SessionUser, recipientId: string, accept: boolean) {
  if (u.role !== "senior") throw new AppError("For seniors only", 403);
  const me = await one<{ phone_hash: string }>("SELECT phone_hash FROM users WHERE id=$1", [u.id]);
  const r = await one<{ owner_id: string }>(`UPDATE care_recipients SET senior_link=$3, senior_user_id=CASE WHEN $3='confirmed' THEN $2::uuid ELSE NULL END
    WHERE id=$1 AND senior_phone_hash=$4 AND senior_link='pending' RETURNING owner_id`, [recipientId, u.id, accept ? "confirmed" : "declined", me?.phone_hash ?? ""]);
  if (!r) throw new AppError("This request is no longer open", 404);
  await q("INSERT INTO consents (care_recipient_id, purpose, scope, granted_by, on_behalf) VALUES ($1,'family_link',$2,$3,false)", [recipientId, JSON.stringify({ accepted: accept }), u.id]).catch(() => {});
  await q("INSERT INTO audit_log (actor_id, action, entity, entity_id, reason) VALUES ($1,$2,'senior_link',$3,$4)", [u.id, accept ? "accept" : "decline", recipientId, "parent's own decision"]);
  await notify(r.owner_id, "senior_link", { recipientId, accepted: accept });
  return { ok: true, accepted: accept };
}
export async function home(u: SessionUser) {
  const r = await one<any>("SELECT id, name, locality, checkin_by FROM care_recipients WHERE senior_user_id=$1 AND senior_link='confirmed' ORDER BY created_at LIMIT 1", [u.id]);
  if (!r) return { linked: false, requests: await linkRequests(u) };
  const today = istDay();
  const last = await one<any>("SELECT status, at FROM checkins WHERE care_recipient_id=$1 ORDER BY at DESC LIMIT 1", [r.id]);
  const checkedInToday = !!last && istDay(new Date(last.at)) === today;
  const contacts = (await q<any>("SELECT name, relation, phone_enc, is_local FROM emergency_contacts WHERE care_recipient_id=$1 ORDER BY is_local, name LIMIT 6", [r.id]))
    .map((c) => ({ name: c.name, relation: c.relation, phone: dec(c.phone_enc), local: c.is_local }));
  const m = await meds(u, r.id);
  const played = await q<{ game: string }>("SELECT DISTINCT game FROM game_plays WHERE user_id=$1 AND day=$2", [u.id, today]);
  const namastes = await one<{ n: number }>("SELECT count(*)::int AS n FROM namastes WHERE to_user=$1 AND seen_at IS NULL", [u.id]);
  const next = await one<any>(`SELECT e.id, e.title, e.place, e.starts_at FROM community_events e JOIN event_rsvps v ON v.event_id=e.id AND v.user_id=$1
    WHERE e.status='live' AND e.starts_at > now() ORDER BY e.starts_at LIMIT 1`, [u.id]);
  // Who is caring for me today: the booked caregiver, or the relief caregiver on her day off.
  const bk = await one<any>(`SELECT b.id, b.status, b.care_type, b.days, b.days_done, b.away, c.id AS cg_id, c.display_name, c.tier, c.photo_status FROM bookings b JOIN caregivers c ON c.id=b.caregiver_id
    WHERE b.care_recipient_id=$1 AND b.status IN ('accepted','enroute','arrived','active') AND b.start_date <= current_date + 1 ORDER BY b.start_date LIMIT 1`, [r.id]);
  let caregiver: any = null;
  if (bk) {
    const rel = bk.away ? await one<any>("SELECT c.id, c.display_name, c.tier, c.photo_status, r.status FROM relief_shifts r JOIN caregivers c ON c.id=r.caregiver_id WHERE r.booking_id=$1 AND r.day_no=$2", [bk.id, bk.days_done + 1]) : null;
    const who = rel ?? { id: bk.cg_id, display_name: bk.display_name, tier: bk.tier, photo_status: bk.photo_status };
    const st = rel ? ({ accepted: "coming today", arrived: "at your door", active: "with you today" } as any)[rel.status] ?? "coming today" : ({ accepted: "coming", enroute: "on the way", arrived: "at your door", active: "with you today" } as any)[bk.status];
    caregiver = { name: who.display_name, first: who.display_name.split(" ")[0], tier: who.tier, relief: !!rel, status: st, photo: who.photo_status === "verified" ? `/api/caregivers/${who.id}/photo` : null,
      day: Math.min(bk.days_done + 1, bk.days), days: bk.days, careType: bk.care_type };
  }
  const dayOfYear = Math.floor((Date.parse(today) - Date.parse(today.slice(0, 4) + "-01-01")) / 864e5);
  return { linked: true, name: r.name, locality: r.locality, checkinBy: String(r.checkin_by).slice(0, 5), checkedInToday, lastStatus: last?.status ?? null, lastAt: last?.at ?? null,
    streak: await streak(r.id), contacts, nextAppointment: await (await import("./appointments")).nextForSenior(r.id), thought: THOUGHTS[dayOfYear % THOUGHTS.length],
    meds: { due: m.items.filter((i) => !i.taken).length, total: m.items.length, next: m.items.find((i) => !i.taken) ?? null },
    gamesToday: played.map((p) => p.game), caregiver, newNamastes: namastes?.n ?? 0, nextEvent: next };
}

// ───────── medicines ─────────
const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
const SLOT_ORDER = ["morning", "afternoon", "evening", "night", "daily"] as const;
export async function meds(u: SessionUser, rid?: string) {
  const id = rid ?? (await recipientOf(u)).id;
  const h = await one<any>("SELECT medicines_enc FROM health_profiles WHERE care_recipient_id=$1", [id]);
  const list = (decJson<any[]>(h?.medicines_enc) ?? []);
  const taken = await q<any>("SELECT med_key, slot, taken_at FROM med_doses WHERE care_recipient_id=$1 AND day=$2", [id, istDay()]);
  const done = new Map(taken.map((t) => [`${t.med_key}|${t.slot}`, t.taken_at]));
  const items = list.flatMap((m) => medSlots(m.times).map((slot) => ({ key: key(m.name), name: m.name, dose: m.dose, times: m.times, withFood: !!m.withFood, slot, taken: done.has(`${key(m.name)}|${slot}`), takenAt: done.get(`${key(m.name)}|${slot}`) ?? null })));
  items.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  return { items, hasProfile: !!h };
}
export async function markDose(u: SessionUser, medKey: string, slot: string, taken: boolean) {
  const r = await recipientOf(u);
  const { items } = await meds(u, r.id);
  if (!items.some((i) => i.key === medKey && i.slot === slot)) throw new AppError("Medicine not found");
  if (taken) await q("INSERT INTO med_doses (care_recipient_id, med_key, slot, day, marked_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [r.id, medKey, slot, istDay(), u.id]);
  else await q("DELETE FROM med_doses WHERE care_recipient_id=$1 AND med_key=$2 AND slot=$3 AND day=$4", [r.id, medKey, slot, istDay()]);
  return meds(u, r.id);
}
export const MedIn = z.object({ name: z.string().min(2).max(80), dose: z.string().max(60).default(""), slots: z.array(z.enum(["morning", "afternoon", "evening", "night"])).min(1) });
/** A senior may add their own medicine. It goes into the same encrypted health profile the family sees, with history kept. */
export async function addMedicine(u: SessionUser, i: z.infer<typeof MedIn>) {
  const r = await recipientOf(u);
  await tx(async (c) => {
    const h = (await c.query("SELECT * FROM health_profiles WHERE care_recipient_id=$1 FOR UPDATE", [r.id])).rows[0];
    const list = decJson<any[]>(h?.medicines_enc) ?? [];
    if (list.some((m) => key(m.name) === key(i.name))) throw new AppError("This medicine is already on your list");
    list.push({ name: i.name.trim(), dose: i.dose, times: i.slots.join(", "), givenBy: "self" });
    if (h) { await c.query("INSERT INTO health_profile_history (care_recipient_id, snapshot_enc, changed_by) VALUES ($1,$2,$3)", [r.id, encJson({ medicines: decJson(h.medicines_enc) }), u.id]);
      await c.query("UPDATE health_profiles SET medicines_enc=$2, updated_by=$3, updated_at=now() WHERE care_recipient_id=$1", [r.id, encJson(list), u.id]); }
    else await c.query("INSERT INTO health_profiles (care_recipient_id, medicines_enc, updated_by, updated_at) VALUES ($1,$2,$3, now())", [r.id, encJson(list), u.id]);
    await c.query("INSERT INTO audit_log (actor_id, action, entity, entity_id) VALUES ($1,'health_update','care_recipient',$2)", [u.id, r.id]);
  });
  return meds(u, r.id);
}

// ───────── brain games ─────────
export async function games(u: SessionUser) {
  const today = istDay();
  const rows = await q<any>("SELECT game, max(score) AS best, count(*)::int AS n FROM game_plays WHERE user_id=$1 AND day=$2 GROUP BY game", [u.id, today]);
  const days = (await q<{ d: string }>("SELECT DISTINCT day::text AS d FROM game_plays WHERE user_id=$1 AND day > current_date - 60 ORDER BY d DESC", [u.id])).map((r) => r.d);
  const set = new Set(days); let s = 0; const d = new Date(); if (!set.has(istDay(d))) d.setDate(d.getDate() - 1);
  while (set.has(istDay(d))) { s++; d.setDate(d.getDate() - 1); }
  const words = dailyPick(WORDS, today, 5).map((w) => ({ ...w, letters: dailyPick([...w.word], today + w.word, w.word.length).join("") }));
  return { day: today, today: Object.fromEntries(rows.map((r) => [r.game, { best: r.best, plays: r.n }])), streak: s, daysThisWeek: days.filter((x) => Date.parse(x) > Date.now() - 7 * 864e5).length,
    trivia: dailyPick(TRIVIA, today, 5), words };
}
export async function savePlay(u: SessionUser, game: "memory" | "trivia" | "words", score: number, seconds?: number) {
  if (u.role !== "senior") throw new AppError("For seniors only", 403);
  await q("INSERT INTO game_plays (user_id, game, score, seconds, day) VALUES ($1,$2,$3,$4,$5)", [u.id, game, Math.max(0, Math.min(score, 10000)), seconds ?? null, istDay()]);
  return games(u);
}

// ───────── community ─────────
export async function groups(u: SessionUser) {
  await recipientOf(u); // only a senior whose family link is confirmed may use the community
  return q(`SELECT g.id, g.slug, g.name, g.icon, g.about, (SELECT count(*)::int FROM group_members m WHERE m.group_id=g.id) AS members,
      EXISTS(SELECT 1 FROM group_members m WHERE m.group_id=g.id AND m.user_id=$1) AS joined,
      (SELECT count(*)::int FROM group_posts p WHERE p.group_id=g.id AND p.status='live' AND p.created_at > now() - interval '1 day') AS new_posts
    FROM community_groups g ORDER BY joined DESC, g.name`, [u.id]);
}
export async function setMember(u: SessionUser, groupId: string, join: boolean) {
  await recipientOf(u); // only a senior whose family link is confirmed may use the community
  if (u.role !== "senior") throw new AppError("Groups are for seniors", 403);
  if (join && !(await termsAccepted(u))) throw new AppError("Please read and accept the community rules first", 428);
  if (join) await q("INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [groupId, u.id]);
  else await q("DELETE FROM group_members WHERE group_id=$1 AND user_id=$2", [groupId, u.id]);
  return { joined: join };
}
async function seniorName(userId: string) { return one<any>("SELECT r.name, r.locality FROM care_recipients r WHERE r.senior_user_id=$1 ORDER BY created_at LIMIT 1", [userId]); }
export async function posts(u: SessionUser, groupId: string) {
  await recipientOf(u); // only a senior whose family link is confirmed may use the community
  const g = await one<any>("SELECT id, name, icon, about FROM community_groups WHERE id=$1", [groupId]);
  if (!g) throw new AppError("Group not found", 404);
  const rows = await q<any>(`SELECT p.id, p.body, p.created_at, p.user_id, r.name, r.locality FROM group_posts p
      LEFT JOIN LATERAL (SELECT name, locality FROM care_recipients WHERE senior_user_id=p.user_id ORDER BY created_at LIMIT 1) r ON true
    WHERE p.group_id=$1 AND p.status='live'
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker=$2 AND b.blocked=p.user_id) OR (b.blocker=p.user_id AND b.blocked=$2))
      AND NOT EXISTS (SELECT 1 FROM post_reports x WHERE x.post_id=p.id AND x.user_id=$2) ORDER BY p.created_at DESC LIMIT 50`, [groupId, u.id]);
  const joined = !!(await one("SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2", [groupId, u.id]));
  return { group: g, joined, termsAccepted: await termsAccepted(u), posts: rows.map((p) => ({ id: p.id, body: p.body, at: p.created_at, author: display(p.name), authorId: p.user_id === u.id ? undefined : p.user_id, locality: p.locality, mine: p.user_id === u.id })) };
}
export async function addPost(u: SessionUser, groupId: string, body: string) {
  await recipientOf(u); // only a senior whose family link is confirmed may use the community
  if (!(await termsAccepted(u))) throw new AppError("Please read and accept the community rules first", 428);
  if (!(await one("SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2", [groupId, u.id]))) throw new AppError("Join the group to post", 403);
  const problem = postProblem(body); if (problem) throw new AppError(problem);
  const recent = await one<{ n: number }>("SELECT count(*)::int AS n FROM group_posts WHERE user_id=$1 AND created_at > now() - interval '1 hour'", [u.id]);
  if ((recent?.n ?? 0) >= 10) throw new AppError("You have posted a lot this hour. Please try later.", 429);
  return one("INSERT INTO group_posts (group_id, user_id, body) VALUES ($1,$2,$3) RETURNING id", [groupId, u.id, body.trim()]);
}
/** A report hides the post from the person who reported it at once; two reports hide it for everyone until Uday reviews it. Every report shows in the Operations community queue. */
export async function reportPost(u: SessionUser, postId: string, reason?: string) {
  await recipientOf(u); // only a senior whose family link is confirmed may use the community
  const ins = await q("INSERT INTO post_reports (post_id, user_id, reason) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING post_id", [postId, u.id, reason ?? null]);
  if (!(await one("SELECT 1 FROM group_posts WHERE id=$1", [postId]))) throw new AppError("Not found", 404);
  if (ins.length) await q("UPDATE group_posts SET reports=reports+1, status=CASE WHEN reports+1 >= 2 THEN 'hidden' ELSE status END WHERE id=$1", [postId]);
  return { reported: true };
}
export async function deletePost(u: SessionUser, postId: string) { await q("UPDATE group_posts SET status='hidden' WHERE id=$1 AND user_id=$2", [postId, u.id]); return { ok: true }; }

export async function events(u: SessionUser) {
  await recipientOf(u); // only a senior whose family link is confirmed may use the community
  return q(`SELECT e.id, e.title, e.about, e.place, e.starts_at, e.capacity, e.sample, g.name AS group_name, g.icon,
      (SELECT count(*)::int FROM event_rsvps v WHERE v.event_id=e.id) AS going, EXISTS(SELECT 1 FROM event_rsvps v WHERE v.event_id=e.id AND v.user_id=$1) AS mine
    FROM community_events e LEFT JOIN community_groups g ON g.id=e.group_id WHERE e.status='live' AND e.starts_at > now() ORDER BY e.starts_at LIMIT 30`, [u.id]);
}
export async function rsvp(u: SessionUser, eventId: string, going: boolean) {
  await recipientOf(u); // only a senior whose family link is confirmed may use the community
  if (u.role !== "senior") throw new AppError("Events are for seniors", 403);
  if (!going) { await q("DELETE FROM event_rsvps WHERE event_id=$1 AND user_id=$2", [eventId, u.id]); return { going: false }; }
  const e = await one<any>("SELECT capacity, (SELECT count(*)::int FROM event_rsvps v WHERE v.event_id=e.id) AS n FROM community_events e WHERE id=$1 AND status='live' AND starts_at > now()", [eventId]);
  if (!e) throw new AppError("Event not found", 404);
  if (e.capacity && e.n >= e.capacity) throw new AppError("This event is full");
  await q("INSERT INTO event_rsvps (event_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [eventId, u.id]);
  const r = await recipientOf(u); for (const f of await familyOf(r.id)) await notify(f.user_id, "senior_event", { eventId, recipientId: r.id });
  return { going: true };
}

/** People nearby: only seniors who chose to be found, and only if you chose to be found too. No phone numbers are ever shown. */
export async function people(u: SessionUser) {
  await recipientOf(u); // only a senior whose family link is confirmed may use the community
  const me = await settings(u);
  if (!me.discoverable) return { discoverable: false, people: [], received: [] };
  const rows = await q<any>(`SELECT s.user_id, r.name, r.locality,
      (SELECT count(*)::int FROM group_members a JOIN group_members b ON a.group_id=b.group_id WHERE a.user_id=s.user_id AND b.user_id=$1) AS shared_groups,
      EXISTS(SELECT 1 FROM namastes n WHERE n.from_user=$1 AND n.to_user=s.user_id) AS sent,
      EXISTS(SELECT 1 FROM namastes n WHERE n.from_user=s.user_id AND n.to_user=$1) AS received
    FROM senior_settings s JOIN LATERAL (SELECT name, locality FROM care_recipients WHERE senior_user_id=s.user_id ORDER BY created_at LIMIT 1) r ON true
    WHERE s.discoverable AND s.user_id<>$1
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker=$1 AND b.blocked=s.user_id) OR (b.blocker=s.user_id AND b.blocked=$1)) ORDER BY shared_groups DESC, r.locality LIMIT 50`, [u.id]);
  await q("UPDATE namastes SET seen_at=now() WHERE to_user=$1 AND seen_at IS NULL", [u.id]);
  return { discoverable: true, people: rows.map((p) => ({ id: p.user_id, name: display(p.name), locality: p.locality, sharedGroups: p.shared_groups, sent: p.sent, received: p.received, friends: p.sent && p.received })) };
}
export async function namaste(u: SessionUser, to: string) {
  await recipientOf(u); // only a senior whose family link is confirmed may use the community
  const me = await settings(u); if (!me.discoverable) throw new AppError("Turn on 'Let people near me find me' first");
  const t = await one("SELECT 1 FROM senior_settings WHERE user_id=$1 AND discoverable", [to]);
  if (!t || to === u.id || (await isBlocked(u.id, to))) throw new AppError("Not found", 404);
  const ins = await q("INSERT INTO namastes (from_user, to_user) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING to_user", [u.id, to]);
  if (ins.length) await notify(to, "namaste", { from: u.id });
  return { sent: true };
}

// ───────── community safety: rules, block, report ─────────
export const COMMUNITY_RULES = [
  "Be kind. No insults, threats, hate or bullying.",
  "No selling, money requests, loans or investment offers.",
  "Never share bank details, OTPs, Aadhaar or addresses.",
  "No medical advice. Talk to your doctor.",
  "Posts that break these rules are removed. People who break them can be removed from the community.",
];
async function termsAccepted(u: SessionUser) { return !!(await one("SELECT 1 FROM senior_settings WHERE user_id=$1 AND community_terms_at IS NOT NULL", [u.id])); }
export async function communityRules(u: SessionUser) { await recipientOf(u); return { rules: COMMUNITY_RULES, accepted: await termsAccepted(u) }; }
export async function acceptRules(u: SessionUser) {
  await recipientOf(u);
  await q("INSERT INTO senior_settings (user_id, community_terms_at) VALUES ($1, now()) ON CONFLICT (user_id) DO UPDATE SET community_terms_at=COALESCE(senior_settings.community_terms_at, now())", [u.id]);
  return { accepted: true };
}
async function isBlocked(a: string, b: string) { return !!(await one("SELECT 1 FROM user_blocks WHERE (blocker=$1 AND blocked=$2) OR (blocker=$2 AND blocked=$1)", [a, b])); }
async function knownMember(id: string) { return one("SELECT 1 FROM users WHERE id=$1 AND role='senior' AND deleted_at IS NULL", [id]); }
/** Block: neither person sees the other's posts or profile, and greetings stop. Takes effect at once. */
export async function blockUser(u: SessionUser, other: string, block: boolean) {
  await recipientOf(u); if (other === u.id || !(await knownMember(other))) throw new AppError("Not found", 404);
  if (block) await q("INSERT INTO user_blocks (blocker, blocked) VALUES ($1,$2) ON CONFLICT DO NOTHING", [u.id, other]);
  else await q("DELETE FROM user_blocks WHERE blocker=$1 AND blocked=$2", [u.id, other]);
  return { blocked: block };
}
/** Report a person to the Uday team. Also blocks them for the reporter, so the reporter is safe while we review. */
export async function reportUser(u: SessionUser, other: string, reason?: string) {
  await recipientOf(u); if (other === u.id || !(await knownMember(other))) throw new AppError("Not found", 404);
  await q("INSERT INTO user_reports (reporter, reported, reason) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [u.id, other, reason?.slice(0, 300) ?? null]);
  await q("INSERT INTO user_blocks (blocker, blocked) VALUES ($1,$2) ON CONFLICT DO NOTHING", [u.id, other]);
  return { reported: true, blocked: true };
}
export async function opsCloseAiReport(id: number, by: string) {
  const r = await one("UPDATE companion_messages SET report_closed_at=now() WHERE id=$1 AND reported_at IS NOT NULL RETURNING id", [id]); if (!r) throw new AppError("Not found", 404);
  await q("INSERT INTO audit_log (actor_id, action, entity, entity_id, reason) VALUES ($1,'ai_report','companion_message',$2,'reviewed')", [by, String(id)]);
  return { ok: true };
}
export async function opsCloseUserReport(id: number, removeFromCommunity: boolean, by: string) {
  const r = await one<any>("UPDATE user_reports SET status='closed', closed_at=now() WHERE id=$1 AND status='open' RETURNING reported", [id]);
  if (!r) throw new AppError("Not found", 404);
  if (removeFromCommunity) {
    await q("DELETE FROM group_members WHERE user_id=$1", [r.reported]);
    await q("UPDATE group_posts SET status='hidden' WHERE user_id=$1", [r.reported]);
    await q("UPDATE senior_settings SET discoverable=false, community_terms_at=NULL WHERE user_id=$1", [r.reported]);
  }
  await q("INSERT INTO audit_log (actor_id, action, entity, entity_id, reason) VALUES ($1,'user_report','user',$2,$3)", [by, r.reported, removeFromCommunity ? "removed from community" : "no action"]);
  return { ok: true };
}

// ───────── settings ─────────
export async function settings(u: SessionUser) {
  const s = await one<any>("SELECT discoverable, language FROM senior_settings WHERE user_id=$1", [u.id]);
  const r = await one<any>("SELECT checkin_by FROM care_recipients WHERE senior_user_id=$1 ORDER BY created_at LIMIT 1", [u.id]);
  return { discoverable: !!s?.discoverable, language: s?.language ?? "en", checkinBy: r ? String(r.checkin_by).slice(0, 5) : "10:00" };
}
export const SettingsIn = z.object({ discoverable: z.boolean().optional(), language: z.enum(["en", "hi", "mr"]).optional(), checkinBy: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional() });
export async function saveSettings(u: SessionUser, i: z.infer<typeof SettingsIn>) {
  const r = await recipientOf(u); const cur = await settings(u);
  await q(`INSERT INTO senior_settings (user_id, discoverable, language) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET discoverable=$2, language=$3, updated_at=now()`,
    [u.id, i.discoverable ?? cur.discoverable, i.language ?? cur.language]);
  if (i.checkinBy) await q("UPDATE care_recipients SET checkin_by=$2 WHERE id=$1", [r.id, i.checkinBy]);
  return settings(u);
}

// ───────── safety ─────────
export const SafetyIn = z.object({ kind: z.enum(["cyber", "crime"]), category: z.string().min(2).max(30), happened: z.string().max(30).optional(), amount: z.number().int().min(0).max(1e9).optional(), details: z.string().max(1000).optional() });
const CYBER = ["bank", "kyc", "upi", "invest", "whatsapp", "other"]; const CRIME = ["theft", "cheat", "assault", "harass", "trespass", "other"];
/** Saves a record, tells the family and the Uday team. The senior still calls 1930 (cyber fraud) or 112 (police) from the app. */
export async function safetyReport(u: SessionUser, i: z.infer<typeof SafetyIn>) {
  const r = await recipientOf(u);
  if (!(i.kind === "cyber" ? CYBER : CRIME).includes(i.category)) throw new AppError("Choose what happened");
  const code = (i.kind === "cyber" ? "CY-" : "CR-") + Math.random().toString(36).slice(2, 8).toUpperCase();
  await q("INSERT INTO safety_reports (code, user_id, care_recipient_id, kind, category, happened, amount_paise, details_enc) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [code, u.id, r.id, i.kind, i.category, i.happened ?? null, i.amount != null ? i.amount * 100 : null, enc(i.details)]);
  const { raiseAlert } = await import("./alerts");
  const alert = await raiseAlert({ kind: "safety_report", recipientId: r.id, raisedBy: u.id, raisedRole: "senior" });
  return { code, alert };
}
export async function callback(u: SessionUser, reason: "talk" | "doctor" | "lonely") {
  const r = await recipientOf(u);
  const open = await one("SELECT 1 FROM callback_requests WHERE user_id=$1 AND reason=$2 AND status='open' AND created_at > now() - interval '1 day'", [u.id, reason]);
  if (!open) { await q("INSERT INTO callback_requests (user_id, care_recipient_id, reason) VALUES ($1,$2,$3)", [u.id, r.id, reason]); await notify(null, "callback_request", { recipientId: r.id, reason }); }
  // A doctor call back also becomes a telehealth lead, matched to a partner doctor if one is listed.
  if (reason === "doctor") { const { lead } = await import("./family"); await lead(u, "telehealth", "Doctor call back from the senior app").catch(() => {}); }
  return { requested: true };
}

// ───────── family view ─────────
/** What the family sees: the last 7 days of check ins, medicines taken today, brain game days. */
export async function weekFor(u: SessionUser, recipientId: string) {
  if (!(await familyRole(u.id, recipientId))) throw new AppError("Not allowed", 403);
  const rows = await q<any>(`SELECT DISTINCT ON (d) (at AT TIME ZONE 'Asia/Kolkata')::date::text AS d, status FROM checkins WHERE care_recipient_id=$1 AND at > now() - interval '8 days' ORDER BY d, at DESC`, [recipientId]);
  const by = new Map(rows.map((r) => [r.d, r.status])); const week: { day: string; status: string | null }[] = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5); const k = istDay(d); week.push({ day: k, status: by.get(k) ?? null }); }
  const m = await meds(u, recipientId);
  const senior = await one<any>("SELECT senior_user_id FROM care_recipients WHERE id=$1", [recipientId]);
  const g = senior?.senior_user_id ? await one<{ n: number }>("SELECT count(DISTINCT day)::int AS n FROM game_plays WHERE user_id=$1 AND day > current_date - 7", [senior.senior_user_id]) : null;
  const groupsJoined = senior?.senior_user_id ? await one<{ n: number }>("SELECT count(*)::int AS n FROM group_members WHERE user_id=$1", [senior.senior_user_id]) : null;
  return { week, streak: await streak(recipientId), meds: { taken: m.items.filter((i) => i.taken).length, total: m.items.length }, gameDays: g?.n ?? 0, groups: groupsJoined?.n ?? 0 };
}

// ───────── ops ─────────
export async function opsCommunity() {
  const reported = await q(`SELECT p.id, p.body, p.status, p.reports, p.created_at, g.name AS group_name FROM group_posts p JOIN community_groups g ON g.id=p.group_id WHERE p.reports > 0 ORDER BY p.status='hidden' DESC, p.created_at DESC LIMIT 50`);
  const safety = await q(`SELECT s.code, s.kind, s.category, s.happened, s.amount_paise, s.status, s.created_at, r.name FROM safety_reports s LEFT JOIN care_recipients r ON r.id=s.care_recipient_id WHERE s.status='open' ORDER BY s.created_at DESC LIMIT 50`);
  const callbacks = await q(`SELECT c.id, c.reason, c.created_at, r.name, r.locality FROM callback_requests c LEFT JOIN care_recipients r ON r.id=c.care_recipient_id WHERE c.status='open' ORDER BY c.created_at LIMIT 50`);
  const people = await q(`SELECT x.id::int AS id, x.reason, x.created_at, r.name, r.locality, (SELECT count(*)::int FROM user_reports y WHERE y.reported=x.reported) AS times
    FROM user_reports x LEFT JOIN LATERAL (SELECT name, locality FROM care_recipients WHERE senior_user_id=x.reported ORDER BY created_at LIMIT 1) r ON true WHERE x.status='open' ORDER BY x.created_at LIMIT 50`);
  const ai = (await q<any>(`SELECT id, body_enc, report_reason, reported_at FROM companion_messages WHERE role='assistant' AND reported_at IS NOT NULL AND report_closed_at IS NULL ORDER BY reported_at LIMIT 50`))
    .map((m) => ({ id: Number(m.id), reply: dec(m.body_enc), reason: m.report_reason, at: m.reported_at })); // the AI reply only; the senior's own words stay private
  return { reported, people, ai, safety, callbacks, groups: await q("SELECT id, name FROM community_groups ORDER BY name") };
}
export async function opsPost(id: string, status: "live" | "hidden") { await q("UPDATE group_posts SET status=$2, reports=CASE WHEN $2='live' THEN 0 ELSE reports END WHERE id=$1", [id, status]); if (status === "live") await q("DELETE FROM post_reports WHERE post_id=$1", [id]); }
export const EventIn = z.object({ title: z.string().min(3).max(100), about: z.string().max(500).optional(), place: z.string().min(3).max(200), startsAt: z.string(), capacity: z.number().int().min(1).max(1000).optional(), groupId: z.string().uuid().optional() });
export async function createEvent(u: SessionUser, i: z.infer<typeof EventIn>) {
  if (Number.isNaN(Date.parse(i.startsAt)) || Date.parse(i.startsAt) < Date.now()) throw new AppError("Choose a future date and time");
  return one("INSERT INTO community_events (group_id, title, about, place, starts_at, capacity, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id", [i.groupId ?? null, i.title, i.about ?? null, i.place, i.startsAt, i.capacity ?? null, u.id]);
}
export async function opsClose(kind: "safety" | "callback", id: string) {
  if (kind === "safety") await q("UPDATE safety_reports SET status='closed' WHERE code=$1", [id]); else await q("UPDATE callback_requests SET status='done' WHERE id=$1", [id]);
}
