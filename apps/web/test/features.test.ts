// Care needs, home commitments, rehire rating gate, care facilities, readings and wearables.
import { test } from "node:test";
import assert from "node:assert/strict";
const BASE = process.env.BASE_URL ?? "http://localhost:3000"; const OTP = process.env.OTP_DEV_CODE ?? "123456";
async function call(t: string | null, path: string, body?: unknown, method?: string) {
  const r = await fetch(BASE + path, { method: method ?? (body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: (await r.json().catch(() => ({}))) as any };
}
async function login(phone: string) { await call(null, "/api/auth/request", { phone }); return (await call(null, "/api/auth/verify", { phone, code: OTP, client: "app" })).j.token as string; }
const J = 100 + Math.floor(Math.random() * 3000);
const day = (n: number) => new Date(Date.now() + (n + J) * 86400e3).toISOString().slice(0, 10);
const uniq = (p: string) => p + String(Date.now()).slice(-8);
const DAY_HC = ["toilet", "water", "belongings", "household", "infection", "cameras", "scope"];
const LIVE_HC = [...DAY_HC, "meals", "bath", "sleep", "breaks", "day_off"];
const AREAS = (n: number) => ({ punctuality: n, quality: n, kindness: n, hygiene: n, communication: n });

async function family() {
  const fam = await login(uniq("+9186"));
  const r = await call(fam, "/api/recipients", { name: "Vimal", address: "C2 Lake View, Pashan", locality: "Pashan", hospital: "Sahyadri", hasPhone: false,
    emergencyContacts: [{ name: "Neha", relation: "Daughter", phone: "+14155550100", city: "Austin" }, { name: "Raj", relation: "Neighbour", phone: "9822055555", city: "Pune", isLocal: true }],
    consent: { onBehalf: true, shareWithCaregiver: { allergies: false, medicines: false, conditions: false } } });
  assert.equal(r.status, 200, JSON.stringify(r.j)); return { fam, rid: r.j.id as string };
}

test("booking needs a care need and every home commitment", async () => {
  const { fam, rid } = await family();
  const cg = (await call(null, "/api/caregivers?type=live&tier=1")).j[0];
  const base = { recipientId: rid, caregiverId: cg.id, careType: "live", days: 7, startDate: day(40), startTime: "09:00", method: "UPI", dayOff: 0 };
  assert.equal((await call(fam, "/api/bookings", { ...base, careNeed: "nonsense", homeCommitments: LIVE_HC })).status, 400);
  assert.equal((await call(fam, "/api/bookings", { ...base, careNeed: "other", homeCommitments: LIVE_HC })).status, 400, "other needs a note");
  const miss = await call(fam, "/api/bookings", { ...base, careNeed: "post_op", homeCommitments: DAY_HC });
  assert.equal(miss.status, 400); assert.deepEqual(miss.j.missing.map((m: any) => m.id ?? m).sort(), ["bath", "breaks", "day_off", "meals", "sleep"]);
  const ok = await call(fam, "/api/bookings", { ...base, careNeed: "post_op", homeCommitments: LIVE_HC });
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
  const v = await call(fam, `/api/bookings/${ok.j.id}`);
  assert.equal(v.j.careNeed.id, "post_op"); assert.equal(v.j.homeCommitments.length, LIVE_HC.length);
  assert.equal((await call(fam, `/api/bookings/${ok.j.id}/action`, { action: "cancel" })).status, 200);
});

test("rehiring the same caregiver needs a rating first; overall is the average of five areas", async () => {
  const { fam, rid } = await family();
  const cg = (await call(null, "/api/caregivers?type=day&tier=1")).j.find((c: any) => c.display_name === "Shobha Kulkarni");
  const t = await login("+919000000005");
  const book = (d: number) => call(fam, "/api/bookings", { recipientId: rid, caregiverId: cg.id, careType: "day", days: 1, startDate: day(d), startTime: "09:00", method: "UPI", careNeed: "companionship", homeCommitments: DAY_HC });
  const b = await book(50); assert.equal(b.status, 200, JSON.stringify(b.j)); const id = b.j.id;
  for (const a of [{ action: "accept" }, { action: "enroute" }, { action: "arrive" }]) assert.equal((await call(t, `/api/bookings/${id}/action`, a)).status, 200);
  assert.equal((await call(t, `/api/bookings/${id}/action`, { action: "start", code: (await call(fam, `/api/bookings/${id}`)).j.startCode })).status, 200);
  assert.equal((await call(t, `/api/bookings/${id}/action`, { action: "log", mood: "Calm", meal: true })).status, 200);
  assert.equal((await call(t, `/api/bookings/${id}/action`, { action: "end", code: (await call(fam, `/api/bookings/${id}`)).j.endCode })).status, 200);
  const blocked = await book(52); assert.equal(blocked.status, 409); assert.equal(blocked.j.needsRating, id);
  assert.equal((await call(fam, `/api/bookings/${id}/action`, { action: "rate", areas: { punctuality: 5 } })).status, 400, "all five areas required");
  assert.equal((await call(fam, `/api/bookings/${id}/action`, { action: "rate", areas: { punctuality: 5, quality: 4, kindness: 5, hygiene: 4, communication: 3 } })).status, 200);
  assert.ok((await call(fam, `/api/bookings/${id}`)).j.events.some((e: any) => e.message.includes("4.2")));
  const again = await book(52); assert.equal(again.status, 200, JSON.stringify(again.j));
  await call(fam, `/api/bookings/${again.j.id}/action`, { action: "cancel" });
});

test("facility self onboarding: profile, recurring plan, ops approval, visit, review gate", async () => {
  const owner = await login(uniq("+9185"));
  const name = "Test Facility " + Date.now();
  const prof = { name, types: ["assisted_living", "memory_care"], locality: "Kharadi", city: "Pune", monthlyFrom: 45000, monthlyTo: 70000, dementiaUnit: true, petsAllowed: false, diets: ["Vegetarian"], activities: ["Yoga"] };
  assert.equal((await call(owner, "/api/partner/facility", prof, "PUT")).status, 200);
  assert.equal((await call(owner, "/api/partner/facility/subscribe", { plan: "listed" })).status, 400, "licence required");
  assert.equal((await call(owner, "/api/partner/facility", { ...prof, licenceNo: "MH/PUNE/123" }, "PUT")).status, 200);
  const sub = await call(owner, "/api/partner/facility/subscribe", { plan: "featured" }); assert.equal(sub.status, 200, JSON.stringify(sub.j));
  const mine = (await call(owner, "/api/partner/facility")).j; assert.equal(mine.facility.status, "review"); assert.equal(mine.subscription.amount_paise, 999900);
  const fid = mine.facility.id;
  assert.ok(!(await call(null, "/api/facilities")).j.some((f: any) => f.id === fid), "hidden until approved");
  const ops = await login("+919000000099");
  assert.ok((await call(ops, "/api/ops/queues")).j.facilities.some((f: any) => f.id === fid));
  assert.equal((await call(ops, `/api/ops/facilities/${fid}`, { status: "live", licenceVerified: true })).status, 200);
  const list = (await call(null, "/api/facilities?dementia=1")).j; assert.equal(list[0].plan, "featured", "featured first"); assert.ok(list.some((f: any) => f.id === fid));
  assert.equal((await call(null, `/api/facilities/${fid}`)).j.facility.owner_user_id, undefined);

  const { fam } = await family();
  assert.equal((await call(fam, `/api/facilities/${fid}/review`, { relation: "visited", areas: { care: 5, staff: 5, cleanliness: 5, activities: 5, value: 5 } })).status, 403, "no review before visit");
  assert.equal((await call(fam, `/api/facilities/${fid}/visit`, { preferredDate: new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 10) })).status, 200);
  assert.equal((await call(fam, `/api/facilities/${fid}/notes`, { answers: { "Staff.friendly": "good" } }, "PUT")).status, 200);
  const vid = (await call(owner, "/api/partner/facility")).j.visits[0].id;
  assert.equal((await call(owner, `/api/partner/visits/${vid}`, { status: "completed" })).status, 200);
  const prof2 = (await call(fam, `/api/facilities/${fid}`)).j; assert.equal(prof2.mine.canReview, true); assert.equal(prof2.mine.notes["Staff.friendly"], "good");
  assert.equal((await call(fam, `/api/facilities/${fid}/review`, { relation: "visited", areas: { care: 5, staff: 4, cleanliness: 4, activities: 3, value: 4 }, text: "Warm staff" })).status, 200);
  assert.equal((await call(fam, `/api/facilities/${fid}/review`, { relation: "visited", areas: { care: 1, staff: 1, cleanliness: 1, activities: 1, value: 1 } })).status, 409, "one review per family");
  const r = (await call(null, `/api/facilities/${fid}`)).j; assert.equal(Number(r.facility.rating.avg), 4); assert.equal(r.reviews[0].text, "Warm staff");
  assert.equal((await call(owner, "/api/partner/facility/cancel", {})).status, 200);
  assert.ok((await call(null, "/api/facilities")).j.some((f: any) => f.id === fid), "stays listed until the paid month ends");
});

test("readings: manual entry, device connect and ingest with dedupe", async () => {
  const { fam, rid } = await family();
  assert.equal((await call(fam, `/api/recipients/${rid}/readings`, { readings: [{ kind: "bp_sys", value: 400 }] })).status, 400, "range checked");
  assert.equal((await call(fam, `/api/recipients/${rid}/readings`, { readings: [{ kind: "bp_sys", value: 132 }, { kind: "bp_dia", value: 84 }] })).status, 200);
  assert.equal((await call(fam, "/api/devices/ingest", { device: "omron", recipientId: rid, readings: [{ kind: "pulse", value: 70, at: new Date().toISOString() }] })).status, 409, "connect first");
  const c = await call(fam, `/api/recipients/${rid}/devices`, { device: "omron" }); assert.equal(c.status, 200); assert.match(c.j.next, /Health/);
  const at = new Date(Date.now() - 3600e3).toISOString();
  const items = [{ kind: "bp_sys", value: 141, at }, { kind: "bp_dia", value: 90, at }, { kind: "pulse", value: 76, at }, { kind: "pulse", value: 999, at }];
  assert.equal((await call(fam, "/api/devices/ingest", { device: "omron", recipientId: rid, readings: items })).j.saved, 3, "invalid value skipped");
  assert.equal((await call(fam, "/api/devices/ingest", { device: "omron", recipientId: rid, readings: items })).j.saved, 0, "duplicates skipped");
  const rows = (await call(fam, `/api/recipients/${rid}/readings`)).j;
  assert.equal(rows.filter((x: any) => x.source === "device").length, 3); assert.equal(rows.filter((x: any) => x.source === "family").length, 2);
  const devs = (await call(fam, `/api/recipients/${rid}/devices`)).j; assert.equal(devs.length, 10); assert.equal(devs.find((d: any) => d.id === "omron").status, "connected");
  const stranger = await login(uniq("+9184")); assert.equal((await call(stranger, `/api/recipients/${rid}/readings`)).status, 403);
});
