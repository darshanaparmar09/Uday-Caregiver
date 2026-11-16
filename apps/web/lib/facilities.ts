import { z } from "zod";
import { FACILITY_PLANS, FACILITY_TYPES, FACILITY_REVIEW_AREAS, type FacilityPlan } from "@uday/core";
import { one, q, tx } from "./db";
import { gateway } from "./payments";
import { notify } from "./notify";
import { AppError } from "./bookings";
import type { SessionUser } from "./auth";

const TYPES = Object.keys(FACILITY_TYPES) as [string, ...string[]];
const LIVE = "f.status='live' AND (f.sample OR EXISTS (SELECT 1 FROM facility_subscriptions s WHERE s.facility_id=f.id AND s.status IN ('active','cancelled') AND s.current_period_end >= current_date))";
const RATING = "(SELECT json_build_object('avg', round(avg(r.overall),1), 'n', count(*)) FROM facility_reviews r WHERE r.facility_id=f.id AND r.status='published')";

export async function search(p: { type?: string; q?: string; maxMonthly?: number; dementia?: boolean; pets?: boolean }) {
  const w: string[] = [LIVE]; const v: unknown[] = [];
  if (p.type && TYPES.includes(p.type)) { v.push(p.type); w.push(`$${v.length} = ANY(f.types)`); }
  if (p.q) { v.push(`%${p.q.toLowerCase()}%`); w.push(`(lower(f.name) LIKE $${v.length} OR lower(f.locality) LIKE $${v.length})`); }
  if (p.maxMonthly) { v.push(p.maxMonthly * 100); w.push(`(f.monthly_from_paise IS NULL OR f.monthly_from_paise <= $${v.length})`); }
  if (p.dementia) w.push("f.dementia_unit"); if (p.pets) w.push("f.pets_allowed");
  return q(`SELECT f.id, f.name, f.types, f.locality, f.city, f.monthly_from_paise, f.monthly_to_paise, f.dementia_unit, f.pets_allowed, f.diets, f.licence_verified, f.sample, f.plan, ${RATING} AS rating
    FROM facilities f WHERE ${w.join(" AND ")} ORDER BY (f.plan='featured') DESC, f.name`, v);
}

export async function profile(id: string, viewer?: SessionUser | null) {
  const f = await one<any>(`SELECT f.*, ${RATING} AS rating FROM facilities f WHERE f.id=$1 AND ${LIVE}`, [id]);
  if (!f) throw new AppError("Facility not found", 404);
  const reviews = await q("SELECT relation, areas, overall, text, created_at FROM facility_reviews WHERE facility_id=$1 AND status='published' ORDER BY created_at DESC LIMIT 30", [id]);
  let mine: any = null;
  if (viewer?.role === "family") {
    const visit = await one<any>("SELECT status, preferred_date FROM visit_requests WHERE facility_id=$1 AND family_user_id=$2 ORDER BY created_at DESC LIMIT 1", [id, viewer.id]);
    const reviewed = await one("SELECT 1 FROM facility_reviews WHERE facility_id=$1 AND family_user_id=$2", [id, viewer.id]);
    const notes = await one<any>("SELECT answers FROM facility_visit_notes WHERE facility_id=$1 AND family_user_id=$2", [id, viewer.id]);
    mine = { visit, canReview: visit?.status === "completed" && !reviewed, reviewed: !!reviewed, notes: notes?.answers ?? {} };
  }
  delete f.owner_user_id; delete f.contact_phone;
  return { facility: f, reviews, mine };
}

export async function requestVisit(u: SessionUser, id: string, preferredDate: string, note?: string) {
  const f = await one<any>(`SELECT f.id, f.owner_user_id, f.name FROM facilities f WHERE f.id=$1 AND ${LIVE}`, [id]);
  if (!f) throw new AppError("Facility not found", 404);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) || preferredDate < new Date().toISOString().slice(0, 10)) throw new AppError("Choose a date from today");
  const open = await one("SELECT 1 FROM visit_requests WHERE facility_id=$1 AND family_user_id=$2 AND status IN ('requested','confirmed')", [id, u.id]);
  if (open) throw new AppError("You already have a visit request with this facility", 409);
  const r = await one("INSERT INTO visit_requests (facility_id, family_user_id, preferred_date, note) VALUES ($1,$2,$3,$4) RETURNING id, status", [id, u.id, preferredDate, note?.slice(0, 500) ?? null]);
  if (f.owner_user_id) await notify(f.owner_user_id, "visit_requested", { facilityId: id });
  return r;
}

