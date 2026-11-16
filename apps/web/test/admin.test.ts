// Admin module: provider connections, business and GST details, partners from Excel, auto pay for weekly care.
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
import JSZip from "jszip";
/** Adds rows to the downloaded template. (exceljs cannot load under the test runner's TypeScript loader, so the sheet XML is edited directly.) */
async function fillTemplate(xlsx: ArrayBuffer, rows: string[][]) {
  const zip = await JSZip.loadAsync(xlsx); const path = "xl/worksheets/sheet1.xml"; let xml = await zip.file(path)!.async("string");
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const col = (i: number) => String.fromCharCode(65 + i);
  const extra = rows.map((r, k) => { const n = 3 + k; return `<row r="${n}">${r.map((v, i) => v ? `<c r="${col(i)}${n}" t="inlineStr"><is><t>${esc(v)}</t></is></c>` : "").join("")}</row>`; }).join("");
  xml = xml.replace(/<row r="(\d+)"[^>]*\/>|<row r="([3-9]|\d{2,})"[^>]*>[\s\S]*?<\/row>/g, "").replace("</sheetData>", extra + "</sheetData>");
  zip.file(path, xml); return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}
const view = async (t: string, id: string) => (await call(t, `/api/bookings/${id}`)).j;

test("settings: only ops; secrets masked and kept; required fields; option checks; video test", async () => {
  const ops = await login("+919000000099"); const { fam } = await family();
  assert.equal((await call(fam, "/api/ops/settings")).status, 403);
  let s = (await call(ops, "/api/ops/settings")).j;
  for (const k of ["msg91", "twilio", "meta_whatsapp", "routing", "exotel", "razorpay", "kyc", "video", "anthropic"]) assert.ok(s.integrations.find((x: any) => x.key === k), k);
  // switching on without the required fields is refused, and saves nothing
  assert.equal((await call(ops, "/api/ops/settings/integrations/exotel", { enabled: true, values: { sid: "uday1" } }, "PUT")).status, 422);
  // saved switched off: the secret comes back masked, and an empty field keeps it
  const r = await call(ops, "/api/ops/settings/integrations/exotel", { enabled: false, values: { sid: "uday1", apiKey: "k1", apiToken: "tok-SECRET-9876", callerId: "02071234567", subdomain: "api.in.exotel.com" } }, "PUT");
  assert.equal(r.status, 200, JSON.stringify(r.j)); assert.equal(r.j.values.apiToken, "••••9876"); assert.ok(!JSON.stringify(r.j).includes("tok-SECRET"));
  await call(ops, "/api/ops/settings/integrations/exotel", { enabled: false, values: { sid: "uday1", apiKey: "k1", apiToken: "", callerId: "02071234567" } }, "PUT");
  const row = await db.query("SELECT config_enc FROM integrations WHERE key='exotel'"); assert.ok(!row.rows[0].config_enc.includes("tok-SECRET"), "stored encrypted");
  s = (await call(ops, "/api/ops/settings")).j; assert.equal(s.integrations.find((x: any) => x.key === "exotel").values.apiToken, "••••9876", "blank kept the saved token");
  assert.equal((await call(ops, "/api/ops/settings/integrations/routing", { enabled: false, values: { sms: "carrier-pigeon" } }, "PUT")).status, 422);
  assert.equal((await call(ops, "/api/ops/settings/integrations/nope", { enabled: false, values: {} }, "PUT")).status, 404);
  // video needs no account: Jitsi links
  await call(ops, "/api/ops/settings/integrations/video", { enabled: true, values: { provider: "jitsi" } }, "PUT");
  const v = await call(ops, "/api/ops/settings/integrations/video/test", {}); assert.equal(v.j.ok, true, JSON.stringify(v.j)); assert.match(v.j.detail, /meet\.jit\.si\/uday-/);
  const a = await db.query("SELECT count(*)::int AS n FROM audit_log WHERE entity='integration' AND entity_id='exotel'"); assert.ok(a.rows[0].n >= 2, "changes are recorded");
});

