import { z } from "zod";
import { one, q, tx } from "./db";
import { dec, enc } from "./crypto";
import { AppError, familyRole } from "./bookings";
import { removeStored } from "./storage";
import type { SessionUser } from "./auth";

/**
 * A person's rights over their own data (India's DPDP Act; also what Apple and Google require of every app):
 * see it (export), take consent back (consent), and erase it (deleteAccount).
 *
 * Deletion removes or anonymises everything personal. What the law requires Uday to keep is kept without the
 * person's identity: payment ledger entries, GST invoices (tax records, 8 years) and the audit trail.
 */
const LIVE = "('offered','proposal','accepted','enroute','arrived','active')";

/** Everything Uday holds about the signed in person, as one JSON file. */
export async function exportData(u: SessionUser) {
  const me = await one<any>("SELECT id, name, email, role, country, city, language, phone_enc, aadhaar_last4, kyc_status, created_at FROM users WHERE id=$1", [u.id]);
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), note: "Your data held by Uday. Health details are included only for parents you manage.",
    account: { ...me, phone: dec(me.phone_enc), phone_enc: undefined } };
  const recips = await q<any>(`SELECT r.*, m.role::text AS my_role FROM care_recipients r JOIN family_members m ON m.care_recipient_id=r.id AND m.user_id=$1 AND m.accepted_at IS NOT NULL
    UNION ALL SELECT r.*, 'self' FROM care_recipients r WHERE r.senior_user_id=$1 AND r.senior_link='confirmed'`, [u.id]);
  out.parents = await Promise.all(recips.map(async (r) => {
    const full = ["owner", "care_manager", "self"].includes(r.my_role);
    const h = full ? await one<any>("SELECT * FROM health_profiles WHERE care_recipient_id=$1", [r.id]) : null;
    const j = (v: string | null) => { try { return v ? JSON.parse(dec(v) ?? "null") : null; } catch { return dec(v ?? "") ?? null; } };
    return { id: r.id, name: r.name, myRole: r.my_role, locality: r.locality, address: full ? dec(r.address_enc) : undefined, checkInBy: r.checkin_by,
      emergencyContacts: full ? (await q<any>("SELECT name, relation, phone_enc, city, is_local FROM emergency_contacts WHERE care_recipient_id=$1", [r.id])).map((c) => ({ ...c, phone: dec(c.phone_enc), phone_enc: undefined })) : undefined,
      health: h ? { allergies: j(h.allergies_enc), conditions: j(h.conditions_enc), medicines: j(h.medicines_enc), doctors: j(h.doctors_enc), insurance: dec(h.insurance_enc) } : undefined,
      documents: full ? await q("SELECT title, kind, doc_date, mime, created_at FROM health_documents WHERE care_recipient_id=$1", [r.id]) : undefined,
      consents: await q("SELECT purpose, scope, granted_at, withdrawn_at FROM consents WHERE care_recipient_id=$1 ORDER BY granted_at", [r.id]),
      checkIns: await q("SELECT status, source, at FROM checkins WHERE care_recipient_id=$1 ORDER BY at DESC LIMIT 400", [r.id]) };
  }));
  out.bookings = await q(`SELECT b.code, b.status, b.care_type, b.days, b.start_date, b.total_paise, b.paid_paise, b.refund_paise, b.created_at FROM bookings b
    WHERE b.payer_id=$1 OR b.care_recipient_id = ANY($2::uuid[]) ORDER BY b.created_at DESC`, [u.id, recips.map((r) => r.id)]);
  out.invoices = await q("SELECT i.number, i.kind, i.issued_at, i.total_paise FROM invoices i JOIN bookings b ON b.id=i.booking_id WHERE b.payer_id=$1 ORDER BY i.issued_at", [u.id]);
  out.helpRequests = (await q<any>("SELECT code, category, status, text_enc, created_at FROM tickets WHERE user_id=$1 ORDER BY created_at", [u.id])).map((t) => ({ ...t, text: dec(t.text_enc), text_enc: undefined }));
  out.communityPosts = await q("SELECT body, status, created_at FROM group_posts WHERE user_id=$1 ORDER BY created_at", [u.id]);
  out.companionChat = (await q<any>("SELECT role, body_enc, created_at FROM companion_messages WHERE user_id=$1 ORDER BY id", [u.id])).map((m) => ({ role: m.role, text: dec(m.body_enc), at: m.created_at }));
  out.messagesSentToYou = await q("SELECT template, channel, status, at FROM notifications WHERE user_id=$1 ORDER BY at DESC LIMIT 500", [u.id]);
  if (u.role === "caregiver") {
    const c = await one<any>("SELECT id, display_name, tier, care_types, languages, skills, area, status, rating, rating_count, bank_last4, pan_last4, created_at FROM caregivers WHERE user_id=$1", [u.id]);
    out.caregiver = c; if (c) { out.onboarding = await q("SELECT stage, status, updated_at FROM onboarding_steps WHERE caregiver_id=$1 ORDER BY stage", [c.id]);
      out.earnings = await q("SELECT debit_paise, credit_paise, reason, at FROM ledger_entries WHERE account=$1 ORDER BY id", ["caregiver:" + c.id]);
      out.payouts = await q("SELECT amount_paise, status, bank_last4, created_at FROM payouts WHERE caregiver_id=$1", [c.id]); }
  }
  await q("INSERT INTO audit_log (actor_id, action, entity, entity_id, reason) VALUES ($1,'export','user',$2,'own data export')", [u.id, u.id]);
  return out;
}

