import ExcelJS from "exceljs";
import { one, q } from "./db";
import { dec, enc } from "./crypto";
import { normalisePhone } from "./crypto";
import { AppError } from "./bookings";
import { sendSmsAuto } from "./providers";
import type { SessionUser } from "./auth";

/**
 * Partners for telehealth, insurance and the home tablet, loaded by the Uday team from an Excel sheet.
 * Seniors and families who ask for one of these are matched to an active partner in their city.
 * A partner receives a person's name and number only if that person ticked the consent box.
 */
export const KINDS = ["telehealth", "insurance", "tablet"] as const;
type Kind = (typeof KINDS)[number];
const COLS = [
  ["kind", "Type", "telehealth, insurance or tablet", true],
  ["name", "Partner name", "As families should see it", true],
  ["contact_name", "Contact person", "Who receives leads", false],
  ["phone", "Contact phone", "10 digit mobile, or with +country code", false],
  ["email", "Contact email", "", false],
  ["city", "City", "Pune if left empty", false],
  ["areas", "Areas served", "Comma separated, or All", false],
  ["offer", "Offer for Uday members", "One line shown to families and seniors", false],
  ["price_note", "Price note", "For example From ₹499 a consultation", false],
  ["website", "Website", "https://...", false],
  ["share_leads", "Send leads", "yes or no. Only people who agree are sent", false],
  ["active", "Active", "yes or no", false],
] as const;

