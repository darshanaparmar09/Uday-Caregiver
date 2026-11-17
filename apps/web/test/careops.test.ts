// Care operations from the end to end journey: live in days, relief day off, weekly billing, extension,
// replacement, no show alerts, profiles with reviews and photos, intro calls, the senior's caregiver card.
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
const act = (t: string, id: string, a: object) => call(t, `/api/bookings/${id}/action`, a);
const view = async (t: string, id: string) => (await call(t, `/api/bookings/${id}`)).j;
const code = async (fam: string, id: string, kind: string) => (await view(fam, id)).codes.find((c: any) => c.kind === kind)?.code;

test("live in month: one start code, daily close, relief day off, welcome back, weekly billing, replacement, refund", async () => {
  await db.connect();
  const main = await newCaregiver("Rekha Live" + rnd().slice(0, 3), 3, ["live"]);
  const relief = await newCaregiver("Pooja Relief" + rnd().slice(0, 3), 3, ["day"]);
  const { fam, rid, seniorPhone } = await family();
  const start = day(1); const offDay = new Date(Date.parse(day(3) + "T00:00:00Z")).getUTCDay(); // day 3 of care is the day off
  const base = { recipientId: rid, caregiverId: main.id, careType: "live", days: 30, startDate: start, startTime: "09:00", method: "UPI", careNeed: "discharge", homeCommitments: LIVE_HC };
  assert.equal((await call(fam, "/api/bookings", base)).status, 400, "day off required for live in");
  const b = await call(fam, "/api/bookings", { ...base, dayOff: offDay }); assert.equal(b.status, 200, JSON.stringify(b.j)); const id = b.j.id;
  let v = await view(fam, id);
  assert.equal(v.billing, "weekly"); assert.equal(v.cycles.length, 5); assert.equal(v.cycles[0].status, "held");
  assert.equal(v.cycles.reduce((s: number, c: any) => s + c.amount_paise, 0), v.fees.totalPaise, "cycles add up to the total");
  assert.equal((await act(main.t, id, { action: "accept" })).status, 200);
  v = await view(fam, id); assert.equal(v.paidPaise, v.cycles[0].amount_paise); assert.equal(v.cycles[0].status, "paid");
  assert.ok(v.relief.some((r: any) => r.dayNo === 3), "relief day created for the day off");
  // senior sees who is coming
  const s = await login(seniorPhone, { role: "senior" }); // the parent agrees to the family link before anything is shared
  for (const r of (await call(s, "/api/senior/links")).j) await call(s, "/api/senior/links", { id: r.id, accept: true }); assert.equal((await call(s, "/api/senior")).j.caregiver.name, main.name);
  // day 1: travel, arrive, start code
  await act(main.t, id, { action: "enroute" }); await act(main.t, id, { action: "arrive" });
  assert.equal((await act(main.t, id, { action: "start", code: await code(fam, id, "start") })).status, 200);
  assert.equal((await view(fam, id)).codes.length, 0, "no end code on day 1 of live in care");
  assert.equal((await act(main.t, id, { action: "day_close" })).status, 400, "log first");
  await act(main.t, id, { action: "log", mood: "Calm", meal: true });
  assert.equal((await act(main.t, id, { action: "end", code: "1234" })).status, 400, "live in uses day close");
  assert.equal((await act(main.t, id, { action: "day_close" })).status, 200);
  assert.equal((await act(fam, id, { action: "day_check", day: 1, ok: true })).status, 200);
  // relief offered for day 3 to someone of the same tier; make sure our new relief caregiver gets it
  await db.query("UPDATE relief_shifts SET tried = ARRAY(SELECT id FROM caregivers WHERE tier=3 AND id NOT IN ($2::uuid)) WHERE booking_id=$1", [id, relief.id]);
  assert.equal((await cron("?job=relief")).status, 200);
  const offers = (await call(relief.t, "/api/relief")).j; const ro = offers.find((o: any) => o.bookingId === id); assert.ok(ro, JSON.stringify(offers));
  assert.equal(ro.address, null, "address hidden before accepting");
  assert.equal((await call(relief.t, `/api/relief/${ro.id}`, { action: "accept" })).status, 200);
  // day 2 closes, main goes on her day off
  await act(main.t, id, { action: "log", mood: "Cheerful" }); assert.equal((await act(main.t, id, { action: "day_close" })).status, 200);
  v = await view(fam, id); assert.equal(v.away, true); assert.equal(v.daysDone, 2);
  assert.equal((await act(main.t, id, { action: "log", mood: "Calm" })).status, 400, "no logging on her day off");
  assert.equal((await call(s, "/api/senior")).j.caregiver.relief, true, "senior sees the relief caregiver");
  // relief day 3 with its own codes
  assert.equal((await call(relief.t, `/api/relief/${ro.id}`, { action: "arrive" })).status, 200);
  assert.equal((await call(relief.t, `/api/relief/${ro.id}`, { action: "start", code: await code(fam, id, "relief_start") })).status, 200);
  assert.equal((await call(relief.t, `/api/relief/${ro.id}`, { action: "end", code: await code(fam, id, "relief_end") })).status, 400, "log first");
  await call(relief.t, `/api/relief/${ro.id}`, { action: "log", mood: "Calm", meal: true });
  assert.equal((await call(relief.t, `/api/relief/${ro.id}`, { action: "end", code: await code(fam, id, "relief_end") })).status, 200);
  const pay = await db.query("SELECT account, credit_paise FROM ledger_entries WHERE booking_id=$1 AND reason='relief day 3 pay'", [id]);
  assert.equal(pay.rows[0].account, `caregiver:${relief.id}`, "relief caregiver is paid for the day off");
  assert.equal((await act(main.t, id, { action: "return", code: "0000" === (await code(fam, id, "return")) ? "1111" : "0000" })).status, 400);
  assert.equal((await act(main.t, id, { action: "return", code: await code(fam, id, "return") })).status, 200);
  v = await view(fam, id); assert.equal(v.away, false); assert.equal(v.daysDone, 3);
  // weekly billing: charge the remaining weeks now (test mode)
  assert.equal((await cron(`?job=billing&booking=${id}`)).status, 200);
  v = await view(fam, id); assert.ok(v.cycles.every((c: any) => c.status === "paid")); assert.equal(v.paidPaise, v.fees.totalPaise);
  assert.equal((await act(fam, id, { action: "extend", days: 7 })).status, 400, "extend only in the last week");
  // replacement for the remaining days at the same price
  const before = v.paidPaise;
  assert.equal((await act(fam, id, { action: "replace", reason: "Language" })).status, 200);
  v = await view(fam, id); assert.equal(v.status, "proposal"); assert.ok(v.proposal);
  assert.equal((await act(fam, id, { action: "approve" })).status, 200);
  v = await view(fam, id); assert.equal(v.status, "offered"); assert.equal(v.paidPaise, before, "nothing charged again");
  // cancel instead of waiting: unused paid money comes back, minus the late fee
  const r = await act(fam, id, { action: "cancel" }); assert.equal(r.status, 200);
  v = await view(fam, id); assert.equal(v.status, "cancelled");
  const esc = await db.query("SELECT COALESCE(SUM(credit_paise-debit_paise),0)::int AS n FROM ledger_entries WHERE booking_id=$1 AND account='escrow'", [id]);
  assert.equal(esc.rows[0].n, 0, "escrow fully settled"); assert.ok(v.refundPaise > 0);
});

