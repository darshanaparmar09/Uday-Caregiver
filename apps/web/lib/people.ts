import { z } from "zod";
import { one, q, tx } from "./db";
import { enc, encJson, decJson, dec, lookupHash, normalisePhone } from "./crypto";
import { notify } from "./notify";
import { AppError, familyRole } from "./bookings";
import type { SessionUser } from "./auth";

// ───────── payer profile ─────────
export const ProfileInput = z.object({
  name: z.string().min(2).max(80), email: z.string().email().optional().or(z.literal("")),
  country: z.string().min(2).max(60), city: z.string().min(2).max(60),
  timezone: z.string().max(60).default("Asia/Kolkata"), language: z.enum(["en", "hi", "mr"]).default("en"),
});
export async function saveProfile(u: SessionUser, i: z.infer<typeof ProfileInput>) {
  await q("UPDATE users SET name=$2, email=$3, country=$4, city=$5, timezone=$6, language=$7 WHERE id=$1",
    [u.id, i.name, i.email || null, i.country, i.city, i.timezone, i.language]);
}

// ───────── senior (care recipient) ─────────
export const RecipientInput = z.object({
  name: z.string().min(2).max(80),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: z.string().max(20).optional(),
  languages: z.array(z.string().max(20)).max(6).default([]),
  hasPhone: z.boolean().default(true),
  phone: z.string().optional(),
  address: z.string().min(5).max(300),
  locality: z.string().min(2).max(60),
  lat: z.number().optional(), lng: z.number().optional(),
  accessNotes: z.string().max(500).optional(),
  hospital: z.string().min(2).max(120),
  careNeeds: z.record(z.boolean()).default({}),
  preferences: z.record(z.string()).default({}),
  emergencyContacts: z.array(z.object({ name: z.string().min(2), relation: z.string().max(40), phone: z.string(), city: z.string().max(60), isLocal: z.boolean().default(false) })).min(2),
  consent: z.object({ onBehalf: z.boolean(), shareWithCaregiver: z.object({ allergies: z.boolean(), medicines: z.boolean(), conditions: z.boolean() }) }),
});

