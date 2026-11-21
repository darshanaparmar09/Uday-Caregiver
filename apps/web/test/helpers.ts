// Shared helpers for API tests (copied from hardening.test.ts so older suites stay unchanged).
import assert from "node:assert/strict";
import pg from "pg";
const BASE = process.env.BASE_URL ?? "http://localhost:3000"; const OTP = process.env.OTP_DEV_CODE ?? "123456";
export async function call(t: string | null, path: string, body?: unknown, method?: string, headers: Record<string, string> = {}) {
  const r = await fetch(BASE + path, { method: method ?? (body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...headers, ...(t ? { Authorization: "Bearer " + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: (await r.json().catch(() => ({}))) as any, r };
}
export async function login(phone: string, extra: object = {}) { await call(null, "/api/auth/request", { phone }); const r = await call(null, "/api/auth/verify", { phone, code: OTP, client: "app", ...extra }); assert.equal(r.status, 200, JSON.stringify(r.j)); return r.j.token as string; }
export const rnd = () => String(Math.floor(1e7 + Math.random() * 9e7));
export const cron = (job = "") => call(null, "/api/cron" + job, {}, "POST", { "x-cron-secret": process.env.CRON_SECRET ?? "" });
export const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
export const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const ANS: Record<string, number[]> = { "t1-dignity": [1, 0, 1], "t1-falls": [1, 1, 0], "t1-safety": [1, 0, 1], "t2-transfers": [0, 1, 0], "t2-dementia": [1, 0, 1], "t3-medication": [1, 0, 0] };
const LIVE_HC = ["toilet", "water", "belongings", "household", "infection", "cameras", "scope", "meals", "bath", "sleep", "breaks", "day_off"];
export const DAY_HC = ["toilet", "water", "belongings", "household", "infection", "cameras", "scope"];
export const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

/** A brand new caregiver taken through the whole onboarding, so her calendar is empty. */
export async function newCaregiver(name: string, tier: number, careTypes: string[]) {
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
export async function family() {
  const fam = await login("+9195" + rnd().slice(0, 8)); const seniorPhone = "+9174" + rnd().slice(0, 8);
  const r = await call(fam, "/api/recipients", { name: "Shanta Kulkarni", address: "9 Prabhat Road, Pune", locality: "Prabhat Road", hospital: "Deenanath", hasPhone: true, phone: seniorPhone,
    emergencyContacts: [{ name: "Neha", relation: "Daughter", phone: "+14155550199", city: "Austin" }, { name: "Amit", relation: "Nephew", phone: "9822099999", city: "Pune", isLocal: true }],
    consent: { onBehalf: true, shareWithCaregiver: { allergies: true, medicines: true, conditions: true } } });
  assert.equal(r.status, 200);
  return { fam, rid: r.j.id as string, seniorPhone };
}
export const act = (t: string, id: string, body: object, headers: Record<string, string> = {}) => call(t, `/api/bookings/${id}/action`, body, "POST", headers);
export async function linkedSenior(seniorPhone: string) { const s = await login(seniorPhone, { role: "senior" }); for (const r of (await call(s, "/api/senior/links")).j) await call(s, "/api/senior/links", { id: r.id, accept: true }); return s; }
export const BASE_URL = BASE;