export async function saveNotes(u: SessionUser, id: string, answers: Record<string, string>) {
  const clean = Object.fromEntries(Object.entries(answers).slice(0, 80).map(([k, v]) => [k.slice(0, 40), String(v).slice(0, 300)]));
  await q(`INSERT INTO facility_visit_notes (family_user_id, facility_id, answers, updated_at) VALUES ($1,$2,$3, now())
    ON CONFLICT (family_user_id, facility_id) DO UPDATE SET answers=EXCLUDED.answers, updated_at=now()`, [u.id, id, clean]);
}

/** Only families who visited (visit completed by the facility) can review, once each. */
export async function review(u: SessionUser, id: string, relation: "visited" | "resident_family", areas: Record<string, number>, text?: string) {
  const visit = await one("SELECT 1 FROM visit_requests WHERE facility_id=$1 AND family_user_id=$2 AND status='completed'", [id, u.id]);
  if (!visit) throw new AppError("You can rate a facility after your visit is marked completed by the facility.", 403);
  const vals = FACILITY_REVIEW_AREAS.map(([k]) => areas[k]);
  if (vals.some((x) => !Number.isInteger(x) || x < 1 || x > 5)) throw new AppError("Rate all five areas from 1 to 5");
  const overall = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  try { await q("INSERT INTO facility_reviews (facility_id, family_user_id, relation, areas, overall, text) VALUES ($1,$2,$3,$4,$5,$6)", [id, u.id, relation, areas, overall, text?.slice(0, 1000) ?? null]); }
  catch (e: any) { if (e.code === "23505") throw new AppError("You have already reviewed this facility", 409); throw e; }
  return { overall };
}

// ───────── facility partner portal ─────────
export const FacilityIn = z.object({
  name: z.string().min(3).max(100), types: z.array(z.enum(TYPES)).min(1), locality: z.string().min(2).max(60), city: z.string().max(40).default("Pune"),
  address: z.string().max(300).optional(), description: z.string().max(1500).optional(), licenceNo: z.string().max(60).optional(), beds: z.number().int().min(1).max(5000).optional(),
  staffRatio: z.string().max(40).optional(), memoryStaffRatio: z.string().max(40).optional(), doctorVisits: z.string().max(200).optional(),
  monthlyFrom: z.number().int().min(0).optional(), monthlyTo: z.number().int().min(0).optional(), entryFee: z.number().int().min(0).optional(),
  refundPolicy: z.string().max(500).optional(), extraCosts: z.string().max(500).optional(), dementiaUnit: z.boolean().default(false), petsAllowed: z.boolean().default(false),
  diets: z.array(z.string().max(30)).max(8).default([]), activities: z.array(z.string().max(40)).max(20).default([]), contactPhone: z.string().max(20).optional(),
});

export async function myFacility(u: SessionUser) {
  const f = await one<any>("SELECT * FROM facilities WHERE owner_user_id=$1", [u.id]);
  if (!f) return { facility: null };
  const sub = await one("SELECT plan, amount_paise, status, current_period_end FROM facility_subscriptions WHERE facility_id=$1 ORDER BY created_at DESC LIMIT 1", [f.id]);
  const visits = await q(`SELECT v.id, v.preferred_date, v.note, v.status, v.created_at, u.name AS family_name, u.phone_last4 FROM visit_requests v JOIN users u ON u.id=v.family_user_id
    WHERE v.facility_id=$1 ORDER BY v.created_at DESC LIMIT 100`, [f.id]);
  const reviews = await q("SELECT relation, areas, overall, text, created_at FROM facility_reviews WHERE facility_id=$1 ORDER BY created_at DESC", [f.id]);
  return { facility: f, subscription: sub, visits, reviews, plans: FACILITY_PLANS };
}

export async function saveFacility(u: SessionUser, i: z.infer<typeof FacilityIn>) {
  if (u.role !== "facility") {
    if (u.role !== "family") throw new AppError("This account cannot list a facility", 403);
    const fam = await one("SELECT 1 FROM family_members WHERE user_id=$1", [u.id]);
    if (fam) throw new AppError("This number is used for a family account. Use a separate number for your facility.", 409);
    await q("UPDATE users SET role='facility' WHERE id=$1", [u.id]);
  }
  const vals = [i.name, i.types, i.locality, i.city, i.address ?? null, i.description ?? null, i.licenceNo ?? null, i.beds ?? null, i.staffRatio ?? null, i.memoryStaffRatio ?? null,
    i.doctorVisits ?? null, i.monthlyFrom != null ? i.monthlyFrom * 100 : null, i.monthlyTo != null ? i.monthlyTo * 100 : null, i.entryFee != null ? i.entryFee * 100 : null,
    i.refundPolicy ?? null, i.extraCosts ?? null, i.dementiaUnit, i.petsAllowed, i.diets, i.activities, i.contactPhone ?? null];
  const cols = "name, types, locality, city, address, description, licence_no, beds, staff_ratio, memory_staff_ratio, doctor_visits, monthly_from_paise, monthly_to_paise, entry_fee_paise, refund_policy, extra_costs, dementia_unit, pets_allowed, diets, activities, contact_phone";
  const existing = await one<any>("SELECT id, status FROM facilities WHERE owner_user_id=$1", [u.id]);
  if (existing) {
    const sets = cols.split(", ").map((c, k) => `${c}=$${k + 2}`).join(", ");
    // Changing the licence number sends a live listing back for checking.
    await q(`UPDATE facilities SET ${sets}, licence_verified = CASE WHEN licence_no IS DISTINCT FROM $8 THEN false ELSE licence_verified END WHERE id=$1`, [existing.id, ...vals]);
    return { id: existing.id };
  }
  const ph = vals.map((_, k) => `$${k + 2}`).join(",");
  return one(`INSERT INTO facilities (owner_user_id, ${cols}) VALUES ($1, ${ph}) RETURNING id`, [u.id, ...vals]);
}

