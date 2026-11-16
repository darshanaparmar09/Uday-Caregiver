import { z } from "zod";
import { one, q, tx } from "./db";
import { enc, lookupHash, normalisePhone } from "./crypto";
import { gateway } from "./payments";
import { verifyAadhaar, verifyAadhaarOtp, validPan } from "./kyc";
import { putEncrypted } from "./storage";
import { notify } from "./notify";
import { AppError } from "./bookings";
import type { SessionUser } from "./auth";

// ───────── stages (Onboarding Specification, caregiver section) ─────────
export const STAGES: { n: number; title: string; owner: "caregiver" | "uday" | "auto"; hint: string }[] = [
  { n: 1, title: "Application", owner: "auto", hint: "Received through Careers" },
  { n: 2, title: "Screening call", owner: "uday", hint: "Our recruiter calls you" },
  { n: 3, title: "App sign up", owner: "auto", hint: "Done when you sign in" },
  { n: 4, title: "Your profile", owner: "caregiver", hint: "Languages, areas, care types, skills" },
  { n: 5, title: "Identity check", owner: "caregiver", hint: "Aadhaar and PAN through our verification partner" },
  { n: 6, title: "References", owner: "uday", hint: "We call two past employers or families" },
  { n: 7, title: "Police verification", owner: "uday", hint: "Done by an independent provider" },
  { n: 8, title: "Certificates", owner: "caregiver", hint: "Upload training or nursing certificates" },
  { n: 9, title: "Health fitness", owner: "caregiver", hint: "Upload fitness declaration or vaccination proof" },
  { n: 10, title: "Academy", owner: "caregiver", hint: "Pass the Tier 1 modules, then a practical assessment" },
  { n: 11, title: "Contract", owner: "caregiver", hint: "Read and sign the caregiver agreement" },
  { n: 12, title: "Bank account", owner: "caregiver", hint: "For weekly payouts" },
  { n: 13, title: "Insurance and kit", owner: "uday", hint: "Cover, ID card and uniform" },
  { n: 14, title: "Shadow shift", owner: "uday", hint: "One supervised shift" },
  { n: 15, title: "Activation", owner: "auto", hint: "You can receive requests" },
];
export const CONTRACT_VERSION = "2026-11-draft";

export async function cgFor(u: SessionUser) {
  const c = await one<any>("SELECT * FROM caregivers WHERE user_id=$1", [u.id]);
  if (!c) throw new AppError("No caregiver profile for this account", 404);
  return c;
}
async function setStage(cgId: string, stage: number, status: string, by: string | null, note?: string) {
  await q(`INSERT INTO onboarding_steps (caregiver_id, stage, status, note, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5, now())
    ON CONFLICT (caregiver_id, stage) DO UPDATE SET status=EXCLUDED.status, note=EXCLUDED.note, updated_by=EXCLUDED.updated_by, updated_at=now()`, [cgId, stage, status, note ?? null, by]);
  await maybeActivate(cgId);
}
/** Stage 15 clears and the caregiver becomes active only when stages 1 to 14 are all clear. */
async function maybeActivate(cgId: string) {
  const r = await one<{ n: number }>("SELECT count(*)::int AS n FROM onboarding_steps WHERE caregiver_id=$1 AND stage<15 AND status='clear'", [cgId]);
  if ((r?.n ?? 0) === 14) {
    await q("INSERT INTO onboarding_steps (caregiver_id, stage, status) VALUES ($1,15,'clear') ON CONFLICT (caregiver_id, stage) DO UPDATE SET status='clear', updated_at=now()", [cgId]);
    await q("UPDATE caregivers SET status='active' WHERE id=$1 AND status IN ('applied','verifying')", [cgId]);
  }
}

export async function onboarding(u: SessionUser) {
  const c = await cgFor(u);
  await q("INSERT INTO onboarding_steps (caregiver_id, stage, status) VALUES ($1,3,'clear') ON CONFLICT (caregiver_id, stage) DO NOTHING", [c.id]);
  await maybeActivate(c.id);
  const rows = await q<any>("SELECT stage, status, note, updated_at FROM onboarding_steps WHERE caregiver_id=$1", [c.id]);
  const by = new Map(rows.map((r) => [r.stage, r]));
  const fresh = await one<any>("SELECT status FROM caregivers WHERE id=$1", [c.id]);
  return {
    status: fresh.status,
    stages: STAGES.map((s) => ({ ...s, status: by.get(s.n)?.status ?? "pending", note: by.get(s.n)?.note ?? null })),
    profile: { languages: c.languages, serviceAreas: c.service_areas, careTypes: c.care_types, skills: c.skills, preferredHours: c.preferred_hours, bio: c.bio },
    bankLast4: c.bank_last4, panLast4: c.pan_last4, contractVersion: CONTRACT_VERSION,
  };
}

