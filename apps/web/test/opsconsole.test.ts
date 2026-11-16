// Operations console: team roles, search, dispatch overrides, help desk, incidents, pricing, GST register, reconciliation, reports, audit.
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
const view = async (t: string, id: string) => (await call(t, `/api/bookings/${id}`)).j;
test.before(() => db.connect());
test.after(() => db.end().catch(() => {}));
const ADMIN = "+919000000099";
async function book(fam: string, rid: string, cgId: string, extra: object = {}) {
  const r = await call(fam, "/api/bookings", { recipientId: rid, caregiverId: cgId, careType: "day", days: 7, startDate: day(3), startTime: "09:00", method: "UPI", careNeed: "companionship", homeCommitments: DAY_HC, ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.j)); return r.j.id as string;
}

test("team roles: agents, finance and viewers are limited; at least one admin stays", async () => {
  const admin = await login(ADMIN); const tag = rnd().slice(0, 6);
  const me = (await call(admin, "/api/ops/me")).j; assert.equal(me.role, "admin");
  const ph = { agent: "+9188" + rnd().slice(0, 8), finance: "+9187" + rnd().slice(0, 8), viewer: "+9186" + rnd().slice(0, 8) };
  for (const [role, phone] of Object.entries(ph)) assert.equal((await call(admin, "/api/ops/team", { action: "add", phone, name: `Test ${role} ${tag}`, role })).status, 200);
  const fam = await family();
  assert.equal((await call(admin, "/api/ops/team", { action: "active", userId: me.id, active: false })).status, 400, "cannot switch yourself off");
  const agent = await login(ph.agent), finance = await login(ph.finance), viewer = await login(ph.viewer);
  assert.equal((await call(agent, "/api/ops/me")).j.role, "agent");
  assert.equal((await call(viewer, "/api/ops/dashboard")).status, 200, "viewer can look");
  assert.equal((await call(viewer, "/api/ops/tickets", { userId: me.id, category: "Test" })).status, 403, "viewer cannot change");
  assert.equal((await call(agent, "/api/ops/pricing", { platformFeePct: 8 }, "PUT")).status, 403, "agent cannot change pricing");
  assert.equal((await call(agent, "/api/ops/invoices")).status, 403, "agent cannot see the GST register");
  assert.equal((await call(finance, "/api/ops/invoices")).status, 200);
  assert.equal((await call(finance, "/api/ops/settings")).status, 403, "only admins open settings");
  assert.equal((await call(fam.fam, "/api/ops/dashboard")).status, 403, "families never");
  // switching someone off signs them out
  const t = (await call(admin, "/api/ops/team")).j.find((x: any) => x.name === `Test viewer ${tag}`);
  assert.equal((await call(admin, "/api/ops/team", { action: "active", userId: t.id, active: false })).status, 200);
  assert.equal((await call(viewer, "/api/ops/dashboard")).status, 401);
});

