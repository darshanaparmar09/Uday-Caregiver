// AI assisted care: matching, daily updates, care flags, tomorrow's risks, quality, voice and appointments.
// Claude and Sarvam are not connected in tests, so these check the rules based paths and the consent gates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_URL, DAY_HC, act, call, cron, day, db, family, linkedSenior, login, newCaregiver, rnd } from "./helpers";
import * as core from "@uday/core";
// Under tsx the core package loads as CommonJS, so its exports sit on default.
const { matchScore } = ((core as any).default ?? core) as typeof import("@uday/core");

test.before(() => db.connect());
test.after(() => db.end().catch(() => {}));

test("matching rules: reasons are true, and a busy caregiver never counts as a match", () => {
  const base = { tier: 2, skills: ["Dementia care", "Transfers"], languages: ["Marathi"], rating: 4.8, ratingCount: 12, needTier: 2, needSkills: ["Dementia care"],
    seniorLanguages: ["Marathi", "Hindi"], km: 3.2, sameArea: false, daysAsked: 7, daysBusy: 0, rehireStars: null };
  const a = matchScore(base);
  assert.ok(a.available); assert.ok(a.reasons.includes("Trained in Dementia care")); assert.ok(a.reasons.includes("Speaks Marathi")); assert.ok(a.reasons.includes("About 3 km away"));
  const busy = matchScore({ ...base, daysBusy: 2 });
  assert.equal(busy.available, false); assert.equal(busy.reasons[0], "Not free on 2 of your 7 days"); assert.ok(busy.score < a.score - 50);
  const before = matchScore({ ...base, rehireStars: 5 }); assert.ok(before.score > a.score); assert.match(before.reasons[0], /Cared for your parent before/);
  const far = matchScore({ ...base, km: 25 }); assert.ok(far.score < a.score);
});

test("Why this match: ranked for the family's parent and dates, busy caregivers last", async () => {
  const { fam, rid } = await family();
  await db.query("UPDATE care_recipients SET languages='{Marathi}' WHERE id=$1", [rid]);
  const free = await newCaregiver("Meera Free " + rnd().slice(0, 4), 1, ["day"]);
  const busy = await newCaregiver("Leela Busy " + rnd().slice(0, 4), 1, ["day"]);
  await db.query("INSERT INTO caregiver_unavailable (caregiver_id, day, reason) VALUES ($1,$2,'test')", [busy.id, day(2)]);
  const r = await call(fam, `/api/caregivers?type=day&tier=1&need=companionship&recipientId=${rid}&start=${day(2)}&days=1`);
  assert.equal(r.status, 200);
  const f = r.j.find((c: any) => c.id === free.id), b = r.j.find((c: any) => c.id === busy.id);
  assert.ok(f.match.available && f.match.reasons.includes("Speaks Marathi"), JSON.stringify(f.match));
  assert.equal(b.match.available, false); assert.match(b.match.reasons[0], /Not free/);
  assert.ok(r.j.indexOf(f) < r.j.indexOf(b), "free caregivers rank above busy ones");
  assert.equal(f.lat, undefined, "caregiver location is never sent to families");
  const other = await login("+9195" + rnd().slice(0, 8));
  assert.equal((await call(other, `/api/caregivers?type=day&recipientId=${rid}`)).status, 404, "another family cannot rank for someone else's parent");
  assert.equal((await call(null, "/api/caregivers?type=day")).status, 200, "the public list still works without signing in");
});