/** What stands in the way of deleting now, in plain words. Empty means it can go ahead. */
export async function deletionBlockers(u: SessionUser): Promise<string[]> {
  const why: string[] = [];
  if (u.role === "ops") why.push("Team accounts are removed by an admin in Operations, Team.");
  if (u.role === "family") {
    const n = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM bookings b WHERE b.status IN ${LIVE} AND (b.payer_id=$1 OR EXISTS
      (SELECT 1 FROM family_members m WHERE m.care_recipient_id=b.care_recipient_id AND m.user_id=$1 AND m.role='owner'
        AND NOT EXISTS (SELECT 1 FROM family_members o WHERE o.care_recipient_id=b.care_recipient_id AND o.user_id <> $1 AND o.accepted_at IS NOT NULL AND o.role IN ('owner','care_manager'))))`, [u.id]))?.n ?? 0;
    if (n) why.push(`You have ${n} booking${n > 1 ? "s" : ""} in progress. Cancel or finish the care first, so no caregiver arrives at a home we can no longer contact.`);
  }
  if (u.role === "caregiver") {
    const c = await one<{ id: string }>("SELECT id FROM caregivers WHERE user_id=$1", [u.id]);
    if (c) {
      const n = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM bookings WHERE caregiver_id=$1 AND status IN ${LIVE}`, [c.id]))?.n ?? 0;
      if (n) why.push(`You have ${n} booking${n > 1 ? "s" : ""} in progress. Finish or hand them back first.`);
      const bal = Number((await one<{ b: string }>("SELECT COALESCE(sum(credit_paise - debit_paise),0) AS b FROM ledger_entries WHERE account=$1", ["caregiver:" + c.id]))?.b ?? 0);
      if (bal > 0) why.push(`Uday owes you ₹${Math.round(bal / 100).toLocaleString("en-IN")}. It is paid in the next weekly payout; delete your account after that so we can still pay you.`);
    }
  }
  if (u.role === "facility") { const f = await one("SELECT 1 FROM facilities WHERE owner_user_id=$1 AND status='live'", [u.id]); if (f) why.push("Take your facility listing down first, in the partner page."); }
  return why;
}