export const ProfileIn = z.object({
  languages: z.array(z.string().max(20)).min(1).max(6), serviceAreas: z.array(z.string().max(40)).min(1).max(10),
  careTypes: z.array(z.enum(["day", "night", "live"])).min(1), skills: z.array(z.string().max(40)).max(12),
  preferredHours: z.string().max(80).optional(), bio: z.string().max(400).optional(),
});
export async function saveProfile(u: SessionUser, i: z.infer<typeof ProfileIn>) {
  const c = await cgFor(u);
  await q("UPDATE caregivers SET languages=$2, service_areas=$3, care_types=$4::care_type[], skills=$5, preferred_hours=$6, bio=$7 WHERE id=$1",
    [c.id, i.languages, i.serviceAreas, i.careTypes, i.skills, i.preferredHours ?? null, i.bio ?? null]);
  await setStage(c.id, 4, "clear", u.id);
}

export async function identity(u: SessionUser, aadhaar: string, pan: string) {
  const c = await cgFor(u);
  if (!validPan(pan)) throw new AppError("Enter a valid PAN, for example ABCDE1234F");
  let r;
  try { r = await verifyAadhaar(aadhaar, c.display_name); } catch (e: any) { throw new AppError(e.message); }
  await q("UPDATE caregivers SET pan_enc=$2, pan_last4=$3 WHERE id=$1", [c.id, enc(pan.toUpperCase()), pan.toUpperCase().slice(-4)]);
  await q(`INSERT INTO caregiver_verifications (caregiver_id, kind, provider, result, reference, last4, verified_at, expires_at)
    VALUES ($1,'identity',$2,$3,$4,$5, now(), NULL) ON CONFLICT (caregiver_id, kind) DO UPDATE SET result=EXCLUDED.result, reference=EXCLUDED.reference, last4=EXCLUDED.last4, verified_at=now()`,
    [c.id, r.provider, r.result, r.reference, r.last4]);
  await setStage(c.id, 5, r.result === "clear" ? "clear" : r.result === "pending" ? "submitted" : "not_clear", u.id);
  return { result: r.result, last4: r.last4, needsOtp: !!r.needsOtp };
}
/** Second step when the identity partner sends an OTP to the Aadhaar linked mobile. */
export async function identityOtp(u: SessionUser, otp: string) {
  const c = await cgFor(u);
  const v = await one<any>("SELECT reference FROM caregiver_verifications WHERE caregiver_id=$1 AND kind='identity' AND result='pending'", [c.id]);
  if (!v) throw new AppError("Start the Aadhaar check first");
  let r; try { r = await verifyAadhaarOtp(v.reference, otp, c.display_name); } catch (e: any) { throw new AppError(e.message); }
  await q("UPDATE caregiver_verifications SET result=$2, last4=COALESCE(NULLIF($3,''), last4), verified_at=now() WHERE caregiver_id=$1 AND kind='identity'", [c.id, r.result, r.last4]);
  await setStage(c.id, 5, r.result === "clear" ? "clear" : "not_clear", u.id);
  return { result: r.result };
}

export async function bank(u: SessionUser, accountNumber: string, ifsc: string, holder: string) {
  const c = await cgFor(u);
  if (!/^\d{9,18}$/.test(accountNumber)) throw new AppError("Enter the account number, 9 to 18 digits");
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase())) throw new AppError("Enter a valid IFSC, for example SBIN0001234");
  const v = await (await gateway()).verifyBank(accountNumber, ifsc.toUpperCase(), holder);
  const changing = !!c.bank_ref;
  await q("UPDATE caregivers SET bank_ref=$2, bank_last4=$3, bank_ifsc=$4, bank_changed_at=CASE WHEN $5 THEN now() ELSE bank_changed_at END WHERE id=$1",
    [c.id, v.ref, accountNumber.slice(-4), ifsc.toUpperCase(), changing]);
  await q("INSERT INTO audit_log (actor_id, action, entity, entity_id) VALUES ($1,$2,'caregiver',$3)", [u.id, changing ? "bank_changed" : "bank_added", c.id]);
  await setStage(c.id, 12, "clear", u.id);
  return { last4: accountNumber.slice(-4), holdHours: changing ? 48 : 0 };
}

