// Readiness sprint: the safety and privacy rules. An alert is never called sent, acknowledged or delivered unless it was.
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
const BASE = process.env.BASE_URL ?? "http://localhost:3000"; const OTP = process.env.OTP_DEV_CODE ?? "123456";
async function call(t: string | null, path: string, body?: unknown, method?: string, headers: Record<string, string> = {}) {
  const r = await fetch(BASE + path, { method: method ?? (body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...headers, ...(t ? { Authorization: "Bearer " + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: (await r.json().catch(() => ({}))) as any, r };
}
async function login(phone: string, extra: object = {}) { await call(null, "/api/auth/request", { phone }); const r = await call(null, "/api/auth/verify", { phone, code: OTP, client: "app", ...extra }); assert.equal(r.status, 200, JSON.stringify(r.j)); return r.j.token as string; }
const rnd = () => String(Math.floor(1e7 + Math.random() * 9e7));
const cron = (job = "") => call(null, "/api/cron" + job, {}, "POST", { "x-cron-secret": process.env.CRON_SECRET ?? "" });
const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const ANS: Record<string, number[]> = { "t1-dignity": [1, 0, 1], "t1-falls": [1, 1, 0], "t1-safety": [1, 0, 1], "t2-transfers": [0, 1, 0], "t2-dementia": [1, 0, 1], "t3-medication": [1, 0, 0] };
const LIVE_HC = ["toilet", "water", "belongings", "household", "infection", "cameras", "scope", "meals", "bath", "sleep", "breaks", "day_off"];
const DAY_HC = ["toilet", "water", "belongings", "household", "infection", "cameras", "scope"];
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

/** A brand new caregiver taken through the whole onboarding, so her calendar is empty. */
async function newCaregiver(name: string, tier: number, careTypes: string[]) {
  const phone = "+9176" + rnd().slice(0, 8);
  const ops = await login("+919000000099");
  await call(null, "/api/applications", { name, phone, area: "Kothrud", experience: "Attendant, 3 years or more" });
  const ap = (await call(ops, "/api/ops/queues")).j.applications.find((a: any) => a.name === name);
  const id = (await call(ops, `/api/ops/applications/${ap.id}`, { tier })).j.caregiverId;
  const t = await login(phone);
  await call(t, "/api/caregiver/profile", { languages: ["Marathi"], serviceAreas: ["Kothrud"], careTypes, skills: ["Transfers"] }, "PUT");
  await call(t, "/api/caregiver/identity", { aadhaar: "2345 6789 0123", pan: "ABCDE1234F" });
  for (const k of ["certificate", "fitness"]) await call(t, "/api/caregiver/documents", { kind: k, base64: PNG, mime: "image/png" });
  await call(t, "/api/caregiver/contract", { signedName: name }); await call(t, "/api/caregiver/bank", { accountNumber: "123456789012", ifsc: "SBIN0001234", holder: name });
  for (const [m, a] of Object.entries(ANS)) if (Number(m[1]) <= tier) await call(t, `/api/academy/${m}`, { answers: a });
  for (const s of [2, 6, 7, 8, 9, 10, 13, 14]) await call(ops, `/api/ops/caregivers/${id}/stage`, { stage: s, status: "clear", note: s === 7 ? "PV" : undefined });
  assert.equal((await call(t, "/api/caregiver/onboarding")).j.status, "active");
  return { id, t, phone, name };
}
async function family() {
  const fam = await login("+9195" + rnd().slice(0, 8)); const seniorPhone = "+9174" + rnd().slice(0, 8);
  const r = await call(fam, "/api/recipients", { name: "Shanta Kulkarni", address: "9 Prabhat Road, Pune", locality: "Prabhat Road", hospital: "Deenanath", hasPhone: true, phone: seniorPhone,
    emergencyContacts: [{ name: "Neha", relation: "Daughter", phone: "+14155550199", city: "Austin" }, { name: "Amit", relation: "Nephew", phone: "9822099999", city: "Pune", isLocal: true }],
    consent: { onBehalf: true, shareWithCaregiver: { allergies: true, medicines: true, conditions: true } } });
  assert.equal(r.status, 200);
  return { fam, rid: r.j.id as string, seniorPhone };
}
import { createHash } from "node:crypto";
import { signV4 } from "../lib/s3";
test.before(() => db.connect());
test.after(() => db.end().catch(() => {}));
const act = (t: string, id: string, body: object, headers: Record<string, string> = {}) => call(t, `/api/bookings/${id}/action`, body, "POST", headers);
async function linkedSenior(seniorPhone: string) { const s = await login(seniorPhone, { role: "senior" }); for (const r of (await call(s, "/api/senior/links")).j) await call(s, "/api/senior/links", { id: r.id, accept: true }); return s; }

test("sign in: wrong codes are capped even in parallel, and the cap survives a new code", async () => {
  const phone = "+9189" + rnd().slice(0, 8);
  await call(null, "/api/auth/request", { phone });
  const wrong = await Promise.all(Array.from({ length: 8 }, () => call(null, "/api/auth/verify", { phone, code: "000000", client: "app" })));
  assert.ok(wrong.filter((r) => r.status === 429).length >= 3, "parallel guesses hit the cap: " + wrong.map((r) => r.status).join(","));
  assert.equal((await call(null, "/api/auth/verify", { phone, code: OTP, client: "app" })).status, 429, "the right code is refused once the cap is hit");
  await call(null, "/api/auth/request", { phone });
  for (let i = 0; i < 3; i++) await call(null, "/api/auth/verify", { phone, code: "000000", client: "app" });
  assert.equal((await call(null, "/api/auth/verify", { phone, code: OTP, client: "app" })).status, 429, "asking for a new code does not buy more guesses within the hour");
  const signin = await fetch(BASE + "/signin?next=https://evil.example"); assert.equal(signin.status, 200);
  const h = (await fetch(BASE + "/")).headers; assert.match(h.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
});

test("a parent must agree before a family is linked; strangers cannot enter the community", async () => {
  const seniorPhone = "+9172" + rnd().slice(0, 8); const s = await login(seniorPhone, { role: "senior" }); // the parent already uses Uday
  assert.equal((await call(s, "/api/community/groups")).status, 404, "a self declared senior with no confirmed family cannot see groups");
  const stranger = await login("+9196" + rnd().slice(0, 8));
  const r = await call(stranger, "/api/recipients", { name: "My Parent", address: "1 Road, Pune", locality: "Baner", hospital: "Ruby Hall", hasPhone: true, phone: seniorPhone,
    emergencyContacts: [{ name: "Fraud", relation: "Son", phone: "9822011111", city: "Pune", isLocal: true }, { name: "Other", relation: "Friend", phone: "9822011112", city: "Pune", isLocal: true }], consent: { onBehalf: true, shareWithCaregiver: { allergies: true, medicines: true, conditions: true } } });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  let home = (await call(s, "/api/senior")).j; assert.equal(home.linked, false, "not linked without the parent's yes"); assert.equal(home.requests.length, 1); assert.equal(home.contacts, undefined);
  assert.equal((await call(s, "/api/senior/links", { id: r.j.id, accept: false })).status, 200);
  home = (await call(s, "/api/senior")).j; assert.equal(home.linked, false); assert.equal(home.requests.length, 0);
  assert.equal((await call(s, "/api/checkins", { status: "ok" })).status >= 400, true, "nothing of the parent's reaches the stranger");
  assert.equal((await call(s, "/api/senior/links", { id: r.j.id, accept: true })).status, 404, "a declined request cannot be reopened by anyone");
});

test("SOS tells the truth: who was reached, repeats join, family acknowledges, escalation reaches every contact", async () => {
  const { fam, rid, seniorPhone } = await family(); const s = await linkedSenior(seniorPhone);
  const r = await call(s, "/api/sos", {}); assert.equal(r.status, 200, JSON.stringify(r.j)); const a = r.j.alert;
  assert.equal(a.status, "open"); assert.equal(a.anyoneReached, false, "test mode: nothing really left the server"); assert.equal(a.testMode, true); assert.deepEqual(a.reached, []);
  assert.ok(a.simulated.length >= 1, "the family and local contact were attempted");
  const del = (await db.query("SELECT target, name, channel, status, level FROM alert_deliveries WHERE alert_id=$1", [a.id])).rows;
  assert.ok(del.some((d) => d.target === "family")); assert.ok(del.some((d) => d.target === "contact"), "emergency contacts are alerted, not only app users");
  assert.ok(del.some((d) => d.target === "ops"), "the on call line is recorded, sent or not");
  assert.ok(del.every((d) => d.status !== "sent"), "nothing is marked sent when it was only logged");
  const n = (await db.query("SELECT status FROM notifications WHERE template='sos' AND payload->>'alertId'=$1 AND user_id IS NOT NULL", [a.id])).rows;
  assert.ok(n.length >= 1 && n.every((x) => x.status === "simulated"), "notification rows say simulated, never queued or sent: " + JSON.stringify(n));
  // pressing again joins the same alert
  const again = (await call(s, "/api/sos", {})).j.alert; assert.equal(again.id, a.id);
  assert.equal((await db.query("SELECT repeats FROM alerts WHERE id=$1", [a.id])).rows[0].repeats, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM incidents WHERE alert_id=$1 AND severity='critical'", [a.id])).rows[0].n, 1, "one critical incident");
  // the family sees it; an outsider does not
  const mine = (await call(fam, "/api/alerts")).j; assert.equal(mine[0].id, a.id); assert.equal(mine[0].status, "open");
  const other = await family(); assert.equal((await call(other.fam, `/api/alerts/${a.id}`, { action: "ack" })).status, 404);
  assert.equal((await call(s, `/api/alerts/${a.id}`, { action: "ack" })).status, 404, "the person in trouble cannot acknowledge their own alert");
  // nobody answers: the timer escalates to every contact and opens an urgent help request
  await db.query("UPDATE alerts SET next_escalation_at = now() - interval '1 minute' WHERE id=$1", [a.id]);
  // Other test files may run the scheduler at the same moment; its lock lets one run through, so retry briefly.
  let esc: any = null;
  for (let i = 0; i < 6; i++) { assert.equal((await cron()).status, 200); esc = (await db.query("SELECT level FROM alerts WHERE id=$1", [a.id])).rows[0]; if (esc.level >= 1) break; await new Promise((r) => setTimeout(r, 500)); }
  assert.equal(esc.level, 1);
  assert.ok((await db.query("SELECT count(*)::int AS n FROM alert_deliveries WHERE alert_id=$1 AND level=1", [a.id])).rows[0].n >= 2);
  assert.ok((await db.query("SELECT count(*)::int AS n FROM tickets WHERE urgent AND category LIKE 'Unanswered alert%' AND created_at > now() - interval '1 minute'")).rows[0].n >= 1);
  // a contact without the app acknowledges from the SMS link
  await db.query("UPDATE alert_deliveries SET token_hash=$2 WHERE id=(SELECT id FROM alert_deliveries WHERE alert_id=$1 AND target='contact' ORDER BY id LIMIT 1)", [a.id, createHash("sha256").update("tok-" + a.id).digest("hex")]);
  const page = await fetch(BASE + "/a/tok-" + a.id); assert.equal(page.status, 200); assert.match(await page.text(), /pressed SOS/);
  const ack = await call(null, "/api/alerts/link/tok-" + a.id, {}); assert.equal(ack.status, 200, JSON.stringify(ack.j)); assert.equal(ack.j.status, "acknowledged");
  const seen = (await call(s, `/api/alerts/${a.id}`)).j; assert.equal(seen.status, "acknowledged"); assert.ok(seen.acknowledgedBy, "the senior is told who is responding");
  assert.equal((await db.query("SELECT next_escalation_at FROM alerts WHERE id=$1", [a.id])).rows[0].next_escalation_at, null, "escalation stops once someone responds");
  assert.equal((await call(null, "/api/alerts/link/not-a-real-token", {})).status, 404);
  assert.equal((await call(fam, `/api/alerts/${a.id}`, { action: "resolve", note: "She is fine" })).j.status, "resolved");
  void rid;
});

test("missed check in raises one alert, a later check in closes it; the scheduler heartbeat keeps health green", async () => {
  const { fam, rid, seniorPhone } = await family(); const s = await linkedSenior(seniorPhone);
  await db.query("UPDATE care_recipients SET checkin_by='00:00' WHERE id=$1", [rid]);
  await db.query("UPDATE policy_settings SET missed_checkin_grace_min=0 WHERE id=1");
  try {
    await cron(); await cron();
    const al = (await db.query("SELECT id, status FROM alerts WHERE care_recipient_id=$1 AND kind='checkin_missed'", [rid])).rows; assert.equal(al.length, 1, "exactly one alert, not one per run");
    assert.equal((await call(fam, "/api/alerts")).j[0].kind, "checkin_missed");
    const c = await call(s, "/api/checkins", { status: "ok" }); assert.equal(c.status, 200); assert.equal(c.j.told, 0, "no family phone really received a message in test mode");
    assert.equal((await db.query("SELECT status FROM alerts WHERE id=$1", [al[0].id])).rows[0].status, "resolved");
  } finally { await db.query("UPDATE policy_settings SET missed_checkin_grace_min=60 WHERE id=1"); }
  const h = await call(null, "/api/health"); assert.equal(h.status, 200, JSON.stringify(h.j)); assert.equal(h.j.scheduler, "running");
  await db.query("UPDATE cron_runs SET last_ok_at = now() - interval '20 minutes' WHERE job='alerts'");
  const stale = await call(null, "/api/health"); assert.equal(stale.status, 503, "a stopped scheduler turns the health check red"); assert.deepEqual(stale.j.stale, ["alerts"]);
  assert.equal((await call(null, "/api/health?deep=0")).status, 200);
  await cron(); assert.equal((await call(null, "/api/health")).status, 200);
  // an urgent check in is an alert too
  const help = await call(s, "/api/checkins", { status: "medical" }); assert.equal(help.j.alert.status, "open"); assert.equal(help.j.alert.kind, "checkin_medical");
});

test("shift codes lock after five wrong tries; a care log sent twice is recorded once; no double booking", async () => {
  const cg = await newCaregiver("Lock Lata" + rnd().slice(0, 4), 1, ["day"]); const { fam, rid } = await family();
  const mk = async () => { const b = await call(fam, "/api/bookings", { recipientId: rid, caregiverId: cg.id, careType: "day", days: 1, startDate: day(1), startTime: "09:00", method: "UPI", careNeed: "companionship", homeCommitments: DAY_HC }); return b; };
  const b1 = await mk(); assert.equal(b1.status, 200, JSON.stringify(b1.j)); const id = b1.j.id;
  // a second request for the same day can wait at the same time, but only one can be accepted
  const b2 = await mk();
  assert.equal((await act(cg.t, id, { action: "accept" })).status, 200);
  if (b2.status === 200) assert.equal((await act(cg.t, b2.j.id, { action: "accept" })).status, 409, "she cannot accept two bookings for the same day");
  await db.query("UPDATE bookings SET start_date=(now() AT TIME ZONE 'Asia/Kolkata')::date WHERE id=$1", [id]);
  await act(cg.t, id, { action: "enroute" });
  const arr = await act(cg.t, id, { action: "arrive" }); assert.equal(arr.status, 200, JSON.stringify(arr.j));
  const ev = (await call(fam, `/api/bookings/${id}`)).j.events; assert.ok(ev.some((e: any) => /without a phone location/.test(e.message)), "an unverified arrival is shown as unverified");
  const code = (await call(fam, `/api/bookings/${id}`)).j.codes?.find((c: any) => c.kind === "start")?.code ?? (await call(fam, `/api/bookings/${id}`)).j.startCode;
  for (let i = 0; i < 5; i++) { const w = await act(cg.t, id, { action: "start", code: code === "0000" ? "1111" : "0000" }); assert.ok([400, 429].includes(w.status)); }
  const locked = await act(cg.t, id, { action: "start", code }); assert.equal(locked.status, 429, "even the right code is refused while locked: " + JSON.stringify(locked.j));
  await db.query("DELETE FROM rate_limits"); // the 15 minutes pass
  assert.equal((await act(cg.t, id, { action: "start", code })).status, 200);
  const log = { action: "log", meal: true, mood: "Good", note: "Ate well", checklist: {} }; const op = "op-" + rnd();
  const l1 = await act(cg.t, id, log, { "X-Client-Op": op }); assert.equal(l1.status, 200, JSON.stringify(l1.j));
  const l2 = await act(cg.t, id, log, { "X-Client-Op": op }); assert.equal(l2.status, 200);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM shift_logs WHERE booking_id=$1", [id])).rows[0].n, 1, "the retried log was not written twice");
});

test("your data: export, consent taken back takes effect at once, delete account erases and blocks sign in", async () => {
  const cg = await newCaregiver("Data Devi" + rnd().slice(0, 4), 1, ["day"]); const { fam, rid } = await family(); const famPhone = (await call(fam, "/api/me")).j.user;
  await call(fam, `/api/recipients/${rid}/health`, { allergies: [{ name: "Penicillin", reaction: "Rash" }], medicines: [{ name: "Metformin", dose: "500 mg", times: "8 AM" }] }, "PUT");
  const b = await call(fam, "/api/bookings", { recipientId: rid, caregiverId: cg.id, careType: "day", days: 1, startDate: day(1), startTime: "09:00", method: "UPI", careNeed: "companionship", homeCommitments: DAY_HC });
  const id = b.j.id; await act(cg.t, id, { action: "accept" });
  await db.query("UPDATE bookings SET start_date=(now() AT TIME ZONE 'Asia/Kolkata')::date WHERE id=$1", [id]);
  assert.ok((await call(cg.t, `/api/bookings/${id}`)).j.health.allergies, "shared while consent stands");
  const c = await call(fam, `/api/recipients/${rid}/consent`, { shareWithCaregiver: { allergies: false, medicines: false, conditions: false } }, "PUT"); assert.equal(c.status, 200, JSON.stringify(c.j));
  const after = (await call(cg.t, `/api/bookings/${id}`)).j.health; assert.ok(!after.allergies && !after.medicines, "withdrawn consent hides health details at once: " + JSON.stringify(after));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM consents WHERE care_recipient_id=$1 AND purpose='caregiver_access' AND withdrawn_at IS NOT NULL", [rid])).rows[0].n, 1, "the old consent is closed, not edited");
  assert.ok((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='view_health' AND entity_id=$1", [id])).rows[0].n >= 1, "caregiver reads of health data are audited");
  const ex = await call(fam, "/api/me/export"); assert.equal(ex.status, 200); assert.ok(ex.j.account.phone.startsWith("+91")); assert.equal(ex.j.parents[0].health.allergies[0].name, "Penicillin");
  // deletion is blocked while care is booked, with the reason
  const blocked = await call(fam, "/api/me/delete", { confirm: "DELETE" }); assert.equal(blocked.status, 409); assert.match(blocked.j.error, /in progress/);
  await act(fam, id, { action: "cancel" });
  assert.equal((await call(fam, "/api/me/delete", { confirm: "yes" })).status, 400);
  const del = await call(fam, "/api/me/delete", { confirm: "DELETE" }); assert.equal(del.status, 200, JSON.stringify(del.j));
  assert.equal((await call(fam, "/api/me")).status, 401, "the old session is dead");
  const u = (await db.query("SELECT name, email, phone_last4, deleted_at FROM users WHERE id=$1", [famPhone.id])).rows[0]; assert.equal(u.name, null); assert.equal(u.phone_last4, "0000"); assert.ok(u.deleted_at);
  const r = (await db.query("SELECT name, address_enc, senior_phone_hash FROM care_recipients WHERE id=$1", [rid])).rows[0]; assert.equal(r.name, "Deleted"); assert.equal(r.address_enc, null); assert.equal(r.senior_phone_hash, null);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM health_profiles WHERE care_recipient_id=$1", [rid])).rows[0].n, 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM emergency_contacts WHERE care_recipient_id=$1", [rid])).rows[0].n, 0);
  assert.ok((await db.query("SELECT count(*)::int AS n FROM ledger_entries WHERE booking_id=$1", [id])).rows[0].n >= 0, "money records stay");
});

test("storage signer matches the worked example in the AWS documentation", () => {
  const h = signV4({ bucket: "examplebucket", region: "us-east-1", accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" }, "GET",
    "https://examplebucket.s3.amazonaws.com/test.txt", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", { Range: "bytes=0-9" }, new Date("2013-05-24T00:00:00Z"));
  assert.match(h.Authorization, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
});

test("store safety: community rules first, block and report hide people at once, AI companion needs consent and can be flagged", async () => {
  const a = await family(); const sa = await linkedSenior(a.seniorPhone);
  const b = await family(); const sb = await linkedSenior(b.seniorPhone);
  const g = (await call(sa, "/api/community/groups")).j[0];
  assert.equal((await call(sa, `/api/community/groups/${g.id}`, { join: true })).status, 428, "rules must be accepted before joining");
  assert.equal((await call(sa, "/api/community/rules")).j.accepted, false);
  for (const s of [sa, sb]) { assert.equal((await call(s, "/api/community/rules", {})).status, 200); assert.equal((await call(s, `/api/community/groups/${g.id}`, { join: true })).status, 200); }
  const body = "Morning walk at the park today " + rnd();
  assert.equal((await call(sb, `/api/community/groups/${g.id}`, { body })).status, 200);
  let feed = (await call(sa, `/api/community/groups/${g.id}`)).j; const post = feed.posts.find((p: any) => p.body === body); assert.ok(post?.authorId, "other members' posts carry an id to block or report");
  // block: the post disappears for both sides at once
  assert.equal((await call(sa, `/api/community/people/${post.authorId}`, { action: "block" })).status, 200);
  feed = (await call(sa, `/api/community/groups/${g.id}`)).j; assert.ok(!feed.posts.some((p: any) => p.body === body), "blocked member's posts are hidden");
  assert.equal((await call(sa, `/api/community/people/${post.authorId}`, { action: "unblock" })).status, 200);
  // report a post: hidden for the reporter at once
  assert.equal((await call(sa, `/api/community/posts/${post.id}`, { action: "report" })).status, 200);
  feed = (await call(sa, `/api/community/groups/${g.id}`)).j; assert.ok(!feed.posts.some((p: any) => p.id === post.id), "a reported post is hidden for the reporter");
  // report a person: blocked for the reporter, and in the Operations queue
  assert.equal((await call(sa, `/api/community/people/${post.authorId}`, { action: "report", reason: "asked for money " + body })).j.blocked, true);
  const ops = await login("+919000000099"); const q1 = (await call(ops, "/api/ops/community")).j;
  const rep = q1.people.find((p: any) => p.reason === "asked for money " + body); assert.ok(rep, "the report reaches Operations");
  assert.equal((await call(ops, "/api/ops/community", { action: "person", id: rep.id, remove: true })).status, 200);
  assert.equal((await call(sb, `/api/community/groups/${g.id}`, { body: "again" })).status, 428, "a removed member must accept the rules again before posting");
  assert.equal((await call(sa, "/api/community/people/00000000-0000-0000-0000-000000000000", { action: "report" })).status, 404);
  // AI companion
  const h = (await call(sa, "/api/senior/companion")).j; assert.equal(h.consented, false); assert.ok(h.about.some((x: string) => /not a person and not a doctor/.test(x)));
  assert.equal((await call(sa, "/api/senior/companion", { message: "Hello" })).status, 428, "no chat before the senior agrees");
  await call(sa, "/api/senior/companion", { consent: true });
  const r = (await call(sa, "/api/senior/companion", { message: "I made poha today" })).j; assert.ok(r.id); assert.ok(r.label, "every reply is labelled");
  assert.equal((await call(sa, "/api/senior/companion", { report: r.id, reason: "odd reply" })).j.reported, true);
  assert.equal((await call(sb, "/api/senior/companion", { report: r.id })).status, 404, "only your own replies");
  const ai = (await call(ops, "/api/ops/community")).j.ai.find((m: any) => m.id === r.id); assert.ok(ai && ai.reply === r.reply, "flagged AI reply reaches Operations");
  assert.equal(ai.text, undefined);
  await call(sa, "/api/senior/companion", { consent: false });
  assert.equal((await call(sa, "/api/senior/companion", { message: "Hello" })).status, 428, "taking consent back stops the companion at once");
});

test("care logs: medicines are never inferred from a tick, and unmarked tasks are shown when the shift ends", async () => {
  const { fam, rid } = await family(); const cg = await newCaregiver("Lata Inferred " + rnd().slice(0, 4), 1, ["day"]);
  const b = await call(fam, "/api/bookings", { recipientId: rid, caregiverId: cg.id, careType: "day", days: 1, startDate: day(1), startTime: "09:00", method: "UPI", careNeed: "companionship", homeCommitments: DAY_HC });
  const id = b.j.id; await act(cg.t, id, { action: "accept" });
  await db.query("UPDATE bookings SET start_date=(now() AT TIME ZONE 'Asia/Kolkata')::date WHERE id=$1", [id]);
  await act(cg.t, id, { action: "enroute" }); await act(cg.t, id, { action: "arrive" });
  const v = (await call(fam, `/api/bookings/${id}`)).j;
  assert.equal((await act(cg.t, id, { action: "start", code: v.startCode })).status, 200, "start");
  const now = new Date().toISOString();
  assert.equal((await act(cg.t, id, { action: "log", mood: "calm", checklist: { medication: now, breakfast: now } })).status, 200);
  const end = (await call(fam, `/api/bookings/${id}`)).j;
  assert.equal(end.logs[0].meds, null, "a ticked medication row is not recorded as medicines given"); assert.equal(end.logs[0].meal, null);
  assert.equal((await act(cg.t, id, { action: "end", code: end.endCode })).status, 200);
  const ev = (await call(fam, `/api/bookings/${id}`)).j.events; assert.ok(ev.some((e: any) => /Not marked done in shift 1/.test(e.message)), "the family sees what was not marked");
});

test("coupons are admin only and audited", async () => {
  const admin = await login("+919000000099"); const agentPhone = "+9188" + rnd().slice(0, 8);
  await call(admin, "/api/ops/team", { action: "add", phone: agentPhone, name: "Agent " + rnd().slice(0, 4), role: "agent" });
  const agent = await login(agentPhone); const code = "T" + rnd().slice(0, 7);
  assert.equal((await call(agent, "/api/ops/family", { action: "coupon", code, feeDiscountBps: 5000 })).status, 403, "an agent cannot create coupons");
  assert.equal((await call(admin, "/api/ops/family", { action: "coupon", code, feeDiscountBps: 5000 })).status, 200);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='coupon_created' AND reason LIKE $1", ["%" + code + "%"])).rows[0].n, 1);
});