/** Erases the account. Not reversible. Returns what was kept and why, so the screen can say it honestly. */
export async function deleteAccount(u: SessionUser, confirm: string) {
  if (confirm !== "DELETE") throw new AppError("Type DELETE to confirm");
  const blockers = await deletionBlockers(u);
  if (blockers.length) { await q("INSERT INTO deletion_requests (user_id, role, status, note) VALUES ($1,$2,'blocked',$3)", [u.id, u.role, blockers.join(" | ")]); throw new AppError(blockers[0], 409, { blockers }); }
  const files: string[] = [];
  await tx(async (c) => {
    // Parents this person owns: hand over to another family manager if there is one, otherwise erase the parent's record.
    const owned = (await c.query("SELECT r.id FROM care_recipients r WHERE r.owner_id=$1", [u.id])).rows as { id: string }[];
    for (const r of owned) {
      const heir = (await c.query("SELECT user_id FROM family_members WHERE care_recipient_id=$1 AND user_id <> $2 AND accepted_at IS NOT NULL AND role IN ('owner','care_manager') ORDER BY invited_at LIMIT 1", [r.id, u.id])).rows[0];
      if (heir) { await c.query("UPDATE care_recipients SET owner_id=$2 WHERE id=$1", [r.id, heir.user_id]); await c.query("UPDATE family_members SET role='owner' WHERE care_recipient_id=$1 AND user_id=$2", [r.id, heir.user_id]); continue; }
      for (const d of (await c.query("DELETE FROM health_documents WHERE care_recipient_id=$1 RETURNING storage_key", [r.id])).rows) files.push(d.storage_key);
      await c.query("DELETE FROM health_profiles WHERE care_recipient_id=$1", [r.id]);
      for (const t of ["emergency_contacts", "checkins", "med_doses", "readings", "device_connections", "ivr_calls", "family_invites"]) await c.query(`DELETE FROM ${t} WHERE care_recipient_id=$1`, [r.id]);
      await c.query("UPDATE consents SET withdrawn_at=COALESCE(withdrawn_at, now()) WHERE care_recipient_id=$1", [r.id]);
      // Past bookings point at this row, so it stays as an empty shell with no name, address or phone.
      await c.query(`UPDATE care_recipients SET name='Deleted', dob_enc=NULL, gender=NULL, address_enc=NULL, locality=NULL, lat=NULL, lng=NULL, access_notes_enc=NULL, care_needs='{}', preferences='{}',
        hospital=NULL, senior_phone_hash=NULL, senior_user_id=NULL, senior_link='none', call_phone_enc=NULL, has_phone=false, checkin_mode='app' WHERE id=$1`, [r.id]);
    }
    // A parent deleting their own account: the family keeps the record they manage, but the link to this person ends.
    await c.query("UPDATE care_recipients SET senior_user_id=NULL, senior_link='none', senior_phone_hash=NULL WHERE senior_user_id=$1", [u.id]);
    await c.query("DELETE FROM family_members WHERE user_id=$1", [u.id]);
    // Things this person wrote.
    await c.query("UPDATE group_posts SET body='[removed]', status='hidden' WHERE user_id=$1", [u.id]);
    await c.query("UPDATE booking_messages SET body='[removed]' WHERE sender_id=$1", [u.id]);
    await c.query("UPDATE tickets SET text_enc=NULL WHERE user_id=$1", [u.id]);
    await c.query("UPDATE safety_reports SET details_enc=NULL WHERE user_id=$1", [u.id]);
    for (const t of ["companion_messages", "senior_settings", "game_plays", "group_members", "event_rsvps", "push_tokens", "memberships", "client_ops"]) await c.query(`DELETE FROM ${t} WHERE user_id=$1`, [u.id]);
    await c.query("DELETE FROM namastes WHERE from_user=$1 OR to_user=$1", [u.id]);
    await c.query("DELETE FROM notifications WHERE user_id=$1", [u.id]);
    await c.query("UPDATE leads SET note=NULL, status='done' WHERE user_id=$1", [u.id]);
    await c.query("UPDATE mandates SET status='cancelled', updated_at=now() WHERE user_id=$1 AND status IN ('active','pending')", [u.id]);
    if (u.role === "caregiver") {
      const cg = (await c.query("SELECT id FROM caregivers WHERE user_id=$1", [u.id])).rows[0];
      if (cg) {
        for (const d of (await c.query("DELETE FROM caregiver_documents WHERE caregiver_id=$1 RETURNING storage_key", [cg.id])).rows) files.push(d.storage_key);
        await c.query("DELETE FROM caregiver_verifications WHERE caregiver_id=$1", [cg.id]);
        await c.query(`UPDATE caregivers SET display_name='Former caregiver', initials='–', status='exited', online=false, bio=NULL, lat=NULL, lng=NULL, pan_enc=NULL, pan_last4=NULL, bank_ref=NULL,
          bank_last4=NULL, bank_ifsc=NULL, photo_doc_id=NULL, photo_status=NULL, service_areas='{}', languages='{}', skills='{}' WHERE id=$1`, [cg.id]);
      }
    }
    // The account itself: nothing that identifies the person remains. The row stays so ledger, invoices and audit keep their links.
    await c.query(`UPDATE users SET name=NULL, email=NULL, city=NULL, country=NULL, aadhaar_ref=NULL, aadhaar_last4=NULL, kyc_status=NULL, phone_hash='deleted:'||id::text, phone_enc=$2, phone_last4='0000', deleted_at=now() WHERE id=$1`, [u.id, enc("deleted")]);
    await c.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [u.id]);
    await c.query("INSERT INTO deletion_requests (user_id, role, status, completed_at) VALUES ($1,$2,'done', now())", [u.id, u.role]);
    await c.query("INSERT INTO audit_log (actor_id, action, entity, entity_id, reason) VALUES ($1,'delete','user',$2,'account deleted at the person''s own request')", [u.id, u.id]);
  });
  for (const k of files) await removeStored(k);
  return { deleted: true, kept: ["Payment and refund records without your name", "GST invoices, as tax law requires (8 years)", "The record that this account was deleted"] };
}