export async function uploadDocument(u: SessionUser, kind: string, base64: string, mime: string) {
  const c = await cgFor(u);
  const health = kind === "fitness" || kind === "vaccination";
  let put;
  try { put = await putEncrypted(Buffer.from(base64, "base64"), mime, health ? "health" : "pii"); } catch (e: any) { throw new AppError(e.message); }
  const doc = await one<{ id: string }>("INSERT INTO caregiver_documents (caregiver_id, kind, storage_key, file_key_enc, mime, bytes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", [c.id, kind, put.storageKey, put.fileKeyEnc, mime, put.bytes]);
  // Profile photo: Uday checks it against the identity document before families can see it.
  if (kind === "photo") { await q("UPDATE caregivers SET photo_doc_id=$2, photo_status='pending' WHERE id=$1", [c.id, doc!.id]); return { ok: true, photo: "pending" }; }
  const stage = health ? 9 : 8;
  const cur = await one<any>("SELECT status FROM onboarding_steps WHERE caregiver_id=$1 AND stage=$2", [c.id, stage]);
  if (cur?.status !== "clear") await setStage(c.id, stage, "submitted", u.id, "Waiting for Uday to check");
  return { ok: true, stage };
}

export async function signContract(u: SessionUser, signedName: string, device?: string) {
  const c = await cgFor(u);
  if (signedName.trim().length < 3) throw new AppError("Type your full name to sign");
  await q("INSERT INTO caregiver_contracts (caregiver_id, version, signed_name, device) VALUES ($1,$2,$3,$4)", [c.id, CONTRACT_VERSION, signedName.trim(), device ?? null]);
  await setStage(c.id, 11, "clear", u.id);
}

// ───────── availability and leave ─────────
export async function availability(u: SessionUser) {
  const c = await cgFor(u);
  const off = await q<{ day: string; reason: string }>("SELECT day, reason FROM caregiver_unavailable WHERE caregiver_id=$1 AND day >= current_date AND day < current_date + 60 ORDER BY day", [c.id]);
  const booked = await q<{ day: string }>(`SELECT DISTINCT (b.start_date + g)::date::text AS day FROM bookings b CROSS JOIN LATERAL generate_series(0, b.days-1) g
    WHERE b.caregiver_id=$1 AND b.status IN ('accepted','enroute','arrived','active') AND (b.start_date + g) >= current_date AND (b.start_date + g) < current_date + 60`, [c.id]);
  const leave = await q("SELECT id, from_day, to_day, reason, status FROM leave_requests WHERE caregiver_id=$1 ORDER BY from_day DESC LIMIT 20", [c.id]);
  return { off, booked: booked.map((b) => b.day), leave, preferredHours: c.preferred_hours };
}
export async function setDay(u: SessionUser, day: string, available: boolean) {
  const c = await cgFor(u);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new AppError("Invalid date");
  const booked = await one(`SELECT 1 FROM bookings b WHERE b.caregiver_id=$1 AND b.status IN ('accepted','enroute','arrived','active') AND $2::date BETWEEN b.start_date AND b.start_date + b.days - 1`, [c.id, day]);
  if (!available && booked) throw new AppError("You are booked that day. Use 'I cannot make it' on the job so Uday can arrange a substitute.");
  if (available) await q("DELETE FROM caregiver_unavailable WHERE caregiver_id=$1 AND day=$2 AND reason='off'", [c.id, day]);
  else await q("INSERT INTO caregiver_unavailable (caregiver_id, day, reason) VALUES ($1,$2,'off') ON CONFLICT DO NOTHING", [c.id, day]);
}
export async function requestLeave(u: SessionUser, from: string, to: string, reason?: string) {
  const c = await cgFor(u);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw new AppError("Choose valid dates");
  const r = await one("INSERT INTO leave_requests (caregiver_id, from_day, to_day, reason) VALUES ($1,$2,$3,$4) RETURNING id", [c.id, from, to, reason?.slice(0, 200) ?? null]);
  await notify(null, "stage_updated", { leaveRequest: r.id });
  return r;
}
export async function decideLeave(ops: SessionUser, id: string, approve: boolean) {
  await tx(async (cl) => {
    const l = (await cl.query("UPDATE leave_requests SET status=$2, decided_by=$3 WHERE id=$1 AND status='requested' RETURNING *", [id, approve ? "approved" : "declined", ops.id])).rows[0];
    if (!l) throw new AppError("Leave request not found or already decided", 404);
    if (approve) await cl.query(`INSERT INTO caregiver_unavailable (caregiver_id, day, reason) SELECT $1, d::date, 'leave' FROM generate_series($2::date, $3::date, interval '1 day') d ON CONFLICT DO NOTHING`, [l.caregiver_id, l.from_day, l.to_day]);
    const u = (await cl.query("SELECT user_id FROM caregivers WHERE id=$1", [l.caregiver_id])).rows[0];
    await notify(u.user_id, "leave_decided", { id, approve });
  });
}

