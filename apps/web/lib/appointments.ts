import { z } from "zod";
import { one, q } from "./db";
import { dec, enc } from "./crypto";
import type { SessionUser } from "./auth";
import { AppError, familyRole } from "./bookings";
import { notify } from "./notify";
import { aiAllowed } from "./insights";
import { claudeJson } from "./providers";

/**
 * Appointments and follow ups for a senior, with reminders to the family and the senior.
 * AI may read an uploaded document and SUGGEST dates. A suggestion does nothing until a family member confirms it.
 * Medicines are never read into reminders by AI: medicine schedules stay with the family and the doctor.
 */
const KINDS = ["doctor", "test", "therapy", "follow_up", "other"] as const;
export const AppointmentIn = z.object({
  kind: z.enum(KINDS).default("doctor"), title: z.string().min(2).max(120),
  at: z.string().datetime({ offset: true }), place: z.string().max(160).optional(), notes: z.string().max(500).optional(),
});
async function can(u: SessionUser, rid: string, write = false) {
  const role = await familyRole(u.id, rid); if (!role) throw new AppError("Not found", 404);
  if (write && !["owner", "care_manager"].includes(role)) throw new AppError("Only the family member who manages care can change appointments", 403);
}
const shape = (a: any) => ({ id: a.id, kind: a.kind, title: a.title, at: a.at, place: a.place, notes: dec(a.notes_enc), source: a.source, status: a.status, documentId: a.document_id,
  label: a.source === "suggested" ? (a.status === "suggested" ? "Suggested by AI from a document. Check it against the document before confirming." : "Read from a document by AI, confirmed by your family") : null });

