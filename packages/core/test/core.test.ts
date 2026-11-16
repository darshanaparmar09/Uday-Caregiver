import { test } from "node:test";
import assert from "node:assert/strict";
import { fees, cancelQuote, canTransition, nextMatch, shiftStart, offerWindowMinutes } from "../src/index.ts";

test("fees: 1,400 rupees a day for 7 days", () => {
  const f = fees(140000, 7);
  assert.equal(f.carePaise, 980000);
  assert.equal(f.platformPaise, 78400);   // 8%
  assert.equal(f.gstPaise, 14112);        // 18% of platform fee
  assert.equal(f.totalPaise, 1072512);
});

test("fees reject bad input", () => {
  assert.throws(() => fees(0, 1));
  assert.throws(() => fees(100, 1.5));
});

const base = { days: 7, daysDone: 0, totalPaise: 1072512, ratePaise: 140000 };

test("cancel before acceptance is always free", () => {
  const q = cancelQuote({ ...base, status: "offered", nextShiftStart: new Date() });
  assert.deepEqual(q, { feePaise: 0, refundPaise: 1072512, reason: "not_confirmed" });
});

test("cancel more than 4 hours before is free", () => {
  const now = new Date("2026-11-16T00:00:00Z");
  const q = cancelQuote({ ...base, status: "accepted", nextShiftStart: new Date("2026-11-16T05:00:00Z") }, now);
  assert.equal(q.feePaise, 0); assert.equal(q.refundPaise, 1072512);
});

test("cancel inside 4 hours costs 20% of one day", () => {
  const now = new Date("2026-11-16T02:00:00Z");
  const q = cancelQuote({ ...base, status: "accepted", nextShiftStart: new Date("2026-11-16T05:00:00Z") }, now);
  assert.equal(q.feePaise, 28000); assert.equal(q.reason, "late");
});

test("mid plan cancel refunds unused days only", () => {
  const now = new Date("2026-11-16T00:00:00Z");
  const q = cancelQuote({ ...base, daysDone: 3, status: "accepted", nextShiftStart: new Date("2026-11-17T05:00:00Z") }, now);
  assert.equal(q.refundPaise, Math.floor((1072512 * 4) / 7));
});

test("state machine permissions", () => {
  assert.ok(canTransition("offered", "accepted", "caregiver"));
  assert.ok(!canTransition("offered", "accepted", "family"));
  assert.ok(canTransition("proposal", "offered", "family"));
  assert.ok(!canTransition("closed", "accepted", "ops"));
  assert.ok(!canTransition("arrived", "cancelled", "family"));
});

test("next match: same tier, care type, untried, nearest first", () => {
  const c = [
    { id: "a", tier: 2 as const, careTypes: ["day" as const], active: true, rating: 4.9, areaKm: 9 },
    { id: "b", tier: 2 as const, careTypes: ["day" as const], active: true, rating: 4.5, areaKm: 3 },
    { id: "c", tier: 3 as const, careTypes: ["day" as const], active: true, rating: 5, areaKm: 1 },
    { id: "d", tier: 2 as const, careTypes: ["night" as const], active: true, rating: 5, areaKm: 1 },
  ];
  assert.equal(nextMatch(c, 2, "day", ["a"])?.id, "b");
  assert.equal(nextMatch(c, 2, "day", ["a", "b"]), null);
});

test("shift start in Pune time", () => {
  assert.equal(shiftStart("2026-11-16", "09:00", 0).toISOString(), "2026-11-16T03:30:00.000Z");
  assert.equal(shiftStart("2026-11-16", "20:00", 1).toISOString(), "2026-11-17T14:30:00.000Z");
});

test("offer window shorter for same day", () => {
  const now = new Date("2026-11-16T00:00:00Z");
  assert.equal(offerWindowMinutes(new Date("2026-11-16T05:00:00Z"), now), 30);
  assert.equal(offerWindowMinutes(new Date("2026-11-20T05:00:00Z"), now), 240);
});

import { vitalsFlags, checklistFor } from "../src/index.ts";
test("vitals flags outside limits", () => {
  assert.deepEqual(vitalsFlags({ bpSys: 120, bpDia: 80, pulse: 72, tempC: 36.8, pain: 2 }), []);
  assert.deepEqual(vitalsFlags({ bpSys: 172, bpDia: 96, pulse: 118, tempC: 38.4, pain: 8 }), ["Blood pressure 172/96", "Pulse 118", "Temperature 38.4°C", "Pain 8 of 10"]);
});
test("checklist hides vitals below Tier 3", () => {
  assert.ok(!checklistFor(2).flatMap((s) => s.items).some((i) => i.id === "vitals"));
  assert.ok(checklistFor(3).flatMap((s) => s.items).some((i) => i.id === "vitals"));
});