/** Sign out of every device. */
export async function signOutEverywhere(u: SessionUser) {
  await q("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [u.id]); await q("DELETE FROM push_tokens WHERE user_id=$1", [u.id]); return { ok: true };
}

// ───────── consent: what a caregiver may see ─────────
export const ConsentIn = z.object({ shareWithCaregiver: z.object({ allergies: z.boolean(), medicines: z.boolean(), conditions: z.boolean() }) });
export async function getConsent(u: SessionUser, recipientId: string) {
  if (!(await familyRole(u.id, recipientId))) throw new AppError("Not found", 404);
  const c = await one<any>("SELECT scope, granted_at FROM consents WHERE care_recipient_id=$1 AND purpose='caregiver_access' AND withdrawn_at IS NULL ORDER BY granted_at DESC LIMIT 1", [recipientId]);
  const history = await q("SELECT scope, granted_at, withdrawn_at FROM consents WHERE care_recipient_id=$1 AND purpose='caregiver_access' ORDER BY granted_at DESC LIMIT 10", [recipientId]);
  return { shareWithCaregiver: { allergies: !!c?.scope?.allergies, medicines: !!c?.scope?.medicines, conditions: !!c?.scope?.conditions }, since: c?.granted_at ?? null, history };
}
/** Change or take back what caregivers may see. The old consent is closed, never edited, so there is a full record. Takes effect at once. */
export async function setConsent(u: SessionUser, recipientId: string, i: z.infer<typeof ConsentIn>) {
  const role = await familyRole(u.id, recipientId); if (!role || !["owner", "care_manager"].includes(role)) throw new AppError("Only the family member who manages care can change this", 403);
  await tx(async (c) => {
    await c.query("UPDATE consents SET withdrawn_at=now() WHERE care_recipient_id=$1 AND purpose='caregiver_access' AND withdrawn_at IS NULL", [recipientId]);
    await c.query("INSERT INTO consents (care_recipient_id, purpose, scope, granted_by, on_behalf) VALUES ($1,'caregiver_access',$2,$3,true)", [recipientId, i.shareWithCaregiver, u.id]);
    await c.query("INSERT INTO audit_log (actor_id, action, entity, entity_id, reason) VALUES ($1,'consent','care_recipient',$2,$3)", [u.id, recipientId, JSON.stringify(i.shareWithCaregiver)]);
  });
  return getConsent(u, recipientId);
}