// ───────── academy ─────────
export async function academy(u: SessionUser) {
  const c = await cgFor(u);
  const mods = await q<any>("SELECT id, tier, ord, title, minutes, lesson, quiz FROM academy_modules ORDER BY ord");
  const best = await q<any>("SELECT module_id, bool_or(passed) AS passed, max(score) AS score, max(total) AS total FROM academy_attempts WHERE caregiver_id=$1 GROUP BY module_id", [c.id]);
  const m = new Map(best.map((b) => [b.module_id, b]));
  const modules = mods.map((x) => ({ id: x.id, tier: x.tier, title: x.title, minutes: x.minutes, lesson: x.lesson,
    quiz: x.quiz.map((qq: any) => ({ q: qq.q, options: qq.options })), passed: !!m.get(x.id)?.passed, best: m.get(x.id) ? `${m.get(x.id).score}/${m.get(x.id).total}` : null }));
  const next = Math.min(c.tier + 1, 3);
  const needed = modules.filter((x) => x.tier <= next);
  return { tier: c.tier, nextTier: c.tier < 3 ? next : null, progress: { done: needed.filter((x) => x.passed).length, total: needed.length }, modules };
}
export async function attempt(u: SessionUser, moduleId: string, answers: number[]) {
  const c = await cgFor(u);
  const mod = await one<any>("SELECT quiz, tier FROM academy_modules WHERE id=$1", [moduleId]);
  if (!mod) throw new AppError("Module not found", 404);
  const total = mod.quiz.length;
  const score = mod.quiz.reduce((s: number, qq: any, i: number) => s + (answers[i] === qq.answer ? 1 : 0), 0);
  const passed = score >= Math.ceil(total * 0.67);
  await q("INSERT INTO academy_attempts (caregiver_id, module_id, score, total, passed) VALUES ($1,$2,$3,$4,$5)", [c.id, moduleId, score, total, passed]);
  // Passing every Tier 1 module submits stage 10 for the practical assessment by the academy team.
  const t1 = await one<{ left: number }>(`SELECT count(*)::int AS left FROM academy_modules m WHERE m.tier=1 AND NOT EXISTS (SELECT 1 FROM academy_attempts a WHERE a.caregiver_id=$1 AND a.module_id=m.id AND a.passed)`, [c.id]);
  const st = await one<any>("SELECT status FROM onboarding_steps WHERE caregiver_id=$1 AND stage=10", [c.id]);
  if (t1?.left === 0 && st?.status !== "clear") await setStage(c.id, 10, "submitted", u.id, "Modules passed. Practical assessment next.");
  return { score, total, passed, correct: mod.quiz.map((qq: any) => qq.answer) };
}

// ───────── earnings and payouts ─────────
function nextMonday(d = new Date()) { const x = new Date(d); x.setDate(x.getDate() + ((8 - x.getDay()) % 7 || 7)); return x.toISOString().slice(0, 10); }