test("daily update, care flags and their review: built from the caregiver's own records", async () => {
  const { fam, rid } = await family(); const cg = await newCaregiver("Sunanda Logs " + rnd().slice(0, 4), 1, ["day"]);
  const b = await call(fam, "/api/bookings", { recipientId: rid, caregiverId: cg.id, careType: "day", days: 1, startDate: day(1), startTime: "09:00", method: "UPI", careNeed: "companionship", homeCommitments: DAY_HC });
  const id = b.j.id; await act(cg.t, id, { action: "accept" });
  await db.query("UPDATE bookings SET start_date=(now() AT TIME ZONE 'Asia/Kolkata')::date WHERE id=$1", [id]);
  await act(cg.t, id, { action: "enroute" }); await act(cg.t, id, { action: "arrive" });
  const v = (await call(fam, `/api/bookings/${id}`)).j;
  assert.equal((await act(cg.t, id, { action: "start", code: v.startCode })).status, 200);
  const now = new Date().toISOString();
  assert.equal((await act(cg.t, id, { action: "log", mood: "Upset", meds: false, note: "Aai slipped near the bathroom door but got up herself. She refused lunch.", checklist: { breakfast: now } })).status, 200);
  const after = (await call(fam, `/api/bookings/${id}`)).j;
  assert.equal(after.updates.length, 1); const u = after.updates[0];
  assert.match(u.text, /Mood: Upset/); assert.match(u.text, /Medicines: caregiver says NOT given/); assert.match(u.text, /slipped near the bathroom/);
  assert.equal(u.source, "template", "without AI help the update is a template from the records");
  assert.ok((await call(fam, "/api/updates")).j.some((x: any) => x.bookingId === id), "the dashboard shows the latest update");
  const kinds = (await db.query("SELECT kind, source FROM care_flags WHERE booking_id=$1", [id])).rows.map((r) => r.kind).sort();
  for (const k of ["fall", "low_mood", "meal_not_eaten", "medicines_not_given"]) assert.ok(kinds.includes(k), `flag ${k}: got ${kinds}`);
  const ops = await login("+919000000099");
  const flags = (await call(ops, "/api/ops/insights?view=flags")).j.filter((f: any) => f.bookingId === id);
  assert.ok(flags.length >= 4); const fall = flags.find((f: any) => f.kind === "fall"); assert.match(fall.detail, /slipped/); assert.equal(fall.source, "rules");
  assert.equal((await call(ops, "/api/ops/insights", { action: "review_flag", id: fall.id, note: "Called the daughter, Aai is fine" })).status, 200);
  assert.ok(!(await call(ops, "/api/ops/insights?view=flags")).j.some((f: any) => f.id === fall.id), "a reviewed flag leaves the queue");
  assert.equal((await call(fam, "/api/ops/insights?view=flags")).status, 403, "families cannot see the flag queue");
  // The caregiver's later log updates the same day's summary, never a second one.
  await act(cg.t, id, { action: "log", mood: "Calm", note: "Ate dinner well." });
  assert.equal((await call(fam, `/api/bookings/${id}`)).j.updates.length, 1);
});

test("tomorrow's risks: unaccepted shifts and unavailable caregivers, with free standbys", async () => {
  const { fam, rid } = await family(); const cg = await newCaregiver("Rekha Risk " + rnd().slice(0, 4), 1, ["day"]);
  const spare = await newCaregiver("Asha Standby " + rnd().slice(0, 4), 1, ["day"]);
  const b = await call(fam, "/api/bookings", { recipientId: rid, caregiverId: cg.id, careType: "day", days: 1, startDate: day(1), startTime: "09:00", method: "UPI", careNeed: "companionship", homeCommitments: DAY_HC });
  const ops = await login("+919000000099");
  let r = (await call(ops, `/api/ops/insights?view=risks&date=${day(1)}`)).j;
  let mine = r.atRisk.find((x: any) => x.bookingId === b.j.id);
  assert.ok(mine && mine.level === "high" && mine.reasons.some((x: any) => x.text === "No caregiver has accepted yet"), JSON.stringify(mine));
  await act(cg.t, b.j.id, { action: "accept" });
  await db.query("INSERT INTO caregiver_unavailable (caregiver_id, day, reason) VALUES ($1,$2,'test') ON CONFLICT DO NOTHING", [cg.id, day(1)]);
  r = (await call(ops, `/api/ops/insights?view=risks&date=${day(1)}`)).j; mine = r.atRisk.find((x: any) => x.bookingId === b.j.id);
  assert.ok(mine.reasons.some((x: any) => x.text === "Caregiver marked this day unavailable"));
  assert.ok(mine.standby.length > 0 && mine.standby.length <= 3, "up to three free standbys are offered");
  const all = (await call(fam, `/api/caregivers?type=day&tier=1&start=${day(1)}&days=1`)).j;
  for (const sb of mine.standby) assert.equal(all.find((c: any) => c.id === sb.id)?.match.available, true, "every standby is free that day");
  void spare;
  assert.ok(!mine.standby.some((s: any) => s.id === cg.id));
});

test("weekly quality report and themes work without AI", async () => {
  const ops = await login("+919000000099");
  const q = await call(ops, "/api/ops/insights?view=quality");
  assert.equal(q.status, 200); assert.ok(Array.isArray(q.j.caregivers)); assert.ok(Array.isArray(q.j.areas)); assert.equal(q.j.aiConnected, false);
  const t = await call(ops, "/api/ops/insights", { action: "themes" });
  assert.equal(t.status, 200); assert.equal(t.j.source, "rules");
  assert.ok((await call(ops, "/api/ops/insights?view=quality")).j.themes, "themes are saved for the week");
});

