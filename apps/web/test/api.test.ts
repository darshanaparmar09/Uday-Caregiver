// End to end API test. Needs a running server and a seeded database.
// Run: BASE_URL=http://localhost:3000 npm test -w @uday/web   (server started with OTP_DEV_CODE=123456, GATEWAY=mock)
import { test } from "node:test";
import assert from "node:assert/strict";

import pg from "pg";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
test.before(() => db.connect());
test.after(() => db.end().catch(() => {}));
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OTP = process.env.OTP_DEV_CODE ?? "123456";
const rnd = () => String(Math.floor(1e9 + Math.random() * 8e9)).slice(0, 9);

async function call(token: string | null, path: string, body?: unknown, method?: string) {
  const r = await fetch(BASE + path, { method: method ?? (body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j: any = await r.json().catch(() => ({}));
  return { status: r.status, j };
}
async function login(phone: string, extra: object = {}) {
  assert.equal((await call(null, "/api/auth/request", { phone })).status, 200);
  const r = await call(null, "/api/auth/verify", { phone, code: OTP, client: "app", ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  return r.j.token as string;
}
const tomorrow = () => new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10);

let fam: string, fam2: string, rid: string, seniorPhone: string;

test("family signs up, onboards, adds optional health", async () => {
  fam = await login("+91" + "8" + rnd(), { name: "Darshana Test" });
  assert.equal((await call(fam, "/api/profile", { name: "Darshana Test", country: "USA", city: "Raleigh", timezone: "America/New_York", language: "en" }, "PUT")).status, 200);
  seniorPhone = "+91" + "7" + rnd();
  const r = await call(fam, "/api/recipients", { name: "Ramesh", address: "B4 Sunshine Towers, Kothrud, Pune", locality: "Kothrud", hospital: "Deenanath Mangeshkar", hasPhone: true, phone: seniorPhone,
    careNeeds: { walking: true }, emergencyContacts: [{ name: "Arjun", relation: "Son", phone: "+14155550100", city: "Raleigh" }, { name: "Bharati", relation: "Neighbour", phone: "9822012345", city: "Pune", isLocal: true }],
    consent: { onBehalf: true, shareWithCaregiver: { allergies: true, medicines: true, conditions: false } } });
  assert.equal(r.status, 200, JSON.stringify(r.j)); rid = r.j.id;
  assert.equal((await call(fam, `/api/recipients/${rid}/health`, { noKnownAllergies: false, allergies: [{ name: "Penicillin", severity: "severe" }], medicines: [{ name: "Metformin", dose: "500 mg", times: "8 AM", givenBy: "caregiver" }], conditions: ["Diabetes"] }, "PUT")).status, 200);
});

test("onboarding rejects a single emergency contact", async () => {
  const r = await call(fam, "/api/recipients", { name: "X", address: "Some address 1", locality: "Aundh", hospital: "H", emergencyContacts: [{ name: "A", relation: "S", phone: "9822012345", city: "Pune" }], consent: { onBehalf: true, shareWithCaregiver: { allergies: false, medicines: false, conditions: false } } });
  assert.equal(r.status, 422);
});

test("full lifecycle: book, accept, travel, codes, log, end, rate", async () => {
  const list = await call(null, "/api/caregivers?type=day&tier=2");
  const sunita = list.j.find((c: any) => c.display_name === "Sunita Pawar");
  assert.ok(sunita.police_verified);
  const b = await call(fam, "/api/bookings", { recipientId: rid, caregiverId: sunita.id, careType: "day", days: 1, startDate: tomorrow(), startTime: "09:00", method: "UPI", careNeed: "companionship", homeCommitments: ["toilet", "water", "belongings", "household", "infection", "cameras", "scope"] });
  assert.equal(b.status, 200, JSON.stringify(b.j)); const id = b.j.id;
  assert.equal(b.j.total_paise, 153216);

  const cg = await login("+919000000001");
  const jobs = await call(cg, "/api/bookings"); assert.ok(jobs.j.some((x: any) => x.id === id));
  const before = await call(cg, `/api/bookings/${id}`); assert.equal(before.j.address, undefined, "address hidden before acceptance");
  assert.equal((await call(fam, `/api/bookings/${id}/action`, { action: "accept" })).status, 403, "family cannot accept");
  assert.equal((await call(cg, `/api/bookings/${id}/action`, { action: "accept" })).status, 200);
  // Care window: the address and health details open 24 hours before the first shift, not on acceptance.
  await db.query("UPDATE bookings SET start_date = current_date + 5 WHERE id=$1", [id]);
  const early = await call(cg, `/api/bookings/${id}`); assert.equal(early.j.address, undefined, "address hidden until the care window"); assert.equal(early.j.health, undefined); assert.ok(early.j.addressFrom);
  await db.query("UPDATE bookings SET start_date = (now() AT TIME ZONE 'Asia/Kolkata')::date WHERE id=$1", [id]);
  const after = await call(cg, `/api/bookings/${id}`);
  assert.ok(after.j.address.includes("Sunshine")); assert.equal(after.j.health.allergies[0].name, "Penicillin"); assert.equal(after.j.health.conditions, null, "conditions not shared");
  assert.equal(after.j.accessNotes, undefined);
  assert.equal((await call(cg, `/api/bookings/${id}/action`, { action: "enroute" })).status, 200);
  assert.equal((await call(cg, `/api/bookings/${id}/action`, { action: "arrive" })).status, 200);
  const fv = await call(fam, `/api/bookings/${id}`); assert.match(fv.j.startCode, /^\d{4}$/);
  assert.equal((await call(cg, `/api/bookings/${id}/action`, { action: "start", code: "0000" === fv.j.startCode ? "1111" : "0000" })).status, 400);
  assert.equal((await call(cg, `/api/bookings/${id}/action`, { action: "start", code: fv.j.startCode })).status, 200);
  const fe = await call(fam, `/api/bookings/${id}`);
  assert.equal((await call(cg, `/api/bookings/${id}/action`, { action: "end", code: fe.j.endCode })).status, 400, "log required first");
  assert.equal((await call(cg, `/api/bookings/${id}/action`, { action: "log", meal: true, meds: true, mood: "Cheerful", note: "Walked 10 minutes" })).status, 200);
  assert.equal((await call(cg, `/api/bookings/${id}/action`, { action: "end", code: fe.j.endCode })).status, 200);
  const done = await call(fam, `/api/bookings/${id}`); assert.equal(done.j.status, "completed"); assert.equal(done.j.logs[0].note, "Walked 10 minutes");
  assert.equal((await call(fam, `/api/bookings/${id}/action`, { action: "rate", areas: { punctuality: 5, quality: 5, kindness: 5, hygiene: 5, communication: 5 }, tags: ["On time"] })).status, 200);
  assert.equal((await call(fam, `/api/bookings/${id}`)).j.status, "closed");
});

test("decline cascades to a same tier caregiver, family approves", async () => {
  const list = (await call(null, "/api/caregivers?type=day&tier=2")).j;
  const sunita = list.find((c: any) => c.display_name === "Sunita Pawar");
  const b = await call(fam, "/api/bookings", { recipientId: rid, caregiverId: sunita.id, careType: "day", days: 7, startDate: tomorrow(), startTime: "09:00", method: "Card", careNeed: "companionship", homeCommitments: ["toilet", "water", "belongings", "household", "infection", "cameras", "scope"] });
  assert.equal(b.status, 200, JSON.stringify(b.j)); const id = b.j.id; const cg = await login("+919000000001");
  assert.equal((await call(cg, `/api/bookings/${id}/action`, { action: "decline", reason: "Not available" })).status, 200);
  const p = await call(fam, `/api/bookings/${id}`); assert.equal(p.j.status, "proposal"); assert.equal(p.j.proposal.tier, 2);
  assert.equal((await call(fam, `/api/bookings/${id}/action`, { action: "approve" })).status, 200);
  const o = await call(fam, `/api/bookings/${id}`); assert.equal(o.j.status, "offered"); assert.notEqual(o.j.caregiver.id, sunita.id);
  // cancelling before acceptance is free
  const qt = await call(fam, `/api/bookings/${id}/quote`); assert.equal(qt.j.feePaise, 0);
  assert.equal((await call(fam, `/api/bookings/${id}/action`, { action: "cancel" })).status, 200);
  assert.equal((await call(fam, `/api/bookings/${id}`)).j.status, "cancelled");
});

test("another family cannot see the booking", async () => {
  fam2 = await login("+91" + "8" + rnd());
  const mine = await call(fam, "/api/bookings");
  assert.equal((await call(fam2, `/api/bookings/${mine.j[0].id}`)).status, 404);
  assert.equal((await call(fam2, `/api/recipients/${rid}/health`)).status, 403);
});

test("senior signs in and checks in; family sees it", async () => {
  const s = await login(seniorPhone, { role: "senior" }); // the parent agrees to the family link before anything is shared
  for (const r of (await call(s, "/api/senior/links")).j) await call(s, "/api/senior/links", { id: r.id, accept: true });
  const home = await call(s, "/api/senior"); assert.equal(home.j.linked, true); assert.equal(home.j.checkedInToday, false);
  assert.equal((await call(s, "/api/checkins", { status: "ok" })).status, 200);
  assert.equal((await call(s, "/api/senior")).j.checkedInToday, true);
  const r = await call(fam, "/api/recipients"); assert.equal(r.j[0].last_checkin.status, "ok");
});

test("wrong OTP is rejected and limited", async () => {
  const phone = "+91" + "8" + rnd();
  await call(null, "/api/auth/request", { phone });
  for (let i = 0; i < 5; i++) assert.equal((await call(null, "/api/auth/verify", { phone, code: "000000", client: "app" })).status, OTP === "000000" ? 200 : 401);
  assert.equal((await call(null, "/api/auth/verify", { phone, code: OTP, client: "app" })).status, 429);
});

test("cron requires secret", async () => {
  assert.equal((await fetch(BASE + "/api/cron", { method: "POST" })).status, 403);
});