test("search, dispatch overrides: move to another caregiver, more time, release; cancel with full refund and a credit note", async () => {
  const admin = await login(ADMIN);
  const a = await newCaregiver("Ops Ana" + rnd().slice(0, 4), 1, ["day"]); const b = await newCaregiver("Ops Bina" + rnd().slice(0, 4), 1, ["day"]);
  const { fam, rid } = await family();
  const id = await book(fam, rid, a.id); const code = (await view(fam, id)).code;
  const s = (await call(admin, `/api/ops/search?q=${code}`)).j; assert.equal(s[0].href, `/ops/bookings/${id}`);
  assert.ok((await call(admin, `/api/ops/search?q=${encodeURIComponent(a.phone)}`)).j.some((x: any) => x.kind === "Caregiver"), "find by phone");
  let d = (await call(admin, `/api/ops/bookings/${id}`)).j; assert.ok(d.candidates.length > 0 && d.candidates.every((c: any) => c.id !== a.id), "free caregivers offered, never the current one");
  assert.equal((await call(admin, `/api/ops/bookings/${id}`, { action: "reassign", caregiverId: b.id, reason: "Family asked for Marathi" })).status, 200);
  d = (await call(admin, `/api/ops/bookings/${id}`)).j; assert.equal(d.booking.caregiver_id, b.id); assert.equal(d.booking.status, "offered");
  const exp = new Date(d.booking.offer_expires_at).getTime();
  await call(admin, `/api/ops/bookings/${id}`, { action: "extend_offer", minutes: 60 });
  assert.ok(new Date((await call(admin, `/api/ops/bookings/${id}`)).j.booking.offer_expires_at).getTime() >= exp + 59 * 60e3);
  assert.equal((await call(admin, `/api/ops/bookings/${id}`, { action: "note", body: "Called the daughter" })).status, 200);
  assert.equal((await view(fam, id)).events.some((e: any) => /Called the daughter/.test(e.message)), false, "notes stay internal");
  assert.equal((await call(admin, `/api/ops/bookings/${id}`, { action: "release", reason: "Family found help locally" })).status, 200);
  assert.equal((await view(fam, id)).status, "released");
  // a confirmed booking: invoice on acceptance, cancelled with full refund, credit note
  const id2 = await book(fam, rid, b.id);
  assert.equal((await call(b.t, `/api/bookings/${id2}/action`, { action: "accept" })).status, 200);
  const inv = await db.query("SELECT number, taxable_paise FROM invoices WHERE booking_id=$1 AND kind='invoice'", [id2]);
  assert.equal(inv.rows.length, 1); assert.match(inv.rows[0].number, /^[A-Z0-9]+\/\d{4}-\d{2}\/\d{5}$/);
  const c = await call(admin, `/api/ops/bookings/${id2}`, { action: "cancel", refund: "full", reason: "Caregiver unwell" });
  assert.equal(c.status, 200, JSON.stringify(c.j)); assert.equal(c.j.booking.status, "cancelled"); assert.equal(c.j.escrow, 0, "everything refunded");
  const cn = await db.query("SELECT number, taxable_paise FROM invoices WHERE booking_id=$1 AND kind='credit_note'", [id2]);
  assert.equal(cn.rows.length, 1); assert.equal(cn.rows[0].taxable_paise, inv.rows[0].taxable_paise, "the whole fee is credited back"); assert.match(cn.rows[0].number, /^CN\//);
  const pdf = await fetch(BASE + `/api/bookings/${id2}/invoice`, { headers: { Authorization: "Bearer " + admin } }); assert.equal(pdf.status, 200); assert.match(pdf.headers.get("content-type") ?? "", /pdf/);
  const au = (await call(admin, "/api/ops/audit?entity=booking")).j; assert.ok(au.some((x: any) => x.entity_id === id2 && x.action === "cancel"));
});

test("help desk: assign, internal note, reply to the family, resolve; SOS opens a critical incident", async () => {
  const admin = await login(ADMIN); const me = (await call(admin, "/api/ops/me")).j;
  const { fam, rid } = await family(); const famUser = (await call(fam, "/api/me")).j.user.id;
  const t = await call(admin, "/api/ops/tickets", { userId: famUser, category: "Billing question", text: "Why two charges?" }); assert.equal(t.status, 200);
  const id = t.j.id;
  assert.equal((await call(admin, `/api/ops/tickets/${id}`, { action: "note", body: "Checked Razorpay" })).status, 200);
  const r = await call(admin, `/api/ops/tickets/${id}`, { action: "reply", body: "One was a hold that is released." }); assert.equal(r.j.ticket.status, "waiting");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND template='ticket_reply'", [famUser])).rows[0].n, 1);
  const done = await call(admin, `/api/ops/tickets/${id}`, { action: "resolve", resolution: "Explained the hold." }); assert.equal(done.j.ticket.status, "resolved");
  assert.ok((await call(admin, "/api/ops/tickets?status=resolved")).j.some((x: any) => x.id === id));
  // SOS
  assert.equal((await call(fam, "/api/sos", {})).status, 200);
  const inc = (await call(admin, "/api/ops/incidents")).j.find((i: any) => i.severity === "critical" && /SOS/.test(i.summary) && Date.now() - new Date(i.opened_at).getTime() < 60e3);
  assert.ok(inc, "critical incident opened");
  const dash = (await call(admin, "/api/ops/dashboard")).j; const sos = dash.sos[0]; assert.ok(sos);
  assert.equal((await call(admin, `/api/ops/sos/${sos.id}`, { resolution: "Called her; she pressed it by mistake" })).status, 200);
  await call(admin, `/api/ops/incidents/${inc.id}`, { action: "owner", userId: me.id });
  const closed = await call(admin, `/api/ops/incidents/${inc.id}`, { action: "close", outcome: "False alarm, family reassured" }); assert.equal(closed.j.incident.status, "closed");
  void rid;
});

test("incidents: a serious one needs a caregiver action before closing; pausing moves her waiting requests", async () => {
  const admin = await login(ADMIN);
  const cg = await newCaregiver("Ops Chitra" + rnd().slice(0, 4), 1, ["day"]); await newCaregiver("Ops Deepa" + rnd().slice(0, 4), 1, ["day"]);
  const { fam, rid } = await family(); const id = await book(fam, rid, cg.id);
  const o = await call(admin, "/api/ops/incidents", { severity: "high", category: "conduct", summary: "Rude to the senior on the phone", bookingId: id }); assert.equal(o.status, 200);
  const iid = o.j.id;
  assert.equal((await call(admin, `/api/ops/incidents/${iid}`, { action: "close", outcome: "Spoke to both" })).status, 400);
  const p = await call(admin, `/api/ops/incidents/${iid}`, { action: "caregiver", caregiverAction: "paused", reason: "Until we speak to her" }); assert.equal(p.status, 200, JSON.stringify(p.j));
  assert.equal((await call(admin, `/api/ops/caregivers/${cg.id}`)).j.caregiver.status, "paused");
  assert.ok(["proposal", "released"].includes((await view(fam, id)).status), "her waiting request moved on");
  assert.equal((await call(admin, `/api/ops/incidents/${iid}`, { action: "close", outcome: "Coached; resumes next week" })).status, 200);
  assert.equal((await call(admin, `/api/ops/caregivers/${cg.id}`, { action: "status", status: "active", reason: "Coaching done" })).status, 200);
});

test("pricing, GST register, reconciliation and reports", async () => {
  const admin = await login(ADMIN);
  const p = (await call(admin, "/api/ops/pricing")).j; assert.ok(p.policy.platformFeePct >= 0); assert.equal(p.rates.length, 9);
  assert.equal((await call(admin, "/api/ops/pricing", { ...p.policy, platformFeePct: 50 }, "PUT")).status, 422, "fee above 30% refused");
  const { updatedAt, ...pol } = p.policy; assert.equal((await call(admin, "/api/ops/pricing", pol, "PUT")).status, 200);
  const r1 = p.rates.find((r: any) => r.tier === 1 && r.care_type === "day");
  assert.equal((await call(admin, "/api/ops/pricing/rates", { rates: [{ tier: 1, careType: "day", ratePaise: r1.rate_paise }], applyToCaregivers: false }, "PUT")).status, 200);
  const month = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7);
  const reg = (await call(admin, `/api/ops/invoices?month=${month}`)).j; assert.ok(reg.invoices >= 1); assert.ok("taxable_paise" in reg.summary);
  const csvR = await fetch(BASE + `/api/ops/invoices/csv?month=${month}`, { headers: { Authorization: "Bearer " + admin } }); assert.match(await csvR.text(), /Taxable value/);
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const rec = await call(admin, "/api/ops/reconcile", { from: today, to: today }); assert.equal(rec.status, 200, JSON.stringify(rec.j));
  assert.ok(Array.isArray(rec.j.issues)); assert.ok(rec.j.summary.collected >= 0); assert.match(rec.j.summary.gatewayNote, /Razorpay/);
  assert.equal((await call(admin, "/api/ops/reconcile", { from: today, to: "2020-01-01" })).status, 400);
  const rep = (await call(admin, `/api/ops/reports?from=${today}&to=${today}`)).j; assert.ok(rep.bookings.requested >= 1); assert.equal(rep.daily.length, 1);
  const rc = await fetch(BASE + `/api/ops/reports/csv?from=${today}&to=${today}`, { headers: { Authorization: "Bearer " + admin } }); assert.match(await rc.text(), /Uday operations report/);
  assert.equal((await call(admin, "/api/ops/payouts")).status, 200);
  assert.ok((await call(admin, "/api/ops/messages?channel=sms")).j.every((m: any) => m.channel === "sms"));
});