export async function earnings(u: SessionUser) {
  const c = await cgFor(u);
  const acct = `caregiver:${c.id}`;
  const bal = await one<{ earned: number; paid: number }>("SELECT COALESCE(sum(credit_paise),0)::int AS earned, COALESCE(sum(debit_paise),0)::int AS paid FROM ledger_entries WHERE account=$1", [acct]);
  const week = await one<{ n: number; p: number }>(`SELECT count(*)::int AS n, COALESCE(sum(credit_paise),0)::int AS p FROM ledger_entries WHERE account=$1 AND reason ~ '^(shift|day|relief day) [0-9]+ pay$' AND at >= date_trunc('week', now())`, [acct]);
  const lines = await q("SELECT reason, credit_paise, debit_paise, at FROM ledger_entries WHERE account=$1 ORDER BY at DESC LIMIT 30", [acct]);
  const payouts = await q("SELECT amount_paise, status, bank_last4, period_end, created_at, paid_at FROM payouts WHERE caregiver_id=$1 ORDER BY created_at DESC LIMIT 20", [c.id]);
  // Every paid day counts: day shifts, live in days and relief days.
  const shifts = await one<{ n: number }>("SELECT count(*)::int AS n FROM ledger_entries WHERE account=$1 AND reason ~ '^(shift|day|relief day) [0-9]+ pay$'", [acct]);
  return { balancePaise: (bal?.earned ?? 0) - (bal?.paid ?? 0), lifetimePaise: bal?.earned ?? 0, thisWeek: { shifts: week?.n ?? 0, paise: week?.p ?? 0 },
    shiftsCompleted: shifts?.n ?? 0, nextPayout: nextMonday(), bankLast4: c.bank_last4, lines, payouts };
}

/** Weekly payout run. Called by the scheduler each Monday (or by ops). Skips accounts changed in the last 48 hours. */
export async function runPayouts() {
  const due = await q<any>(`SELECT c.id, c.user_id, c.bank_ref, c.bank_last4,
      (SELECT COALESCE(sum(credit_paise),0) - COALESCE(sum(debit_paise),0) FROM ledger_entries l WHERE l.account='caregiver:'||c.id)::int AS bal
    FROM caregivers c WHERE c.bank_ref IS NOT NULL AND (c.bank_changed_at IS NULL OR c.bank_changed_at < now() - interval '48 hours')`);
  let paid = 0;
  for (const d of due.filter((x) => x.bal > 0)) {
    await tx(async (cl) => {
      const ref = "PO" + Date.now().toString(36).toUpperCase();
      const r = await (await gateway()).payout(d.bank_ref, d.bal, ref);
      await cl.query("INSERT INTO payouts (caregiver_id, amount_paise, status, gateway_ref, bank_last4, period_end, paid_at) VALUES ($1,$2,$3,$4,$5, current_date, CASE WHEN $3='paid' THEN now() END)",
        [d.id, d.bal, r.status, r.ref, d.bank_last4]);
      await cl.query("INSERT INTO ledger_entries (account, debit_paise, credit_paise, reason) VALUES ($1,$2,0,'weekly payout'),('bank_payouts',0,$2,'weekly payout')", [`caregiver:${d.id}`, d.bal]);
    });
    await notify(d.user_id, "payout_paid", { amountPaise: d.bal });
    paid++;
  }
  return { paid };
}

// ───────── ratings and coaching ─────────
const TIPS: Record<string, string> = {
  "On time": "Leave 15 minutes earlier than the map suggests, and tap Start travel when you leave.",
  "Kind and patient": "Slow down, explain before you help, and ask how they like things done.",
  "Followed the care profile": "Read the care profile before every shift and follow the medicine times exactly.",
  "Clean and tidy": "Leave the room as you found it, or better, before you end the shift.",
  "Good communication": "Write a clear shift log note each day; families read every word.",
};
export async function ratings(u: SessionUser) {
  const c = await cgFor(u);
  const recent = await q<any>("SELECT r.stars, r.tags, r.created_at FROM reviews r JOIN bookings b ON b.id=r.booking_id WHERE b.caregiver_id=$1 ORDER BY r.created_at DESC LIMIT 20", [c.id]);
  const tagCount: Record<string, number> = {};
  recent.forEach((r) => (r.tags ?? []).forEach((t: string) => (tagCount[t] = (tagCount[t] ?? 0) + 1)));
  const last5 = recent.slice(0, 5);
  const avg5 = last5.length ? last5.reduce((s, r) => s + r.stars, 0) / last5.length : null;
  const missing = Object.keys(TIPS).filter((t) => !tagCount[t]);
  const tips = avg5 !== null && avg5 < 4.3 ? missing.slice(0, 3).map((t) => TIPS[t]) : missing.slice(0, 1).map((t) => TIPS[t]);
  return { rating: Number(c.rating), count: c.rating_count, last5Average: avg5, tags: tagCount, recent: recent.map((r) => ({ stars: r.stars, tags: r.tags, at: r.created_at })), tips, belowStandard: avg5 !== null && avg5 < 4.3 };
}