export async function createRecipient(u: SessionUser, i: z.infer<typeof RecipientInput>) {
  const seniorPhone = i.hasPhone && i.phone ? normalisePhone(i.phone) : null;
  return tx(async (c) => {
    const r = (await c.query(
      `INSERT INTO care_recipients (owner_id, senior_phone_hash, name, dob_enc, gender, languages, has_phone, address_enc, locality, lat, lng, access_notes_enc, care_needs, preferences, hospital)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [u.id, seniorPhone ? lookupHash(seniorPhone) : null, i.name, enc(i.dob), i.gender ?? null, i.languages, i.hasPhone, enc(i.address), i.locality,
       i.lat ?? null, i.lng ?? null, enc(i.accessNotes), i.careNeeds, i.preferences, i.hospital])).rows[0];
    await c.query("INSERT INTO family_members (care_recipient_id, user_id, role, accepted_at) VALUES ($1,$2,'owner', now())", [r.id, u.id]);
    for (const e of i.emergencyContacts)
      await c.query("INSERT INTO emergency_contacts (care_recipient_id, name, relation, phone_enc, city, is_local) VALUES ($1,$2,$3,$4,$5,$6)",
        [r.id, e.name, e.relation, enc(normalisePhone(e.phone)), e.city, e.isLocal]);
    await c.query("INSERT INTO consents (care_recipient_id, purpose, scope, granted_by, on_behalf) VALUES ($1,'caregiver_access',$2,$3,$4)",
      [r.id, i.consent.shareWithCaregiver, u.id, i.consent.onBehalf]);
    // The parent is never linked silently. The link waits until the parent, signed in with that number, agrees to it
    // in the app (lib/senior.ts answerLink). Until then this family sees none of the parent's own activity.
    if (seniorPhone) await c.query("UPDATE care_recipients SET senior_link='pending' WHERE id=$1", [r.id]);
    return r;
  });
}

export async function listRecipients(u: SessionUser) {
  const rows = await q<any>(`SELECT r.id, r.name, r.locality, r.has_phone, r.checkin_by, f.role,
      (SELECT json_build_object('status', status, 'at', at) FROM checkins k WHERE k.care_recipient_id=r.id ORDER BY at DESC LIMIT 1) AS last_checkin,
      EXISTS(SELECT 1 FROM health_profiles h WHERE h.care_recipient_id=r.id) AS has_health
    FROM care_recipients r JOIN family_members f ON f.care_recipient_id=r.id AND f.user_id=$1 AND f.accepted_at IS NOT NULL ORDER BY r.created_at`, [u.id]);
  return rows;
}

// ───────── optional health profile ─────────
export const HealthInput = z.object({
  noKnownAllergies: z.boolean().nullable().default(null),
  allergies: z.array(z.object({ name: z.string().max(80), reaction: z.string().max(120).optional(), severity: z.enum(["mild", "moderate", "severe"]).optional() })).max(30).default([]),
  conditions: z.array(z.string().max(120)).max(30).default([]),
  medicines: z.array(z.object({ name: z.string().max(80), dose: z.string().max(60), times: z.string().max(80), withFood: z.boolean().optional(), givenBy: z.enum(["self", "family", "caregiver"]).optional() })).max(40).default([]),
  doctors: z.array(z.object({ name: z.string().max(80), speciality: z.string().max(60).optional(), phone: z.string().max(20).optional(), clinic: z.string().max(120).optional() })).max(10).default([]),
  insurance: z.string().max(120).optional(),
});

export async function saveHealth(u: SessionUser, recipientId: string, i: z.infer<typeof HealthInput>) {
  const role = await familyRole(u.id, recipientId);
  if (!role || !["owner", "care_manager"].includes(role)) throw new AppError("Not allowed", 403);
  await tx(async (c) => {
    const prev = (await c.query("SELECT * FROM health_profiles WHERE care_recipient_id=$1 FOR UPDATE", [recipientId])).rows[0];
    if (prev) await c.query("INSERT INTO health_profile_history (care_recipient_id, snapshot_enc, changed_by) VALUES ($1,$2,$3)",
      [recipientId, encJson({ allergies: decJson(prev.allergies_enc), conditions: decJson(prev.conditions_enc), medicines: decJson(prev.medicines_enc), doctors: decJson(prev.doctors_enc) }), u.id]);
    await c.query(`INSERT INTO health_profiles (care_recipient_id, allergies_enc, conditions_enc, medicines_enc, doctors_enc, insurance_enc, no_known_allergies, updated_by, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now()) ON CONFLICT (care_recipient_id) DO UPDATE SET allergies_enc=EXCLUDED.allergies_enc, conditions_enc=EXCLUDED.conditions_enc,
      medicines_enc=EXCLUDED.medicines_enc, doctors_enc=EXCLUDED.doctors_enc, insurance_enc=EXCLUDED.insurance_enc, no_known_allergies=EXCLUDED.no_known_allergies, updated_by=EXCLUDED.updated_by, updated_at=now()`,
      [recipientId, encJson(i.allergies), encJson(i.conditions), encJson(i.medicines), encJson(i.doctors), enc(i.insurance, "health"), i.noKnownAllergies, u.id]);
    await c.query("INSERT INTO audit_log (actor_id, action, entity, entity_id) VALUES ($1,'health_update','care_recipient',$2)", [u.id, recipientId]);
  });
}

export async function getHealth(u: SessionUser, recipientId: string) {
  const role = await familyRole(u.id, recipientId);
  if (!role || !["owner", "care_manager"].includes(role)) throw new AppError("Not allowed", 403);
  const h = await one<any>("SELECT * FROM health_profiles WHERE care_recipient_id=$1", [recipientId]);
  await q("INSERT INTO audit_log (actor_id, action, entity, entity_id) VALUES ($1,'health_view','care_recipient',$2)", [u.id, recipientId]);
  if (!h) return null;
  return { noKnownAllergies: h.no_known_allergies, allergies: decJson(h.allergies_enc) ?? [], conditions: decJson(h.conditions_enc) ?? [],
    medicines: decJson(h.medicines_enc) ?? [], doctors: decJson(h.doctors_enc) ?? [], insurance: dec(h.insurance_enc), updatedAt: h.updated_at };
}

// ───────── daily check in ─────────
/** The senior taps the sunrise, then "I am well" or "I need help". Family members may also check in on their behalf. */
export async function checkIn(u: SessionUser, status: "ok" | "help" | "medical" | "lonely", recipientId?: string) {
  let rid = recipientId;
  if (u.role === "senior") {
    const r = await one<{ id: string }>("SELECT id FROM care_recipients WHERE senior_user_id=$1 ORDER BY created_at LIMIT 1", [u.id]);
    if (!r) throw new AppError("Your family has not linked your profile yet. Ask them to add your number in Uday.", 404);
    rid = r.id;
  } else if (!rid || !(await familyRole(u.id, rid))) throw new AppError("Not allowed", 403);
  await q("INSERT INTO checkins (care_recipient_id, status, source) VALUES ($1,$2,$3)", [rid, status, u.role === "senior" ? "app" : "family"]);
  const { raiseAlert, resolveAlertsFor } = await import("./alerts");
  if (status === "help" || status === "medical") {
    // An urgent check in is an alert: it must be acknowledged by a person, and escalates until it is.
    const alert = await raiseAlert({ kind: status === "help" ? "checkin_help" : "checkin_medical", recipientId: rid, raisedBy: u.id, raisedRole: u.role });
    return { ok: true, recipientId: rid, alert };
  }
  await resolveAlertsFor(rid!, ["checkin_missed"], "Checked in", u.id);
  const fam = await q<{ user_id: string }>("SELECT user_id FROM family_members WHERE care_recipient_id=$1 AND accepted_at IS NOT NULL AND user_id <> $2", [rid, u.id]);
  let told = 0;
  for (const f of fam) { const o = await notify(f.user_id, status === "ok" ? "checkin_ok" : "checkin_lonely", { recipientId: rid }); if (o.status === "sent") told++; }
  // told = family phones a provider accepted the message for. The app says "your family can see this", never "your family knows".
  return { ok: true, recipientId: rid, told, family: fam.length };
}

/**
 * Missed check ins raise an alert that escalates until someone acknowledges it (lib/alerts.ts). Run by cron.
 * Monitored: seniors who check in by app (has their own phone) or by the daily phone call. A senior with neither
 * is not monitored, and the family screen says so.
 */
export async function sweepMissedCheckins() {
  const today = "(now() AT TIME ZONE 'Asia/Kolkata')::date";
  // Minutes since midnight avoids the wrap when check in time plus grace passes midnight.
  const rows = await q<{ id: string }>(`SELECT r.id FROM care_recipients r WHERE (r.has_phone OR r.checkin_mode='call')
      AND extract(epoch FROM (now() AT TIME ZONE 'Asia/Kolkata')::time) / 60 > extract(epoch FROM r.checkin_by) / 60 + (SELECT missed_checkin_grace_min FROM policy_settings WHERE id=1)
      AND NOT EXISTS (SELECT 1 FROM checkins k WHERE k.care_recipient_id=r.id AND (k.at AT TIME ZONE 'Asia/Kolkata')::date = ${today})
      AND NOT EXISTS (SELECT 1 FROM alerts a WHERE a.care_recipient_id=r.id AND a.kind='checkin_missed' AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::date = ${today})`);
  // Gentle reminder to the senior at their own check in time, once a day.
  const remind = await q<{ id: string; senior_user_id: string }>(`SELECT r.id, r.senior_user_id FROM care_recipients r WHERE r.senior_user_id IS NOT NULL AND r.senior_link='confirmed'
      AND (now() AT TIME ZONE 'Asia/Kolkata')::time > r.checkin_by
      AND NOT EXISTS (SELECT 1 FROM checkins k WHERE k.care_recipient_id=r.id AND (k.at AT TIME ZONE 'Asia/Kolkata')::date = ${today})
      AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.template='checkin_reminder' AND n.payload->>'recipientId' = r.id::text AND n.at > now() - interval '20 hours')`);
  for (const r of remind) await notify(r.senior_user_id, "checkin_reminder", { recipientId: r.id });
  const { raiseAlert } = await import("./alerts");
  for (const r of rows) await raiseAlert({ kind: "checkin_missed", recipientId: r.id, raisedBy: null, raisedRole: "system" }).catch((e) => console.error("missed check in alert failed", r.id, e));
  return rows.length;
}

/**
 * SOS. Returns who was really reached, so the app can tell the truth. A booking id is honoured only for a
 * family member of that booking's parent or its assigned caregiver.
 */
export async function sos(u: SessionUser, bookingId?: string, lat?: number, lng?: number) {
  const { limit } = await import("./ratelimit"); await limit("sos:" + u.id, 20, 600, "SOS already raised. Call 112 if you are in danger.");
  let recipientId: string | null = null; let booking: string | null = null;
  if (bookingId) {
    const b = await one<any>("SELECT b.id, b.care_recipient_id, c.user_id AS cg_user FROM bookings b JOIN caregivers c ON c.id=b.caregiver_id WHERE b.id=$1", [bookingId]);
    if (b && (b.cg_user === u.id || (await familyRole(u.id, b.care_recipient_id)))) { booking = b.id; recipientId = u.role === "caregiver" ? null : b.care_recipient_id; }
  }
  if (u.role === "senior") recipientId = (await one<{ id: string }>("SELECT id FROM care_recipients WHERE senior_user_id=$1 AND senior_link='confirmed' ORDER BY created_at LIMIT 1", [u.id]))?.id ?? null;
  const ev = await one<{ id: number }>("INSERT INTO sos_events (user_id, booking_id, role, lat, lng) VALUES ($1,$2,$3,$4,$5) RETURNING id", [u.id, booking, u.role, lat ?? null, lng ?? null]);
  const { raiseAlert } = await import("./alerts");
  const alert = await raiseAlert({ kind: "sos", recipientId, bookingId: booking, raisedBy: u.id, raisedRole: u.role, lat, lng });
  await q("UPDATE incidents SET sos_id=$2 WHERE alert_id=$1 AND sos_id IS NULL", [alert.id, ev!.id]).catch(() => {});
  if (booking) await q("INSERT INTO booking_events (booking_id, actor_id, actor_role, message) VALUES ($1,$2,$3,$4)", [booking, u.id, u.role, alert.anyoneReached ? "SOS raised. Alerts sent." : "SOS raised."]);
  return { ok: true, alert };
}
