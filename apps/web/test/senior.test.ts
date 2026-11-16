// Senior mode restored from the first builds: four check in moods, medicines, games, community, safety.
import { test } from "node:test";
import assert from "node:assert/strict";
const BASE = process.env.BASE_URL ?? "http://localhost:3000"; const OTP = process.env.OTP_DEV_CODE ?? "123456";
async function call(t: string | null, path: string, body?: unknown, method?: string) {
  const r = await fetch(BASE + path, { method: method ?? (body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: (await r.json().catch(() => ({}))) as any };
}
async function login(phone: string, extra: object = {}) { await call(null, "/api/auth/request", { phone }); const r = await call(null, "/api/auth/verify", { phone, code: OTP, client: "app", ...extra }); assert.equal(r.status, 200, JSON.stringify(r.j)); return r.j.token as string; }
const rnd = () => String(Math.floor(1e8 + Math.random() * 9e8)).slice(0, 9);

async function pair(name = "Kusum Joshi") {
  const fam = await login("+919" + rnd()); const seniorPhone = "+917" + rnd();
  const r = await call(fam, "/api/recipients", { name, address: "12 Lane 3, Sopanbaug", locality: "Sopanbaug", hospital: "Ruby Hall", hasPhone: true, phone: seniorPhone,
    emergencyContacts: [{ name: "Anita", relation: "Daughter", phone: "+14155550123", city: "Raleigh" }, { name: "Vinod", relation: "Neighbour", phone: "9822077777", city: "Pune", isLocal: true }],
    consent: { onBehalf: true, shareWithCaregiver: { allergies: true, medicines: true, conditions: false } } });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  await call(fam, `/api/recipients/${r.j.id}/health`, { noKnownAllergies: true, medicines: [{ name: "Metformin", dose: "500 mg", times: "8 AM and 8 PM" }, { name: "Amlodipine", dose: "5 mg", times: "night" }] }, "PUT");
  const s = await login(seniorPhone, { role: "senior" });
  return { fam, s, rid: r.j.id as string };
}

test("four check in moods; lonely and medical reach the family; streak and week view", async () => {
  const { fam, s, rid } = await pair();
  assert.equal((await call(s, "/api/checkins", { status: "sad" })).status, 422);
  assert.equal((await call(s, "/api/checkins", { status: "lonely" })).status, 200);
  const h = (await call(s, "/api/senior")).j;
  assert.equal(h.checkedInToday, true); assert.equal(h.lastStatus, "lonely"); assert.equal(h.streak, 1);
  assert.equal(h.contacts.length, 2); assert.ok(h.contacts[0].phone); assert.ok(h.thought.length > 10);
  assert.equal((await call(s, "/api/checkins", { status: "medical" })).status, 200);
  const w = (await call(fam, `/api/recipients/${rid}/week`)).j;
  assert.equal(w.week.length, 7); assert.equal(w.week[6].status, "medical"); assert.equal(w.streak, 1);
  const stranger = await login("+919" + rnd()); assert.equal((await call(stranger, `/api/recipients/${rid}/week`)).status, 403);
});

test("medicines: slots from free text, mark taken, senior adds own, family sees count", async () => {
  const { fam, s, rid } = await pair();
  const m = (await call(s, "/api/senior/meds")).j;
  assert.deepEqual(m.items.map((i: any) => `${i.key}|${i.slot}`), ["metformin|morning", "metformin|night", "amlodipine|night"]);
  const after = (await call(s, "/api/senior/meds", { action: "taken", key: "metformin", slot: "morning" })).j;
  assert.equal(after.items.filter((i: any) => i.taken).length, 1);
  assert.equal((await call(s, "/api/senior/meds", { action: "taken", key: "nothing", slot: "morning" })).status, 400);
  assert.equal((await call(s, "/api/senior/meds", { action: "add", name: "Vitamin D", dose: "1000 IU", slots: ["morning"] })).status, 200);
  assert.equal((await call(s, "/api/senior/meds", { action: "add", name: "vitamin d", dose: "", slots: ["night"] })).status, 400, "no duplicates");
  const w = (await call(fam, `/api/recipients/${rid}/week`)).j; assert.deepEqual(w.meds, { taken: 1, total: 4 });
  const health = (await call(fam, `/api/recipients/${rid}/health`)).j; assert.ok(health.medicines.some((x: any) => x.name === "Vitamin D" && x.givenBy === "self"));
});

test("brain games: same daily set, scores saved, streak counted", async () => {
  const { s } = await pair(); const { s: s2 } = await pair("Prakash Rao");
  const g = (await call(s, "/api/senior/games")).j; const g2 = (await call(s2, "/api/senior/games")).j;
  assert.equal(g.trivia.length, 5); assert.deepEqual(g.trivia.map((q: any) => q.q), g2.trivia.map((q: any) => q.q), "same questions for everyone today");
  assert.equal(g.words.length, 5); assert.equal([...g.words[0].letters].sort().join(""), [...g.words[0].word].sort().join(""));
  const r = (await call(s, "/api/senior/games", { game: "trivia", score: 80, seconds: 95 })).j;
  assert.equal(r.today.trivia.best, 80); assert.equal(r.streak, 1);
  const fam = await login("+919" + rnd()); assert.equal((await call(fam, "/api/senior/games", { game: "memory", score: 10 })).status, 403);
});

test("community: join, post, safety filter, reports hide, events, people and namaste", async () => {
  const tag = Math.random().toString(36).slice(2, 6); const A = "Kusum" + tag, B = "Suresh" + tag, Cn = "Meena" + tag;
  const a = await pair(A + " Joshi"); const b = await pair(B + " Patil"); const c = await pair(Cn + " Rao");
  const groups = (await call(a.s, "/api/community/groups")).j; const bhajan = groups.find((x: any) => x.slug === "bhajan");
  assert.ok(groups.length >= 7);
  assert.equal((await call(a.s, `/api/community/groups/${bhajan.id}`, { body: "Hello all" })).status, 403, "join first");
  for (const u of [a, b, c]) assert.equal((await call(u.s, `/api/community/groups/${bhajan.id}`, { join: true })).status, 200);
  assert.equal((await call(a.s, `/api/community/groups/${bhajan.id}`, { body: "Call me on 98220 12345 for bhajans" })).status, 400, "phone numbers blocked");
  assert.equal((await call(a.s, `/api/community/groups/${bhajan.id}`, { body: "Join at www.example.com" })).status, 400, "links blocked");
  const p = await call(a.s, `/api/community/groups/${bhajan.id}`, { body: "Bhajan sandhya this Sunday evening, all welcome" }); assert.equal(p.status, 200);
  const feed = (await call(b.s, `/api/community/groups/${bhajan.id}`)).j; const post = feed.posts.find((x: any) => x.id === p.j.id);
  assert.equal(post.author, A + " J."); assert.equal(post.mine, false); assert.equal(JSON.stringify(feed).includes("+91"), false, "no phone numbers in feed");
  await call(b.s, `/api/community/posts/${p.j.id}`, { action: "report" }); await call(b.s, `/api/community/posts/${p.j.id}`, { action: "report" });
  assert.ok((await call(c.s, `/api/community/groups/${bhajan.id}`)).j.posts.some((x: any) => x.id === p.j.id), "one report does not hide (repeat ignored)");
  await call(c.s, `/api/community/posts/${p.j.id}`, { action: "report" });
  assert.ok(!(await call(c.s, `/api/community/groups/${bhajan.id}`)).j.posts.some((x: any) => x.id === p.j.id), "two people reporting hides it");
  const ops = await login("+919000000099");
  assert.ok((await call(ops, "/api/ops/community")).j.reported.some((x: any) => x.id === p.j.id));
  assert.equal((await call(ops, "/api/ops/community", { action: "post", id: p.j.id, status: "live" })).status, 200);
  assert.ok((await call(c.s, `/api/community/groups/${bhajan.id}`)).j.posts.some((x: any) => x.id === p.j.id), "ops restored");

  const ev = await call(ops, "/api/ops/community", { action: "event", title: "Test walk " + Date.now(), place: "Kamala Nehru Park", startsAt: new Date(Date.now() + 3 * 864e5).toISOString(), capacity: 1, groupId: bhajan.id });
  assert.equal(ev.status, 200, JSON.stringify(ev.j));
  assert.equal((await call(a.s, `/api/community/events/${ev.j.id}`, { going: true })).status, 200);
  assert.equal((await call(b.s, `/api/community/events/${ev.j.id}`, { going: true })).status, 400, "full");
  assert.ok((await call(a.s, "/api/senior")).j.nextEvent);

  assert.equal((await call(a.s, "/api/community/people")).j.discoverable, false);
  assert.equal((await call(a.s, `/api/community/people/${"00000000-0000-0000-0000-000000000000"}`, {})).status, 400, "must opt in first");
  for (const u of [a, b]) assert.equal((await call(u.s, "/api/senior/settings", { discoverable: true }, "PUT")).status, 200);
  const list = (await call(a.s, "/api/community/people")).j.people; const bp = list.find((x: any) => x.name === B + " P.");
  assert.ok(bp); assert.equal(bp.sharedGroups, 1); assert.ok(!list.some((x: any) => x.name === Cn + " R."), "not discoverable");
  assert.equal(JSON.stringify(list).includes("+9"), false, "no phone numbers");
  const bId = bp.id; assert.equal((await call(a.s, `/api/community/people/${bId}`, {})).status, 200);
  assert.equal((await call(b.s, "/api/senior")).j.newNamastes, 1);
  const bl = (await call(b.s, "/api/community/people")).j.people.find((x: any) => x.name === A + " J."); assert.equal(bl.received, true);
  await call(b.s, `/api/community/people/${bl.id}`, {});
  assert.equal((await call(a.s, "/api/community/people")).j.people.find((x: any) => x.id === bId).friends, true);
});

test("safety: cyber fraud and crime reports saved, ops sees them; callbacks; check in time", async () => {
  const { s } = await pair();
  assert.equal((await call(s, "/api/senior/safety", { kind: "cyber", category: "theft" })).status, 400, "category must match kind");
  const cy = await call(s, "/api/senior/safety", { kind: "cyber", category: "upi", happened: "Today", amount: 25000, details: "Caller said he was from the bank" });
  assert.equal(cy.status, 200); assert.match(cy.j.code, /^CY-/);
  const cr = await call(s, "/api/senior/safety", { kind: "crime", category: "theft", happened: "Yesterday" }); assert.match(cr.j.code, /^CR-/);
  assert.equal((await call(s, "/api/senior/callback", { reason: "doctor" })).status, 200);
  const ops = await login("+919000000099"); const q = (await call(ops, "/api/ops/community")).j;
  const rep = q.safety.find((x: any) => x.code === cy.j.code); assert.equal(Number(rep.amount_paise), 2500000); assert.equal(rep.details_enc, undefined);
  assert.ok(q.callbacks.some((x: any) => x.reason === "doctor"));
  assert.equal((await call(ops, "/api/ops/community", { action: "close", kind: "safety", id: cy.j.code })).status, 200);
  assert.equal((await call(s, "/api/senior/settings", { checkinBy: "08:00" }, "PUT")).j.checkinBy, "08:00");
  assert.equal((await call(s, "/api/senior")).j.checkinBy, "08:00");
  assert.equal((await call(s, "/api/senior/settings", { checkinBy: "25:00" }, "PUT")).status, 422);
});
