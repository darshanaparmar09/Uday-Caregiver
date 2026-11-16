// Completing the family web app and the Uday app: invites, documents, ID check, chat, calls, location,
// invoice PDF, coupons and Uday Plus, companion, leads, phone call check in, caregiver calendar.
import { test } from "node:test";
import assert from "node:assert/strict";
const BASE = process.env.BASE_URL ?? "http://localhost:3000"; const OTP = process.env.OTP_DEV_CODE ?? "123456";
async function call(t: string | null, path: string, body?: unknown, method?: string, headers: Record<string, string> = {}) {
  const r = await fetch(BASE + path, { method: method ?? (body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...headers, ...(t ? { Authorization: "Bearer " + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get("content-type") ?? ""; return { status: r.status, j: ct.includes("json") ? ((await r.json().catch(() => ({}))) as any) : null, r };
}
async function login(phone: string, extra: object = {}) { await call(null, "/api/auth/request", { phone }); const r = await call(null, "/api/auth/verify", { phone, code: OTP, client: "app", ...extra }); assert.equal(r.status, 200, JSON.stringify(r.j)); return r.j.token as string; }
const rnd = () => String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);
const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const DAY_HC = ["toilet", "water", "belongings", "household", "infection", "cameras", "scope"];
async function family(seniorPhone?: string) {
  const phone = "+9193" + rnd(); const fam = await login(phone);
  const r = await call(fam, "/api/recipients", { name: "Vasant Gokhale", address: "5 Model Colony, Pune", locality: "Model Colony", hospital: "Joshi Hospital", hasPhone: !!seniorPhone, phone: seniorPhone,
    emergencyContacts: [{ name: "Ketan", relation: "Son", phone: "+16175550111", city: "Boston" }, { name: "Smita", relation: "Neighbour", phone: "9822088888", city: "Pune", isLocal: true }],
    consent: { onBehalf: true, shareWithCaregiver: { allergies: true, medicines: true, conditions: true } } });
  assert.equal(r.status, 200); return { fam, phone, rid: r.j.id as string };
}

test("family invites: owner invites by phone, invitee accepts, roles enforced, owner removes", async () => {
  const { fam, rid } = await family();
  const sisterPhone = "+9192" + rnd(); const viewerPhone = "+9191" + rnd();
  assert.equal((await call(fam, `/api/recipients/${rid}/members`, { action: "invite", phone: sisterPhone, role: "care_manager", name: "Anjali" })).status, 200);
  assert.equal((await call(fam, `/api/recipients/${rid}/members`, { action: "invite", phone: sisterPhone, role: "viewer" })).status, 400, "already invited");
  const sis = await login(sisterPhone);
  assert.equal((await call(sis, `/api/recipients/${rid}`)).status === 200, false, "no access before accepting");
  const inv = (await call(sis, "/api/invites")).j; assert.equal(inv.length, 1); assert.equal(inv[0].senior, "Vasant Gokhale");
  assert.equal((await call(sis, `/api/invites/${inv[0].id}`, { accept: true })).j.joined, true);
  const m = (await call(sis, `/api/recipients/${rid}/members`)).j; assert.equal(m.myRole, "care_manager"); assert.equal(m.members.length, 2);
  assert.equal((await call(sis, `/api/recipients/${rid}/members`, { action: "invite", phone: viewerPhone, role: "payer" })).status, 403, "care manager cannot add payers");
  assert.equal((await call(sis, `/api/recipients/${rid}/members`, { action: "invite", phone: viewerPhone, role: "viewer" })).status, 200);
  const sisId = m.members.find((x: any) => x.me).user_id;
  assert.equal((await call(sis, `/api/recipients/${rid}/members`, { action: "remove", userId: sisId })).status, 403, "only owner removes");
  assert.equal((await call(fam, `/api/recipients/${rid}/members`, { action: "remove", userId: sisId })).status, 200);
  assert.equal((await call(sis, `/api/recipients/${rid}/members`)).status, 403);
});

test("documents: upload encrypted, list, open, delete; ID check stores last 4 only", async () => {
  const { fam, rid } = await family();
  const d = await call(fam, `/api/recipients/${rid}/documents`, { kind: "prescription", title: "Dr Joshi prescription", docDate: day(-3), base64: PNG, mime: "image/png" }); assert.equal(d.status, 200);
  assert.equal((await call(fam, `/api/recipients/${rid}/documents`, { kind: "report", title: "Bad", base64: PNG, mime: "text/plain" })).status, 400);
  const list = (await call(fam, `/api/recipients/${rid}/documents`)).j; assert.equal(list.length, 1); assert.equal(list[0].title, "Dr Joshi prescription");
  const f = await fetch(`${BASE}/api/recipients/${rid}/documents/${d.j.id}`, { headers: { Authorization: "Bearer " + fam } });
  assert.equal(f.status, 200); assert.equal(f.headers.get("content-type"), "image/png"); assert.equal(Buffer.from(await f.arrayBuffer()).toString("base64"), PNG);
  const other = await login("+9190" + rnd()); assert.equal((await fetch(`${BASE}/api/recipients/${rid}/documents/${d.j.id}`, { headers: { Authorization: "Bearer " + other } })).status, 403);
  assert.equal((await call(fam, `/api/recipients/${rid}/documents/${d.j.id}`, undefined, "DELETE")).status, 200);
  assert.equal((await call(fam, "/api/profile/kyc", { aadhaar: "2345 6789 0123", consent: false })).status, 400);
  assert.deepEqual((await call(fam, "/api/profile/kyc", { aadhaar: "2345 6789 0123", consent: true })).j, { result: "clear", last4: "0123" });
  const me = (await call(fam, "/api/me")).j.user; assert.equal(me.kyc_status, "clear"); assert.equal(me.aadhaar_last4, "0123"); assert.equal(JSON.stringify(me).includes("234567890123"), false);
});

test("booking: Plus and coupon discount the fee only; chat blocks numbers; masked call; live location; invoice PDF; calendar", async () => {
  const { fam, rid } = await family();
  const cg = (await call(null, "/api/caregivers?type=day&tier=1")).j.find((c: any) => c.display_name === "Shobha Kulkarni");
  const ops = await login("+919000000099"); const code = "WELCOME" + rnd().slice(0, 4);
  assert.equal((await call(ops, "/api/ops/family", { action: "coupon", code, feeDiscountBps: 5000, maxUses: 100 })).status, 200);
  const chk = (await call(fam, "/api/coupons/check", { code, ratePaise: cg.rate_day_paise, days: 1 })).j; assert.equal(chk.bps, 5000); assert.ok(chk.savingPaise > 0);
  assert.equal((await call(fam, "/api/plus", { action: "join" })).j.member, true);
  const plusOnly = (await call(fam, "/api/coupons/check", { code: "", ratePaise: cg.rate_day_paise, days: 1 })).status;
  const b = await call(fam, "/api/bookings", { recipientId: rid, caregiverId: cg.id, careType: "day", days: 1, startDate: day(60 + Math.floor(Math.random() * 900)), startTime: "09:00", method: "UPI", careNeed: "companionship", homeCommitments: DAY_HC, coupon: code });
  assert.equal(b.status, 200, JSON.stringify(b.j)); const id = b.j.id;
  assert.equal(b.j.care_paise, cg.rate_day_paise, "caregiver pay unchanged"); assert.equal(b.j.fee_discount_bps, 5000, "coupon beats Plus (20%)");
  assert.equal(b.j.platform_paise, Math.round(cg.rate_day_paise * 0.08 * 0.5));
  assert.equal((await call(fam, "/api/coupons/check", { code, ratePaise: cg.rate_day_paise, days: 1 })).status, 400, "one use per family");
  // chat opens after acceptance
  const t = await login("+919000000005");
  assert.equal((await call(fam, `/api/bookings/${id}/messages`, { body: "Hello" })).status, 400);
  await call(t, `/api/bookings/${id}/action`, { action: "accept" });
  assert.equal((await call(fam, `/api/bookings/${id}/messages`, { body: "Please call me on 98220 12345" })).status, 400, "no numbers");
  assert.equal((await call(fam, `/api/bookings/${id}/messages`, { body: "Papa likes tea at 4 pm." })).status, 200);
  assert.equal((await call(t, `/api/bookings/${id}/messages`, { body: "Noted, thank you." })).status, 200);
  const msgs = (await call(fam, `/api/bookings/${id}/messages`)).j.messages; assert.deepEqual(msgs.map((x: any) => [x.from, x.mine]), [["family", true], ["caregiver", false]]);
  assert.equal((await call(fam, `/api/bookings/${id}/call`, {})).j.status, "simulated");
  // live location only while travelling
  assert.equal((await call(t, `/api/bookings/${id}/location`, { lat: 18.53, lng: 73.84 })).status, 400);
  await call(t, `/api/bookings/${id}/action`, { action: "enroute" });
  assert.equal((await call(t, `/api/bookings/${id}/location`, { lat: 18.53, lng: 73.84 })).status, 200);
  const loc = (await call(fam, `/api/bookings/${id}/location`)).j; assert.equal(loc.sharing, true); assert.equal(loc.location.lat, 18.53);
  // invoice PDF
  const pdf = await fetch(`${BASE}/api/bookings/${id}/invoice`, { headers: { Authorization: "Bearer " + fam } });
  assert.equal(pdf.headers.get("content-type"), "application/pdf"); assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
  // Plus: free cancellation even late
  const c = await call(fam, `/api/bookings/${id}/action`, { action: "cancel" }); assert.equal(c.status, 200);
  assert.equal((await call(fam, `/api/bookings/${id}`)).j.cancelFeePaise, 0);
  const p = (await call(null, `/api/caregivers/${cg.id}`)).j; assert.ok(Array.isArray(p.busyDates)); assert.ok(p.calendarFrom);
  assert.ok(plusOnly === 200 || plusOnly === 400);
});

test("senior: companion replies, crisis words alert the family; leads; phone call check in through the voice callback", async () => {
  const seniorPhone = "+9173" + rnd(); const { fam, rid } = await family(seniorPhone);
  const s = await login(seniorPhone, { role: "senior" });
  const r1 = (await call(s, "/api/senior/companion", { message: "Good morning, I made poha today" })).j; assert.equal(r1.crisis, false); assert.ok(r1.reply.length > 5);
  const r2 = (await call(s, "/api/senior/companion", { message: "I have chest pain" })).j; assert.equal(r2.crisis, true); assert.match(r2.reply, /SOS|112/);
  assert.equal((await call(s, "/api/senior/companion")).j.length, 4);
  assert.equal((await call(fam, "/api/senior/companion")).status, 403, "family cannot read the conversation");
  assert.equal((await call(s, "/api/leads", { kind: "insurance", note: "Health cover over 70" })).status, 200);
  const ops = await login("+919000000099"); assert.ok((await call(ops, "/api/ops/family")).j.leads.some((l: any) => l.kind === "insurance"));
  // phone call check in
  assert.equal((await call(fam, `/api/recipients/${rid}/checkin-mode`, { mode: "call" })).status, 400, "number needed");
  assert.equal((await call(fam, `/api/recipients/${rid}/checkin-mode`, { mode: "call", phone: "020 2553 1234" })).status, 200);
  const pg = (await import("pg")).default; const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  await db.query("UPDATE care_recipients SET checkin_by='00:00' WHERE id=$1", [rid]);
  await call(null, "/api/cron", {}, "POST", { "x-cron-secret": process.env.CRON_SECRET ?? "" });
  const ivr = (await db.query("SELECT id FROM ivr_calls WHERE care_recipient_id=$1", [rid])).rows; assert.equal(ivr.length, 1, "one call placed");
  assert.equal((await call(null, `/api/ivr/checkin?token=wrong&call=${ivr[0].id}&digits=1`)).status, 403);
  assert.equal((await call(null, `/api/ivr/checkin?token=${process.env.IVR_TOKEN}&CustomField=${ivr[0].id}&digits=2`)).j.status, "help");
  assert.equal((await call(fam, "/api/recipients")).j.find((x: any) => x.id === rid).last_checkin.status, "help");
  await db.end();
});