test("extension on a weekly booking; no show alert; caregiver photo and public reviews; intro call", async () => {
  const cg = await newCaregiver("Sunanda Day" + rnd().slice(0, 3), 1, ["day"]);
  const { fam, rid } = await family();
  const b = await call(fam, "/api/bookings", { recipientId: rid, caregiverId: cg.id, careType: "day", days: 7, startDate: day(2), startTime: "09:00", method: "Card", careNeed: "companionship", homeCommitments: DAY_HC });
  assert.equal(b.status, 200, JSON.stringify(b.j)); const id = b.j.id;
  await act(cg.t, id, { action: "accept" });
  const total0 = (await view(fam, id)).fees.totalPaise;
  assert.equal((await act(fam, id, { action: "extend", days: 7 })).status, 200);
  assert.equal((await act(cg.t, id, { action: "extension", accept: true })).status, 200);
  let v = await view(fam, id); assert.equal(v.days, 14); assert.equal(v.fees.totalPaise, total0 * 2); assert.equal(v.paidPaise, total0 * 2);
  // no show: pretend care started an hour ago
  await db.query("UPDATE bookings SET start_date=current_date, start_time=(now() AT TIME ZONE 'Asia/Kolkata' - interval '60 minutes')::time WHERE id=$1", [id]);
  assert.equal((await cron()).status, 200);
  v = await view(fam, id); assert.ok(v.events.some((e: any) => /has not arrived/.test(e.message)));
  assert.ok(v.tickets.some((t: any) => t.urgent));
  await cron(); assert.equal((await view(fam, id)).events.filter((e: any) => /has not arrived/.test(e.message)).length, 1, "alert once");
  // photo: pending until Uday checks it
  assert.equal((await call(cg.t, "/api/caregiver/documents", { kind: "photo", base64: PNG, mime: "image/png" })).j.photo, "pending");
  assert.equal((await fetch(`${BASE}/api/caregivers/${cg.id}/photo`)).status, 404);
  const ops = await login("+919000000099");
  assert.ok((await call(ops, "/api/ops/care")).j.photos.some((p: any) => p.id === cg.id));
  await call(ops, "/api/ops/care", { action: "photo", caregiverId: cg.id, verified: true });
  const ph = await fetch(`${BASE}/api/caregivers/${cg.id}/photo`); assert.equal(ph.status, 200); assert.equal(ph.headers.get("content-type"), "image/png");
  assert.match((await call(null, `/api/caregivers/${cg.id}`)).j.photo, /photo$/);
  // public review after a completed one day booking
  const { fam: f2, rid: r2 } = await family();
  const b2 = (await call(f2, "/api/bookings", { recipientId: r2, caregiverId: cg.id, careType: "day", days: 1, startDate: day(40), startTime: "09:00", method: "UPI", careNeed: "companionship", homeCommitments: DAY_HC })).j.id;
  await act(cg.t, b2, { action: "accept" }); await act(cg.t, b2, { action: "enroute" }); await act(cg.t, b2, { action: "arrive" });
  await act(cg.t, b2, { action: "start", code: await code(f2, b2, "start") }); await act(cg.t, b2, { action: "log", mood: "Calm" });
  await act(cg.t, b2, { action: "end", code: await code(f2, b2, "end") });
  const areas = { punctuality: 5, quality: 5, kindness: 5, hygiene: 4, communication: 5 };
  assert.equal((await act(f2, b2, { action: "rate", areas, publicText: "Call her on 98220 11111" })).status, 400, "no phone numbers in public reviews");
  assert.equal((await act(f2, b2, { action: "rate", areas, tags: ["Kind and patient"], publicText: "Patient and gentle with my mother." })).status, 200);
  const p = (await call(null, `/api/caregivers/${cg.id}`)).j;
  assert.equal(p.reviews[0].text, "Patient and gentle with my mother."); assert.equal(p.reviews[0].overall, 4.8); assert.equal(p.areaAverages.hygiene, 4);
  // intro call
  const slots = [new Date(Date.now() + 26 * 3600e3).toISOString(), new Date(Date.now() + 50 * 3600e3).toISOString()];
  const intro = await call(fam, "/api/intros", { caregiverId: cg.id, recipientId: rid, slots, note: "Please speak Marathi" }); assert.equal(intro.status, 200);
  assert.equal((await call(fam, "/api/intros", { caregiverId: cg.id, recipientId: rid, slots })).status, 400, "one at a time");
  const mine = (await call(cg.t, "/api/intros")).j.find((x: any) => x.id === intro.j.id); assert.ok(mine);
  assert.equal((await call(cg.t, `/api/intros/${intro.j.id}`, { action: "choose", slot: slots[1] })).status, 200);
  const fv = (await call(fam, "/api/intros")).j.find((x: any) => x.id === intro.j.id); assert.equal(fv.status, "confirmed");
  assert.ok((await call(ops, "/api/ops/care")).j.introCalls.some((x: any) => x.id === intro.j.id), "Uday connects the call when no video link is set");
  await db.end();
});
