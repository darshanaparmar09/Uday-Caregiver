// Caregiver app end to end: application to activation, academy, availability, leave, shift, payout, ratings, push.
import { test } from "node:test";
import assert from "node:assert/strict";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OTP = process.env.OTP_DEV_CODE ?? "123456";
async function call(t: string | null, path: string, body?: unknown, method?: string) {
  const r = await fetch(BASE + path, { method: method ?? (body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: (await r.json().catch(() => ({}))) as any };
}
async function login(phone: string, extra: object = {}) { await call(null, "/api/auth/request", { phone }); const r = await call(null, "/api/auth/verify", { phone, code: OTP, client: "app", ...extra }); assert.equal(r.status, 200, JSON.stringify(r.j)); return r.j.token as string; }
const day = (n: number) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const cgPhone = "+9170" + String(Date.now()).slice(-8);
let ops: string, cg: string, cgId: string, fam: string, rid: string;

test("ops converts a Careers application; caregiver signs in to onboarding", async () => {
  assert.equal((await call(null, "/api/applications", { name: "Meena Kale", phone: cgPhone, area: "Kothrud", experience: "Attendant, 1 to 3 years" })).status, 200);
  ops = await login("+919000000099");
  const qs = await call(ops, "/api/ops/queues"); const app = qs.j.applications.find((a: any) => a.name === "Meena Kale");
  const conv = await call(ops, `/api/ops/applications/${app.id}`, { tier: 1 }); assert.equal(conv.status, 200); cgId = conv.j.caregiverId;
  cg = await login(cgPhone);
  const o = await call(cg, "/api/caregiver/onboarding"); assert.equal(o.j.status, "verifying");
  assert.equal(o.j.stages.find((s: any) => s.n === 1).status, "clear"); assert.equal(o.j.stages.find((s: any) => s.n === 3).status, "clear");
});

test("caregiver completes own steps: profile, identity, documents, contract, bank", async () => {
  assert.equal((await call(cg, "/api/caregiver/profile", { languages: ["Marathi"], serviceAreas: ["Kothrud"], careTypes: ["day"], skills: ["Meals"] }, "PUT")).status, 200);
  assert.equal((await call(cg, "/api/caregiver/identity", { aadhaar: "234567890123", pan: "BAD" })).status, 422);
  const id = await call(cg, "/api/caregiver/identity", { aadhaar: "2345 6789 0123", pan: "ABCDE1234F" }); assert.equal(id.j.result, "clear"); assert.equal(id.j.last4, "0123");
  assert.equal((await call(cg, "/api/caregiver/documents", { kind: "certificate", base64: PNG, mime: "image/png" })).j.stage, 8);
  assert.equal((await call(cg, "/api/caregiver/documents", { kind: "fitness", base64: PNG, mime: "text/plain" })).status, 400);
  assert.equal((await call(cg, "/api/caregiver/documents", { kind: "fitness", base64: PNG, mime: "image/png" })).j.stage, 9);
  assert.equal((await call(cg, "/api/caregiver/contract", { signedName: "Meena Kale" })).status, 200);
  assert.equal((await call(cg, "/api/caregiver/bank", { accountNumber: "123", ifsc: "SBIN0001234", holder: "Meena Kale" })).status, 400);
  assert.equal((await call(cg, "/api/caregiver/bank", { accountNumber: "123456789012", ifsc: "sbin0001234", holder: "Meena Kale" })).j.last4, "9012");
  const o = await call(cg, "/api/caregiver/onboarding");
  const st = Object.fromEntries(o.j.stages.map((s: any) => [s.n, s.status]));
  assert.deepEqual([st[4], st[5], st[8], st[9], st[11], st[12]], ["clear", "clear", "submitted", "submitted", "clear", "clear"]);
});

test("academy: fail then pass Tier 1 modules submits stage 10", async () => {
  const a = await call(cg, "/api/academy"); assert.ok(a.j.modules.length >= 3); assert.equal(a.j.modules[0].quiz[0].answer, undefined, "answers never sent to the app");
  assert.equal((await call(cg, "/api/academy/t1-dignity", { answers: [0, 1, 0] })).j.passed, false);
  for (const [m, ans] of [["t1-dignity", [1, 0, 1]], ["t1-falls", [1, 1, 0]], ["t1-safety", [1, 0, 1]]] as const) assert.equal((await call(cg, `/api/academy/${m}`, { answers: ans })).j.passed, true);
  const o = await call(cg, "/api/caregiver/onboarding"); assert.equal(o.j.stages.find((s: any) => s.n === 10).status, "submitted");
});

test("ops clears Uday stages, caregiver becomes active with police tick (result only)", async () => {
  assert.equal((await call(ops, `/api/ops/caregivers/${cgId}/stage`, { stage: 5, status: "clear" })).status, 400, "ops cannot clear caregiver steps");
  for (const s of [2, 6, 7, 8, 9, 10, 13, 14]) assert.equal((await call(ops, `/api/ops/caregivers/${cgId}/stage`, { stage: s, status: "clear", note: s === 7 ? "PV-REF-001" : undefined })).status, 200);
  const o = await call(cg, "/api/caregiver/onboarding"); assert.equal(o.j.status, "active"); assert.equal(o.j.stages.find((s: any) => s.n === 15).status, "clear");
  const list = await call(null, "/api/caregivers?type=day&tier=1"); const me = list.j.find((c: any) => c.id === cgId); assert.ok(me.police_verified);
});

test("availability: a day off blocks booking; leave approved by ops blocks days", async () => {
  fam = await login("+9188" + String(Date.now()).slice(-8));
  const r = await call(fam, "/api/recipients", { name: "Shalini", address: "C2 Lake View, Kothrud", locality: "Kothrud", hospital: "Sahyadri", hasPhone: false, emergencyContacts: [{ name: "Ravi", relation: "Son", phone: "+447700900123", city: "London" }, { name: "Asha", relation: "Niece", phone: "9822011111", city: "Pune", isLocal: true }], consent: { onBehalf: true, shareWithCaregiver: { allergies: true, medicines: true, conditions: true } } });
  rid = r.j.id;
  assert.equal((await call(cg, "/api/caregiver/availability", { day: day(5), available: false }, "PUT")).status, 200);
  const blocked = await call(fam, "/api/bookings", { recipientId: rid, caregiverId: cgId, careType: "day", days: 1, startDate: day(5), startTime: "09:00", method: "UPI" });
  assert.equal(blocked.status, 400); assert.match(blocked.j.error, /not available/);
  const lv = await call(cg, "/api/caregiver/leave", { from: day(10), to: day(11), reason: "Family function" }); assert.equal(lv.status, 200);
  assert.equal((await call(ops, `/api/ops/leave/${lv.j.id}`, { approve: true })).status, 200);
  const av = await call(cg, "/api/caregiver/availability"); assert.ok(av.j.off.some((o: any) => o.day === day(10) && o.reason === "leave"));
  assert.equal((await call(cg, "/api/caregiver/availability", { day: day(5), available: true }, "PUT")).status, 200);
});

test("shift, weekly payout and earnings", async () => {
  const b = await call(fam, "/api/bookings", { recipientId: rid, caregiverId: cgId, careType: "day", days: 1, startDate: day(2), startTime: "09:00", method: "Card" });
  assert.equal(b.status, 200, JSON.stringify(b.j)); const id = b.j.id;
  for (const a of [{ action: "accept" }, { action: "enroute" }, { action: "arrive" }]) assert.equal((await call(cg, `/api/bookings/${id}/action`, a)).status, 200);
  assert.equal((await call(cg, "/api/caregiver/availability", { day: day(2), available: false }, "PUT")).status, 400, "cannot mark a booked day off");
  await call(cg, `/api/bookings/${id}/action`, { action: "start", code: (await call(fam, `/api/bookings/${id}`)).j.startCode });
  await call(cg, `/api/bookings/${id}/action`, { action: "log", meal: true, meds: false, mood: "Calm" });
  assert.equal((await call(cg, `/api/bookings/${id}/action`, { action: "end", code: (await call(fam, `/api/bookings/${id}`)).j.endCode })).status, 200);
  const e1 = await call(cg, "/api/caregiver/earnings"); assert.equal(e1.j.balancePaise, 85000); assert.equal(e1.j.thisWeek.shifts, 1);
  const run = await call(ops, "/api/ops/payouts", {}); assert.ok(run.j.paid >= 1);
  const e2 = await call(cg, "/api/caregiver/earnings"); assert.equal(e2.j.balancePaise, 0); assert.equal(e2.j.payouts[0].status, "paid"); assert.equal(e2.j.payouts[0].amount_paise, 85000);
  assert.equal((await call(fam, `/api/bookings/${id}/action`, { action: "rate", stars: 3, tags: ["Kind and patient"] })).status, 200);
  const rt = await call(cg, "/api/caregiver/ratings"); assert.equal(rt.j.count, 1); assert.equal(rt.j.belowStandard, true); assert.ok(rt.j.tips.length >= 1);
});

test("bank change holds payouts for 48 hours; push token registers", async () => {
  await call(cg, "/api/caregiver/bank", { accountNumber: "999988887777", ifsc: "HDFC0001234", holder: "Meena Kale" });
  const e = await call(cg, "/api/caregiver/earnings"); assert.equal(e.j.bankLast4, "7777");
  assert.equal((await call(cg, "/api/push", { token: "ExponentPushToken[test-123]", platform: "android" })).status, 200);
  assert.equal((await call(null, "/api/caregiver/earnings")).status, 401);
  assert.equal((await call(fam, "/api/caregiver/earnings")).status, 403);
});
