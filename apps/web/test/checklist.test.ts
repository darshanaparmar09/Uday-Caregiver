// Daily care checklist and vital signs on shift logs.
import { test } from "node:test";
import assert from "node:assert/strict";
const BASE = process.env.BASE_URL ?? "http://localhost:3000"; const OTP = process.env.OTP_DEV_CODE ?? "123456";
async function call(t: string | null, path: string, body?: unknown, method?: string) {
  const r = await fetch(BASE + path, { method: method ?? (body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: (await r.json().catch(() => ({}))) as any };
}
async function login(phone: string) { await call(null, "/api/auth/request", { phone }); return (await call(null, "/api/auth/verify", { phone, code: OTP, client: "app" })).j.token as string; }
// Jitter keeps reruns against the same database from clashing with earlier bookings.
const J = 100 + Math.floor(Math.random() * 3000);
const day = (n: number) => new Date(Date.now() + (n + J) * 86400e3).toISOString().slice(0, 10);

async function activeShift(cgName: string, cgPhone: string, tier: number, offset: number) {
  const fam = await login("+9187" + String(Date.now()).slice(-8));
  const r = await call(fam, "/api/recipients", { name: "Kamal", address: "D4 River Side, Aundh", locality: "Aundh", hospital: "Jupiter", hasPhone: false,
    emergencyContacts: [{ name: "Rohan", relation: "Son", phone: "+16505550100", city: "San Jose" }, { name: "Mira", relation: "Friend", phone: "9822044444", city: "Pune", isLocal: true }],
    consent: { onBehalf: true, shareWithCaregiver: { allergies: true, medicines: true, conditions: true } } });
  const cg = (await call(null, `/api/caregivers?type=day&tier=${tier}`)).j.find((c: any) => c.display_name === cgName);
  const b = await call(fam, "/api/bookings", { recipientId: r.j.id, caregiverId: cg.id, careType: "day", days: 1, startDate: day(offset), startTime: "09:00", method: "UPI", careNeed: "companionship", homeCommitments: ["toilet", "water", "belongings", "household", "infection", "cameras", "scope"] });
  assert.equal(b.status, 200, JSON.stringify(b.j));
  const t = await login(cgPhone);
  for (const a of [{ action: "accept" }, { action: "enroute" }, { action: "arrive" }]) assert.equal((await call(t, `/api/bookings/${b.j.id}/action`, a)).status, 200);
  await call(t, `/api/bookings/${b.j.id}/action`, { action: "start", code: (await call(fam, `/api/bookings/${b.j.id}`)).j.startCode });
  return { fam, t, id: b.j.id };
}

test("Tier 2: checklist saved, vitals refused, high pain alerts family", async () => {
  const { fam, t, id } = await activeShift("Ravi Shinde", "+919000000004", 2, 20);
  const view = await call(t, `/api/bookings/${id}`);
  const ids = view.j.checklistTemplate.flatMap((s: any) => s.items.map((i: any) => i.id));
  assert.ok(ids.includes("hygiene") && !ids.includes("vitals"), "Tier 2 template has no vitals");
  assert.equal((await call(t, `/api/bookings/${id}/action`, { action: "log", mood: "Calm", vitals: { bpSys: 120, bpDia: 80 } })).status, 400);
  const now = new Date().toISOString();
  assert.equal((await call(t, `/api/bookings/${id}/action`, { action: "log", mood: "Tired", checklist: { hygiene: now, breakfast: now, medication: now, bogus: now }, vitals: { pain: 8, appetite: "low" } })).status, 200);
  const f = await call(fam, `/api/bookings/${id}`); const l = f.j.logs.at(-1);
  assert.deepEqual(Object.keys(l.checklist).sort(), ["breakfast", "hygiene", "medication"]);
  assert.equal(l.meal, null, "a tick is not taken as a meal eaten"); assert.equal(l.meds, null, "a tick is not taken as medicines given"); assert.deepEqual(l.flags, ["Pain 8 of 10"]);
  assert.ok(f.j.events.some((e: any) => e.message.includes("outside the usual range")));
});

test("Tier 3: vital signs recorded; abnormal readings flagged", async () => {
  const { fam, t, id } = await activeShift("Mary D'Souza", "+919000000003", 3, 21);
  assert.ok((await call(t, `/api/bookings/${id}`)).j.checklistTemplate.some((s: any) => s.items.some((i: any) => i.id === "vitals")));
  assert.equal((await call(t, `/api/bookings/${id}/action`, { action: "log", mood: "Calm", checklist: { vitals: new Date().toISOString() }, vitals: { bpSys: 168, bpDia: 92, pulse: 88, tempC: 37.1, pain: 2 } })).status, 200);
  const l = (await call(fam, `/api/bookings/${id}`)).j.logs.at(-1);
  assert.equal(l.vitals.bpSys, 168); assert.deepEqual(l.flags, ["Blood pressure 168/92"]);
});