export async function listAppointments(u: SessionUser, rid: string) {
  await can(u, rid);
  return (await q<any>("SELECT * FROM appointments WHERE care_recipient_id=$1 AND status <> 'cancelled' AND (at IS NULL OR at > now() - interval '30 days') ORDER BY status='suggested' DESC, at NULLS LAST", [rid])).map(shape);
}
export async function addAppointment(u: SessionUser, rid: string, i: z.infer<typeof AppointmentIn>) {
  await can(u, rid, true);
  if (new Date(i.at).getTime() < Date.now() - 3600e3) throw new AppError("Choose a time in the future");
  const a = await one<any>(`INSERT INTO appointments (care_recipient_id, kind, title, at, place, notes_enc, created_by, confirmed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
    [rid, i.kind, i.title.trim(), i.at, i.place ?? null, enc(i.notes ?? null, "health"), u.id]);
  return shape(a);
}
export const AppointmentAct = z.object({ action: z.enum(["confirm", "done", "cancel"]), at: z.string().datetime({ offset: true }).optional(), title: z.string().min(2).max(120).optional(), place: z.string().max(160).optional() });
export async function actAppointment(u: SessionUser, rid: string, id: string, a: z.infer<typeof AppointmentAct>) {
  await can(u, rid, true);
  const x = await one<any>("SELECT * FROM appointments WHERE id=$1 AND care_recipient_id=$2", [id, rid]); if (!x) throw new AppError("Not found", 404);
  if (a.action === "confirm") {
    const at = a.at ?? x.at; if (!at) throw new AppError("Add the date and time before confirming");
    await q("UPDATE appointments SET status='confirmed', confirmed_by=$2, at=$3, title=COALESCE($4, title), place=COALESCE($5, place) WHERE id=$1", [id, u.id, at, a.title ?? null, a.place ?? null]);
  } else await q("UPDATE appointments SET status=$2 WHERE id=$1", [id, a.action === "done" ? "done" : "cancelled"]);
  return shape(await one("SELECT * FROM appointments WHERE id=$1", [id]));
}

/**
 * Reads an uploaded document (prescription, discharge summary, lab slip) with Claude and suggests appointments,
 * follow ups and tests with dates. Needs AI help on. Suggestions wait for confirmation and carry a clear label.
 */
export async function suggestFromDocument(u: SessionUser, rid: string, documentId: string) {
  await can(u, rid, true);
  if (!(await aiAllowed(rid))) throw new AppError("Turn on AI help for this person first, under Your data", 409, { needsAiHelp: true });
  const { document } = await import("./family");
  const d = await document(u, rid, documentId);
  const b64 = d.body.toString("base64");
  const block = d.mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
    : { type: "image", source: { type: "base64", media_type: d.mime, data: b64 } };
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const ai = await claudeJson<{ items: { kind: string; title: string; date: string | null; time: string | null; place: string | null; quote: string }[] }>(
    `You read Indian medical documents (prescriptions, discharge summaries, lab slips) to find FUTURE appointments, follow up visits, tests and therapy sessions, so a family can be reminded. Today is ${today}. ` +
    `Do not list medicines or doses. Do not interpret results or diagnose. If a date is relative ("review after 2 weeks"), work out the date from the document's own date when it is shown, otherwise leave date null. ` +
    `kind is one of doctor, test, therapy, follow_up, other. Quote the document's words for each item. Format: {"items":[{"kind":"follow_up","title":"Review with Dr ...","date":"YYYY-MM-DD","time":"HH:MM" or null,"place":"..." or null,"quote":"..."}]}. If none, {"items":[]}.`,
    [block, { type: "text", text: "List the appointments and follow ups in this document." }], 800);
  if (!ai) throw new AppError("The document could not be read just now. Please add the appointment yourself.", 502);
  const out = [];
  for (const it of (ai.items ?? []).slice(0, 8)) {
    const kind = (KINDS as readonly string[]).includes(it.kind) ? it.kind : "other";
    const at = it.date && /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? new Date(`${it.date}T${/^\d{2}:\d{2}$/.test(it.time ?? "") ? it.time : "10:00"}:00+05:30`).toISOString() : null;
    const row = await one<any>(`INSERT INTO appointments (care_recipient_id, kind, title, at, place, notes_enc, source, status, document_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,'suggested','suggested',$7,$8) RETURNING *`,
      [rid, kind, String(it.title ?? "Follow up").slice(0, 120), at, it.place ? String(it.place).slice(0, 160) : null, enc(it.quote ? `From the document: "${String(it.quote).slice(0, 300)}"` : null, "health"), documentId, u.id]);
    out.push(shape(row));
  }
  if (out.length) await notify(u.id, "appointment_suggested", { recipientId: rid, count: out.length });
  return { suggestions: out };
}

/** Reminders a day before and two hours before each confirmed appointment, to the family and the senior. */
export async function sweepAppointments() {
  let sent = 0;
  for (const [col, window] of [["reminded_day_at", "24 hours"], ["reminded_soon_at", "2 hours"]] as const) {
    const due = await q<any>(`UPDATE appointments SET ${col}=now() WHERE id IN (SELECT id FROM appointments WHERE status='confirmed' AND ${col} IS NULL AND at > now() AND at <= now() + interval '${window}' LIMIT 200) RETURNING id, care_recipient_id, title, at`);
    for (const a of due) {
      const people = await q<{ user_id: string }>(`SELECT user_id FROM family_members WHERE care_recipient_id=$1 AND accepted_at IS NOT NULL
        UNION SELECT senior_user_id FROM care_recipients WHERE id=$1 AND senior_user_id IS NOT NULL AND senior_link='confirmed'`, [a.care_recipient_id]);
      for (const p of people) { await notify(p.user_id, "appointment_reminder", { appointmentId: a.id, title: a.title, at: a.at }); sent++; }
    }
  }
  return { sent };
}
/** The next confirmed appointment, for the senior's home screen. */
export async function nextForSenior(rid: string) {
  const a = await one<any>("SELECT title, at, place FROM appointments WHERE care_recipient_id=$1 AND status='confirmed' AND at > now() ORDER BY at LIMIT 1", [rid]);
  return a ? { title: a.title, at: a.at, place: a.place } : null;
}