test("Speak to Uday: consent first, kept for a person to hear, private to the family", async () => {
  const { fam, rid, seniorPhone } = await family(); const s = await linkedSenior(seniorPhone);
  const wav = Buffer.alloc(3200, 0);
  const send = (t: string, purpose: string) => { const f = new FormData(); f.append("audio", new Blob([wav], { type: "audio/wav" }), "a.wav"); f.append("purpose", purpose);
    return fetch(BASE_URL + "/api/voice", { method: "POST", headers: { Authorization: "Bearer " + t }, body: f }).then(async (r) => ({ status: r.status, j: await r.json() as any })); };
  assert.equal((await send(s, "request")).status, 428, "no recording is taken before the senior agrees");
  const st = (await call(s, "/api/voice")).j; assert.equal(st.consented, false); assert.ok(st.about.some((a: string) => /Sarvam/.test(a)));
  await call(s, "/api/voice", { consent: true }, "PUT");
  const r = await send(s, "request");
  assert.equal(r.status, 200, JSON.stringify(r.j)); assert.equal(r.j.heard, null, "no transcript without speech to text"); assert.equal(r.j.category, "unknown");
  const list = (await call(fam, "/api/voice/requests")).j; const v = list.find((x: any) => x.id === r.j.id); assert.ok(v, "the family sees the request");
  const audio = await fetch(`${BASE_URL}/api/voice/requests/${v.id}/audio`, { headers: { Authorization: "Bearer " + fam } });
  assert.equal(audio.status, 200); assert.equal((await audio.arrayBuffer()).byteLength, wav.length, "the family can play back exactly what was said");
  const other = await login("+9195" + rnd().slice(0, 8));
  assert.equal((await fetch(`${BASE_URL}/api/voice/requests/${v.id}/audio`, { headers: { Authorization: "Bearer " + other } })).status, 404);
  const ops = await login("+919000000099");
  assert.ok((await call(ops, "/api/ops/insights?view=voice")).j.some((x: any) => x.id === v.id), "Operations sees it too");
  const listen = await fetch(`${BASE_URL}/api/ops/voice/${v.id}/audio`, { headers: { Authorization: "Bearer " + ops } }); assert.equal(listen.status, 200);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='listen' AND entity_id=$1", [v.id])).rows[0].n, 1, "listening is audited");
  assert.equal((await call(fam, `/api/voice/requests/${v.id}`, { status: "done" })).status, 200);
  // Companion by voice and caregiver dictation say plainly that speech to text is not connected.
  assert.equal((await send(s, "companion")).status, 503);
  const cg = await newCaregiver("Dictation Test " + rnd().slice(0, 4), 1, ["day"]);
  assert.equal((await send(cg.t, "note")).status, 428);
  await call(cg.t, "/api/voice", { consent: true }, "PUT");
  const d = await send(cg.t, "note"); assert.equal(d.status, 503); assert.equal(d.j.voiceOff, true);
  void rid;
});

test("appointments: family adds, reminders go out once, AI suggestions need AI help", async () => {
  const { fam, rid, seniorPhone } = await family(); await linkedSenior(seniorPhone);
  const at = new Date(Date.now() + 90 * 60e3).toISOString();
  const a = await call(fam, `/api/recipients/${rid}/appointments`, { title: "Review with Dr Joshi", at, place: "Deenanath, OPD 3", kind: "follow_up" });
  assert.equal(a.status, 200, JSON.stringify(a.j)); assert.equal(a.j.status, "confirmed");
  assert.equal((await call(fam, `/api/recipients/${rid}/appointments`, { title: "Past", at: new Date(Date.now() - 86400e3).toISOString() })).status, 400);
  const count = async () => (await db.query("SELECT count(*)::int AS n FROM notifications WHERE template='appointment_reminder' AND payload->>'appointmentId'=$1", [a.j.id])).rows[0].n;
  for (let i = 0; i < 6 && (await count()) < 4; i++) { await cron(); await new Promise((r) => setTimeout(r, 300)); }
  await cron(); const sent = await count();
  assert.equal(sent, 4, "day before and soon reminders, to the family and the senior, once each");
  const other = await login("+9195" + rnd().slice(0, 8));
  assert.equal((await call(other, `/api/recipients/${rid}/appointments`)).status, 404);
  const doc = await call(fam, `/api/recipients/${rid}/documents`, { kind: "prescription", title: "Discharge summary", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", mime: "image/png" });
  const docId = doc.j.id ?? (await call(fam, `/api/recipients/${rid}/documents`)).j[0]?.id;
  const sug = await call(fam, `/api/recipients/${rid}/appointments/suggest`, { documentId: docId });
  assert.equal(sug.status, 409); assert.equal(sug.j.data?.needsAiHelp ?? sug.j.needsAiHelp, true);
  assert.equal((await call(fam, `/api/recipients/${rid}/ai-help`, { on: true }, "PUT")).j.on, true);
  const h = (await call(fam, `/api/recipients/${rid}/ai-help`)).j; assert.equal(h.on, true); assert.equal(h.connected, false);
  assert.equal((await call(fam, `/api/recipients/${rid}/appointments/suggest`, { documentId: docId })).status, 409, "consent alone is not enough while AI is not connected");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM consents WHERE care_recipient_id=$1 AND purpose='ai_help'", [rid])).rows[0].n, 1);
  await call(fam, `/api/recipients/${rid}/ai-help`, { on: false }, "PUT");
  assert.equal((await call(fam, `/api/recipients/${rid}/ai-help`)).j.on, false);
  assert.equal((await call(fam, `/api/recipients/${rid}/appointments/${a.j.id}`, { action: "done" })).j.status, "done");
});