/** The Excel template: one sheet to fill, a second sheet that explains each column. */
export async function template(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); wb.creator = "Uday";
  const ws = wb.addWorksheet("Partners", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLS.map(([k, label]) => ({ header: label, key: k, width: Math.max(16, label.length + 6) }));
  ws.getRow(1).font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E1347" } };
  ws.addRow({ kind: "telehealth", name: "Example Clinic (delete this row)", contact_name: "Dr A Kulkarni", phone: "9822000000", email: "care@example.in", city: "Pune", areas: "All", offer: "Doctor call back within 2 hours", price_note: "From ₹499 a call", website: "https://example.in", share_leads: "yes", active: "no" });
  ws.getRow(2).font = { name: "Arial", italic: true, color: { argb: "FF6B6B8A" } };
  for (let r = 2; r <= 300; r++) {
    ws.getCell(`A${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"telehealth,insurance,tablet"'] };
    ws.getCell(`K${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"yes,no"'] };
    ws.getCell(`L${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"yes,no"'] };
  }
  const help = wb.addWorksheet("How to fill");
  help.columns = [{ header: "Column", key: "c", width: 26 }, { header: "Required", key: "r", width: 10 }, { header: "What to enter", key: "w", width: 60 }];
  help.getRow(1).font = { name: "Arial", bold: true };
  for (const [, label, what, req] of COLS) help.addRow({ c: label, r: req ? "Yes" : "", w: what });
  help.addRow({}); help.addRow({ c: "Upload rule", w: "A row with the same Type and Partner name as an existing partner updates it. Nothing is deleted by an upload; set Active to no to hide a partner." });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

type Row = { row: number; kind: Kind; name: string; contact_name?: string; phone?: string; email?: string; city: string; areas?: string; offer?: string; price_note?: string; website?: string; share_leads: boolean; active: boolean };
const yes = (v: string) => /^(y|yes|true|1)$/i.test(v.trim());
const cellText = (v: any): string => v == null ? "" : typeof v === "object" ? (v.text ?? v.result ?? (v.richText ? v.richText.map((x: any) => x.text).join("") : v.hyperlink ?? String(v))) : String(v);

/** Reads an uploaded sheet. Returns the rows it understood and a list of problems by row number. */
export async function parse(buf: Buffer): Promise<{ rows: Row[]; problems: string[] }> {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf as any); } catch { throw new AppError("This file could not be read. Upload the .xlsx template from this page."); }
  const ws = wb.getWorksheet("Partners") ?? wb.worksheets[0]; if (!ws) throw new AppError("The file has no sheets");
  const head = (ws.getRow(1).values as any[]).map((v) => cellText(v).trim().toLowerCase());
  const idx: Record<string, number> = {};
  for (const [k, label] of COLS) { const i = head.indexOf(label.toLowerCase()); if (i > 0) idx[k] = i; }
  if (!idx.kind || !idx.name) throw new AppError("The first row must have the template headings, including Type and Partner name");
  const rows: Row[] = []; const problems: string[] = []; const seen = new Set<string>();
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const g = (k: string) => (idx[k] ? cellText(r.getCell(idx[k]).value).trim() : "");
    const name = g("name"); const kind = g("kind").toLowerCase();
    if (!name && !kind) return;
    if (/delete this row/i.test(name)) return;
    if (!KINDS.includes(kind as Kind)) { problems.push(`Row ${n}: Type must be telehealth, insurance or tablet`); return; }
    if (!name || name.length > 120) { problems.push(`Row ${n}: add the partner name`); return; }
    let phone = g("phone");
    if (phone) { try { phone = normalisePhone(phone); } catch { problems.push(`Row ${n}: the phone number does not look right`); return; } }
    const email = g("email"); if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { problems.push(`Row ${n}: the email does not look right`); return; }
    const website = g("website"); if (website && !/^https?:\/\//i.test(website)) { problems.push(`Row ${n}: the website must start with https://`); return; }
    const key = kind + "|" + name.toLowerCase(); if (seen.has(key)) { problems.push(`Row ${n}: ${name} appears twice; the first row is used`); return; } seen.add(key);
    rows.push({ row: n, kind: kind as Kind, name, contact_name: g("contact_name") || undefined, phone: phone || undefined, email: email || undefined, city: g("city") || "Pune", areas: g("areas") || undefined,
      offer: g("offer").slice(0, 300) || undefined, price_note: g("price_note").slice(0, 120) || undefined, website: website || undefined, share_leads: yes(g("share_leads")), active: g("active") ? yes(g("active")) : true });
  });
  return { rows, problems };
}

/** Upload: dryRun shows what would change; otherwise rows are added or updated. */
export async function importSheet(u: SessionUser, buf: Buffer, dryRun: boolean) {
  const { rows, problems } = await parse(buf);
  let added = 0, updated = 0;
  for (const r of rows) {
    const ex = await one<{ id: string }>("SELECT id FROM partners WHERE kind=$1 AND lower(name)=lower($2)", [r.kind, r.name]);
    ex ? updated++ : added++;
    if (dryRun) continue;
    await q(`INSERT INTO partners (kind, name, contact_name, phone_enc, email, city, areas, offer, price_note, website, share_leads, active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (kind, name) DO UPDATE SET contact_name=$3, phone_enc=$4, email=$5, city=$6, areas=$7, offer=$8, price_note=$9, website=$10, share_leads=$11, active=$12, updated_at=now()`,
      [r.kind, ex ? (await one<any>("SELECT name FROM partners WHERE id=$1", [ex.id]))!.name : r.name, r.contact_name ?? null, r.phone ? enc(r.phone) : null, r.email ?? null, r.city, r.areas ?? null, r.offer ?? null, r.price_note ?? null, r.website ?? null, r.share_leads, r.active]);
  }
  if (!dryRun) await q("INSERT INTO audit_log (actor_id, action, entity, reason) VALUES ($1,'import','partners',$2)", [u.id, `${added} added, ${updated} updated, ${problems.length} problems`]);
  return { dryRun, added, updated, problems, preview: rows.slice(0, 50).map((r) => ({ row: r.row, kind: r.kind, name: r.name, city: r.city, offer: r.offer ?? "", active: r.active, shareLeads: r.share_leads })) };
}

export async function listPartners(kind?: string, publicView = false) {
  const rows = await q<any>(`SELECT id, kind, name, contact_name, phone_enc, email, city, areas, offer, price_note, website, share_leads, active, updated_at,
      (SELECT count(*)::int FROM leads l WHERE l.partner_id=p.id) AS leads FROM partners p WHERE ($1::text IS NULL OR kind=$1) ${publicView ? "AND active" : ""} ORDER BY kind, name`, [kind ?? null]);
  return rows.map((r) => publicView ? { id: r.id, kind: r.kind, name: r.name, city: r.city, offer: r.offer, price_note: r.price_note, website: r.website }
    : { ...r, phone: dec(r.phone_enc), phone_enc: undefined });
}
export async function setPartnerActive(id: string, active: boolean) { await q("UPDATE partners SET active=$2, updated_at=now() WHERE id=$1", [id, active]); return { ok: true }; }

/** Picks an active partner of this kind in the person's city (or any city if none). */
export async function matchPartner(kind: string, city?: string | null) {
  return one<{ id: string; name: string }>(`SELECT id, name FROM partners WHERE kind=$1 AND active ORDER BY (lower(city)=lower($2)) DESC, (SELECT count(*) FROM leads l WHERE l.partner_id=partners.id AND l.status='open'), name LIMIT 1`, [kind, city ?? "Pune"]);
}

/** Ops: send a consenting lead to its partner by SMS. */
export async function sendLead(id: string) {
  const l = await one<any>(`SELECT l.*, p.name AS partner, p.phone_enc AS p_phone, p.share_leads, u.name AS person, u.phone_enc AS u_phone, r.name AS senior, r.locality
    FROM leads l JOIN partners p ON p.id=l.partner_id LEFT JOIN users u ON u.id=l.user_id LEFT JOIN care_recipients r ON r.id=l.care_recipient_id WHERE l.id=$1`, [id]);
  if (!l) throw new AppError("Assign a partner first", 404);
  if (!l.consent_share) throw new AppError("This person did not agree to share their details with a partner. Call them instead.");
  if (!l.share_leads || !l.p_phone) throw new AppError(`${l.partner} is not set to receive leads, or has no phone number`);
  await sendSmsAuto(dec(l.p_phone)!, `Uday lead (${l.kind}): ${l.senior ?? l.person ?? "Member"}${l.locality ? ", " + l.locality : ""}. Call ${dec(l.u_phone) ?? ""}. ${l.note ?? ""}`.slice(0, 300));
  await q("UPDATE leads SET sent_at=now() WHERE id=$1", [id]); return { ok: true };
}
export async function assignLead(id: string, partnerId: string | null) { await q("UPDATE leads SET partner_id=$2 WHERE id=$1", [id, partnerId]); return { ok: true }; }