test("business details: GSTIN format and check character, state must match, PAN read from GSTIN", async () => {
  const ops = await login("+919000000099");
  const base = { brandName: "Uday", legalName: "Uday Care Services Private Limited", stateCode: "27", address: "Sopanbaug, Pune", city: "Pune", pincode: "411001", sacCode: "998599", gstRatePct: 18, invoicePrefix: "INV" };
  assert.equal((await call(ops, "/api/ops/settings/business", { ...base, gstin: "27AAPFU0939F1Z" }, "PUT")).status, 422, "too short");
  assert.equal((await call(ops, "/api/ops/settings/business", { ...base, gstin: "27AAPFU0939F1ZX" }, "PUT")).status, 422, "wrong check character");
  assert.equal((await call(ops, "/api/ops/settings/business", { ...base, gstin: "29AAGCB7383J1Z4" }, "PUT")).status, 422, "Karnataka GSTIN with Maharashtra chosen");
  const ok = await call(ops, "/api/ops/settings/business", { ...base, gstin: "27aapfu0939f1zv" }, "PUT"); assert.equal(ok.status, 200, JSON.stringify(ok.j));
  assert.equal(ok.j.gstin, "27AAPFU0939F1ZV"); assert.equal(ok.j.pan, "AAPFU0939F"); assert.equal(ok.j.state, "Maharashtra"); assert.equal(ok.j.gstRatePct, 18);
  // back to no GSTIN so other tests see draft invoices
  assert.equal((await call(ops, "/api/ops/settings/business", { ...base, gstin: "" }, "PUT")).status, 200);
});

test("partners: template download, Excel check and import, lead matched to a partner, consent before sending", async () => {
  const ops = await login("+919000000099"); const tag = rnd().slice(0, 4);
  const tpl = await fetch(BASE + "/api/ops/partners/template", { headers: { Authorization: "Bearer " + ops } });
  assert.equal(tpl.status, 200); assert.match(tpl.headers.get("content-type") ?? "", /spreadsheetml/);
  const buf = await fillTemplate(await tpl.arrayBuffer(), [
    ["telehealth", `Pune Doctors ${tag}`, "Dr Joshi", "9822011111", "dr@example.in", "Pune", "All", "Doctor call back in 2 hours", "From ₹499", "https://example.in", "yes", "yes"],
    ["insurance", `Senior Shield ${tag}`, "Mr Rao", "", "", "", "", "Cover up to age 80", "", "", "no", ""],
    ["gym", "Bad Row", "", "", "", "", "", "", "", "", "", ""],
    ["tablet", `Bad Phone ${tag}`, "", "12", "", "", "", "", "", "", "", ""]]);
  const up = async (dry: boolean) => { const fd = new FormData(); fd.append("file", new Blob([buf]), "partners.xlsx");
    const r = await fetch(BASE + "/api/ops/partners/import" + (dry ? "?dryRun=1" : ""), { method: "POST", body: fd, headers: { Authorization: "Bearer " + ops } }); return { status: r.status, j: (await r.json()) as any }; };
  const dry = await up(true); assert.equal(dry.status, 200, JSON.stringify(dry.j));
  assert.equal(dry.j.added, 2); assert.equal(dry.j.problems.length, 2, JSON.stringify(dry.j.problems)); assert.match(dry.j.problems.join(" "), /Row \d+: Type/);
  assert.ok(!(await call(ops, "/api/ops/partners")).j.partners.some((p: any) => p.name === `Pune Doctors ${tag}`), "check saves nothing");
  const imp = await up(false); assert.equal(imp.j.added, 2);
  assert.equal((await up(false)).j.updated, 2, "uploading again updates, never duplicates");
  const list = (await call(ops, "/api/ops/partners")).j.partners; const doc = list.find((p: any) => p.name === `Pune Doctors ${tag}`);
  assert.equal(doc.phone, "+919822011111"); assert.equal(doc.share_leads, true); assert.equal(list.find((p: any) => p.name === `Senior Shield ${tag}`).city, "Pune");
  // a family asks for a doctor, agreeing to share details
  const { fam } = await family();
  const pub = (await call(fam, "/api/leads")).j; assert.ok(pub.some((p: any) => p.name === `Pune Doctors ${tag}`)); assert.ok(!("phone" in pub[0]), "families never see partner contact details");
  const l = await call(fam, "/api/leads", { kind: "telehealth", consent: true }); assert.equal(l.status, 200); assert.ok(l.j.partner);
  const leads = (await call(ops, "/api/ops/partners")).j.leads; const mine = leads.filter((x: any) => x.kind === "telehealth" && x.consent_share).pop();
  assert.equal((await call(ops, `/api/ops/leads/${mine.id}`, { action: "assign", partnerId: doc.id })).status, 200);
  assert.equal((await call(ops, `/api/ops/leads/${mine.id}`, { action: "send" })).status, 200);
  // without consent the lead cannot be sent
  const { fam: fam2 } = await family(); await call(fam2, "/api/leads", { kind: "telehealth" });
  const l2 = (await call(ops, "/api/ops/partners")).j.leads.filter((x: any) => x.kind === "telehealth" && !x.consent_share).pop();
  await call(ops, `/api/ops/leads/${l2.id}`, { action: "assign", partnerId: doc.id });
  assert.equal((await call(ops, `/api/ops/leads/${l2.id}`, { action: "send" })).status, 400);
  // hiding a partner removes it from what families see
  await call(ops, `/api/ops/partners/${doc.id}`, { active: false }, "PATCH");
  assert.ok(!(await call(fam, "/api/leads")).j.some((p: any) => p.id === doc.id));
});