export async function subscribe(u: SessionUser, plan: FacilityPlan) {
  const f = await one<any>("SELECT id, status, name, licence_no FROM facilities WHERE owner_user_id=$1", [u.id]);
  if (!f) throw new AppError("Create your facility profile first", 400);
  if (!f.licence_no) throw new AppError("Add your licence or registration number before choosing a plan", 400);
  const p = FACILITY_PLANS[plan];
  const r = await gateway().subscribe(plan, p.pricePaise, `FAC-${f.id.slice(0, 8)}`);
  await tx(async (c) => {
    await c.query("UPDATE facility_subscriptions SET status='cancelled' WHERE facility_id=$1 AND status='active'", [f.id]);
    await c.query("INSERT INTO facility_subscriptions (facility_id, plan, amount_paise, status, gateway_ref, current_period_end) VALUES ($1,$2,$3,$4,$5, current_date + interval '1 month')",
      [f.id, plan, p.pricePaise, r.status === "active" ? "active" : "past_due", r.ref]);
    await c.query("INSERT INTO ledger_entries (account, debit_paise, credit_paise, reason) VALUES ('facility_payments',$1,0,$2),('uday_listing_revenue',0,$1,$2)", [p.pricePaise, `listing ${plan} ${f.name}`]);
    await c.query("UPDATE facilities SET plan=$2, status=CASE WHEN status='draft' THEN 'review' ELSE status END WHERE id=$1", [f.id, plan]);
  });
  await notify(null, "facility_review", { facilityId: f.id });
  return { status: r.status, checkoutUrl: r.checkoutUrl };
}

export async function cancelPlan(u: SessionUser) {
  const f = await one<any>("SELECT id FROM facilities WHERE owner_user_id=$1", [u.id]);
  if (!f) throw new AppError("No facility", 404);
  // Listing stays visible until the paid period ends.
  await q("UPDATE facility_subscriptions SET status='cancelled' WHERE facility_id=$1 AND status='active'", [f.id]);
}

export async function setVisit(u: SessionUser, visitId: string, status: "confirmed" | "completed" | "cancelled") {
  const v = await one<any>("SELECT v.*, f.owner_user_id, f.name FROM visit_requests v JOIN facilities f ON f.id=v.facility_id WHERE v.id=$1", [visitId]);
  if (!v || v.owner_user_id !== u.id) throw new AppError("Visit not found", 404);
  await q("UPDATE visit_requests SET status=$2 WHERE id=$1", [visitId, status]);
  await notify(v.family_user_id, "visit_updated", { facilityId: v.facility_id, status });
}

export async function opsReview(status: "live" | "suspended", id: string, licenceVerified?: boolean) {
  await q("UPDATE facilities SET status=$2, licence_verified=COALESCE($3, licence_verified) WHERE id=$1", [id, status, licenceVerified ?? null]);
}

/** Monthly renewals. Unpaid listings drop out of search after their period ends. */
export async function renewSubscriptions() {
  const due = await q<any>("SELECT id, gateway_ref, amount_paise, facility_id FROM facility_subscriptions WHERE status='active' AND current_period_end <= current_date");
  let renewed = 0;
  for (const s of due) {
    const r = await gateway().chargeRenewal(s.gateway_ref, s.amount_paise);
    if (r.ok) { await q("UPDATE facility_subscriptions SET current_period_end = current_period_end + interval '1 month' WHERE id=$1", [s.id]);
      await q("INSERT INTO ledger_entries (account, debit_paise, credit_paise, reason) VALUES ('facility_payments',$1,0,'listing renewal'),('uday_listing_revenue',0,$1,'listing renewal')", [s.amount_paise]); renewed++; }
    else await q("UPDATE facility_subscriptions SET status='past_due' WHERE id=$1", [s.id]);
  }
  return { renewed };
}