// ───────── push tokens ─────────
export async function registerPush(u: SessionUser, token: string, platform: string) {
  await q("INSERT INTO push_tokens (token, user_id, platform) VALUES ($1,$2,$3) ON CONFLICT (token) DO UPDATE SET user_id=EXCLUDED.user_id, platform=EXCLUDED.platform, updated_at=now()", [token, u.id, platform]);
}

// ───────── ops ─────────
export async function convertApplication(ops: SessionUser, appId: string, tier: number) {
  return tx(async (cl) => {
    const a = (await cl.query("SELECT * FROM caregiver_applications WHERE id=$1 FOR UPDATE", [appId])).rows[0];
    if (!a) throw new AppError("Application not found", 404);
    if (a.caregiver_id) throw new AppError("Already converted", 409);
    const { dec } = await import("./crypto");
    const phone = normalisePhone(dec(a.phone_enc)!);
    const user = (await cl.query(`INSERT INTO users (phone_hash, phone_enc, phone_last4, name, role) VALUES ($1,$2,$3,$4,'caregiver')
      ON CONFLICT (phone_hash) DO UPDATE SET role='caregiver', name=EXCLUDED.name RETURNING id`, [lookupHash(phone), enc(phone), phone.slice(-4), a.name])).rows[0];
    const initials = a.name.split(/\s+/).map((s: string) => s[0]).join("").slice(0, 2).toUpperCase();
    const rates = { 1: [85000, 105000, 150000], 2: [140000, 160000, 220000], 3: [210000, 240000, 310000] }[tier as 1 | 2 | 3] ?? [85000, 105000, 150000];
    const cg = (await cl.query(`INSERT INTO caregivers (user_id, display_name, initials, tier, care_types, area, rate_day_paise, rate_night_paise, rate_live_paise, status)
      VALUES ($1,$2,$3,$4,'{day}',$5,$6,$7,$8,'verifying') RETURNING id`, [user.id, a.name, initials, tier, a.area, ...rates])).rows[0];
    await cl.query("UPDATE caregiver_applications SET caregiver_id=$2, status='converted' WHERE id=$1", [appId, cg.id]);
    await cl.query("INSERT INTO onboarding_steps (caregiver_id, stage, status, updated_by) VALUES ($1,1,'clear',$2)", [cg.id, ops.id]);
    return { caregiverId: cg.id };
  });
}
export async function opsSetStage(ops: SessionUser, cgId: string, stage: number, status: "clear" | "not_clear" | "pending", note?: string) {
  if (![2, 6, 7, 8, 9, 10, 13, 14].includes(stage)) throw new AppError("This stage is completed by the caregiver or automatically");
  await setStage(cgId, stage, status, ops.id, note);
  if (stage === 7) await q(`INSERT INTO caregiver_verifications (caregiver_id, kind, provider, result, reference, verified_at, expires_at)
    VALUES ($1,'police',$2,$3,$4, now(), now() + interval '1 year') ON CONFLICT (caregiver_id, kind) DO UPDATE SET result=EXCLUDED.result, reference=EXCLUDED.reference, verified_at=now(), expires_at=EXCLUDED.expires_at`,
    [cgId, "third party", status === "clear" ? "clear" : status === "not_clear" ? "not_clear" : "pending", note ?? null]);
  const u = await one<any>("SELECT user_id FROM caregivers WHERE id=$1", [cgId]);
  if (u?.user_id) await notify(u.user_id, "stage_updated", { stage, status });
}
export async function opsQueues() {
  const applications = await q<any>("SELECT id, name, area, experience, status, created_at FROM caregiver_applications WHERE status='new' ORDER BY created_at LIMIT 50");
  const onboarding = await q<any>(`SELECT c.id, c.display_name, c.tier, c.status, json_object_agg(s.stage, s.status) FILTER (WHERE s.stage IS NOT NULL) AS stages
    FROM caregivers c LEFT JOIN onboarding_steps s ON s.caregiver_id=c.id WHERE c.status IN ('applied','verifying') GROUP BY c.id ORDER BY c.created_at`);
  const leave = await q<any>("SELECT l.id, c.display_name, l.from_day, l.to_day, l.reason FROM leave_requests l JOIN caregivers c ON c.id=l.caregiver_id WHERE l.status='requested' ORDER BY l.from_day");
  const facilities = await q<any>("SELECT f.id, f.name, f.locality, f.licence_no, f.plan, f.status FROM facilities f WHERE f.status='review' ORDER BY f.created_at");
  return { applications, onboarding, leave, facilities };
}