test("auto pay: switch on, weekly charges use it, switch off; paying a week by hand", async () => {
  const cg = await newCaregiver("Asha Autopay" + rnd().slice(0, 3), 3, ["live"]);
  const { fam, rid } = await family();
  const b = await call(fam, "/api/bookings", { recipientId: rid, caregiverId: cg.id, careType: "live", days: 30, startDate: day(2), startTime: "09:00", method: "UPI", careNeed: "discharge", homeCommitments: LIVE_HC, dayOff: 0 });
  assert.equal(b.status, 200, JSON.stringify(b.j)); const id = b.j.id;
  assert.equal((await call(cg.t, `/api/bookings/${id}/action`, { action: "accept" })).status, 200);
  assert.equal((await call(fam, `/api/bookings/${id}/autopay`)).j.mandate, null);
  const on = await call(fam, `/api/bookings/${id}/autopay`, { method: "upi" }); assert.equal(on.status, 200, JSON.stringify(on.j)); assert.equal(on.j.active, true);
  assert.equal((await call(fam, `/api/bookings/${id}/autopay`, { method: "upi" })).status, 400, "already on");
  assert.equal((await call(fam, `/api/bookings/${id}/autopay`)).j.mandate.status, "active");
  // paying a week by hand: week 3 now
  const p3 = await call(fam, `/api/bookings/${id}/cycles/3`, {}); assert.equal(p3.status, 200, JSON.stringify(p3.j)); assert.equal(p3.j.paid, true);
  assert.equal((await call(fam, `/api/bookings/${id}/cycles/3`, {})).status, 400, "already paid");
  // the remaining weeks are charged on the mandate
  assert.equal((await cron(`?job=billing&booking=${id}`)).status, 200);
  const v = await view(fam, id); assert.ok(v.cycles.every((c: any) => c.status === "paid"), JSON.stringify(v.cycles.map((c: any) => c.status)));
  assert.equal(v.paidPaise, v.fees.totalPaise, "every week paid once");
  const ev = await db.query("SELECT message FROM booking_events WHERE booking_id=$1 AND message LIKE 'Auto pay%'", [id]); assert.equal(ev.rows.length, 1);
  assert.equal((await call(fam, `/api/bookings/${id}/autopay`, undefined, "DELETE")).status, 200);
  assert.equal((await call(fam, `/api/bookings/${id}/autopay`)).j.mandate.status, "cancelled");
  // someone else's booking
  const other = await family(); assert.equal((await call(other.fam, `/api/bookings/${id}/autopay`, { method: "upi" })).status, 404);
});
test.before(() => db.connect());
test.after(() => db.end().catch(() => {}));
