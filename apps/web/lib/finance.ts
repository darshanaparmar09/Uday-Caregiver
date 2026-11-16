import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { WEEKDAYS } from "@uday/core";
import { one, q, tx } from "./db";
import { AppError, familyRole } from "./bookings";
import { business, cfg, clearSettingsCache, policyNow } from "./settings";
import { audit, type OpsRole } from "./ops";
import { runPayouts } from "./caregiver";
import type { SessionUser } from "./auth";

/**
 * Money in the operations console: pricing and policy, the GST invoice register, the monthly GST summary,
 * reconciliation and payouts. Tax treatment (SAC code, place of supply, invoicing at payment) is an assumption
 * for the chartered accountant to confirm.
 */

// ───────── pricing and policy ─────────
export async function pricing() {
  const p = await one<any>("SELECT * FROM policy_settings WHERE id=1");
  const rates = await q<any>("SELECT tier, care_type, rate_paise, updated_at FROM tier_rates ORDER BY tier, care_type");
  const counts = await q<any>("SELECT tier, count(*)::int AS n FROM caregivers WHERE status IN ('active','verifying','paused') GROUP BY tier");
  return { policy: { platformFeePct: p.platform_fee_bps / 100, freeCancelHours: p.free_cancel_hours, lateCancelPct: p.late_cancel_bps / 100, offerSameDayMin: p.offer_same_day_min, offerFutureMin: p.offer_future_min,
    missedCheckinGraceMin: p.missed_checkin_grace_min, ticketSlaMin: p.ticket_sla_min, urgentTicketSlaMin: p.urgent_ticket_sla_min, updatedAt: p.updated_at }, rates, caregiversByTier: counts, gstRatePct: (await business()).gstRatePct };
}
export const PolicyIn = z.object({
  platformFeePct: z.number().min(0).max(30), freeCancelHours: z.number().int().min(0).max(72), lateCancelPct: z.number().min(0).max(100),
  offerSameDayMin: z.number().int().min(10).max(240), offerFutureMin: z.number().int().min(30).max(1440),
  missedCheckinGraceMin: z.number().int().min(15).max(240), ticketSlaMin: z.number().int().min(30).max(2880), urgentTicketSlaMin: z.number().int().min(5).max(240),
});
export async function savePolicy(u: SessionUser, i: z.infer<typeof PolicyIn>) {
  await q(`UPDATE policy_settings SET platform_fee_bps=$1, free_cancel_hours=$2, late_cancel_bps=$3, offer_same_day_min=$4, offer_future_min=$5, missed_checkin_grace_min=$6, ticket_sla_min=$7, urgent_ticket_sla_min=$8, updated_by=$9, updated_at=now() WHERE id=1`,
    [Math.round(i.platformFeePct * 100), i.freeCancelHours, Math.round(i.lateCancelPct * 100), i.offerSameDayMin, i.offerFutureMin, i.missedCheckinGraceMin, i.ticketSlaMin, i.urgentTicketSlaMin, u.id]);
  await audit(u.id, "update", "policy", "1", `fee ${i.platformFeePct}%, free cancel ${i.freeCancelHours}h, late ${i.lateCancelPct}%`);
  clearSettingsCache(); return pricing();
}
export const RatesIn = z.object({ rates: z.array(z.object({ tier: z.number().int().min(1).max(3), careType: z.enum(["day", "night", "live"]), ratePaise: z.number().int().min(10000).max(5_000_000) })).min(1).max(9), applyToCaregivers: z.boolean().default(false) });
/** New standard rates apply to new caregivers. With applyToCaregivers, every caregiver of that tier moves to them too; existing bookings keep their price. */
export async function saveRates(u: SessionUser, i: z.infer<typeof RatesIn>) {
  await tx(async (c) => {
    for (const r of i.rates) {
      await c.query("INSERT INTO tier_rates (tier, care_type, rate_paise, updated_by, updated_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (tier, care_type) DO UPDATE SET rate_paise=$3, updated_by=$4, updated_at=now()", [r.tier, r.careType, r.ratePaise, u.id]);
      if (i.applyToCaregivers) await c.query(`UPDATE caregivers SET rate_${r.careType}_paise=$2 WHERE tier=$1 AND status <> 'exited'`, [r.tier, r.ratePaise]);
    }
  });
  await audit(u.id, "update", "tier_rates", null, i.rates.map((r) => `T${r.tier} ${r.careType} ₹${r.ratePaise / 100}`).join(", ") + (i.applyToCaregivers ? " (applied to caregivers)" : ""));
  return pricing();
}

// ───────── GST invoice register ─────────
/** Indian financial year of a date, for example 2026-27. */
export function finYear(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 3600e3); const y = ist.getUTCFullYear(); const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
async function nextNumber(c: { query: any }, kind: "invoice" | "credit_note", prefix: string) {
  const fy = finYear();
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["invoice-seq-" + kind + fy]);
  const seq = (await c.query("SELECT COALESCE(max(seq),0)+1 AS n FROM invoices WHERE kind=$1 AND fy=$2", [kind, fy])).rows[0].n as number;
  return { fy, seq, number: `${kind === "invoice" ? prefix : "CN"}/${fy}/${String(seq).padStart(5, "0")}` };
}
function split(taxable: number, gst: number, intra: boolean) {
  return intra ? { cgst: Math.floor(gst / 2), sgst: gst - Math.floor(gst / 2), igst: 0 } : { cgst: 0, sgst: 0, igst: gst };
}
/**
 * Issues any invoices a booking is owed, once money is collected: one for the whole booking when paid up front
 * (plus one per extension), or one per week when billed weekly. Safe to call any number of times.
 */
export async function ensureInvoices(bookingId: string) {
  return tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["inv-" + bookingId]);
    const b = (await c.query("SELECT b.*, u.name AS payer FROM bookings b JOIN users u ON u.id=b.payer_id WHERE b.id=$1", [bookingId])).rows[0];
    if (!b || ["offered", "proposal"].includes(b.status) || (b.status === "released" && !b.paid_paise)) return 0;
    const biz = await business(); const intra = biz.stateCode === "27"; const rate = Math.round(biz.gstRatePct * 100);
    const issue = async (cycle: number | null, care: number, taxable: number, gst: number, reason: string) => {
      if (taxable <= 0 && care <= 0) return;
      const n = await nextNumber(c, "invoice", biz.invoicePrefix); const t = split(taxable, gst, intra);
      await c.query(`INSERT INTO invoices (kind, fy, seq, number, booking_id, cycle_no, care_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, gst_rate_bps, gstin, place_of_supply, buyer_name, sac_code, reason)
        VALUES ('invoice',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'27',$14,$15,$16)`, [n.fy, n.seq, n.number, bookingId, cycle, care, taxable, t.cgst, t.sgst, t.igst, care + taxable + gst, rate, biz.gstin || null, b.payer, biz.sacCode || null, reason]);
      issued++;
    };
    let issued = 0;
    if (b.billing === "weekly") {
      const have = new Set((await c.query("SELECT cycle_no FROM invoices WHERE booking_id=$1 AND kind='invoice' AND cycle_no IS NOT NULL", [bookingId])).rows.map((r: any) => r.cycle_no));
      for (const y of (await c.query("SELECT * FROM billing_cycles WHERE booking_id=$1 AND status='paid' ORDER BY cycle_no", [bookingId])).rows)
        if (!have.has(y.cycle_no)) await issue(y.cycle_no, y.care_paise, y.platform_paise, y.gst_paise, `Week ${y.cycle_no}, days ${y.from_day} to ${y.to_day}`);
    } else if (b.paid_paise > 0 || ["accepted", "enroute", "arrived", "active", "completed", "closed"].includes(b.status)) {
      const s = (await c.query("SELECT COALESCE(sum(care_paise),0)::int AS care, COALESCE(sum(taxable_paise),0)::int AS tx, COALESCE(sum(cgst_paise+sgst_paise+igst_paise),0)::int AS gst, count(*)::int AS n FROM invoices WHERE booking_id=$1 AND kind='invoice'", [bookingId])).rows[0];
      await issue(null, b.care_paise - s.care, b.platform_paise - s.tx, b.gst_paise - s.gst, s.n ? "Extension" : `${b.days} day${b.days > 1 ? "s" : ""} of care`);
    }
    return issued;
  });
}
/** After a refund: a credit note for the part of Uday's fee that was invoiced but will not be earned. */
export async function creditNoteFor(bookingId: string) {
  await ensureInvoices(bookingId);
  return tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["inv-" + bookingId]);
    const b = (await c.query("SELECT status, payer_id FROM bookings WHERE id=$1", [bookingId])).rows[0];
    const inv = (await c.query(`SELECT COALESCE(sum(taxable_paise) FILTER (WHERE kind='invoice'),0)::int AS inv, COALESCE(sum(taxable_paise) FILTER (WHERE kind='credit_note'),0)::int AS cn,
      COALESCE(sum(care_paise) FILTER (WHERE kind='invoice'),0)::int AS care_inv, COALESCE(sum(care_paise) FILTER (WHERE kind='credit_note'),0)::int AS care_cn FROM invoices WHERE booking_id=$1 AND status='issued'`, [bookingId])).rows[0];
    const led = (await c.query(`SELECT COALESCE(sum(credit_paise) FILTER (WHERE account='uday_fee'),0)::int AS fee, COALESCE(sum(debit_paise) FILTER (WHERE account='uday_goodwill'),0)::int AS goodwill,
      COALESCE(sum(credit_paise) FILTER (WHERE account LIKE 'caregiver:%' AND reason NOT LIKE 'weekly payout%'),0)::int AS care FROM ledger_entries WHERE booking_id=$1`, [bookingId])).rows[0];
    const biz = await business(); const rate = Math.round(biz.gstRatePct * 100); const intra = biz.stateCode === "27";
    let taxableDue = 0, careDue = 0;
    if (["cancelled", "released"].includes(b.status)) { taxableDue = inv.inv - inv.cn - led.fee; careDue = inv.care_inv - inv.care_cn - led.care; }
    // Goodwill refunds are a reduction of the fee, GST included.
    const goodwillTaxable = Math.round(led.goodwill / (1 + rate / 10000));
    const already = (await c.query("SELECT COALESCE(sum(taxable_paise),0)::int AS g FROM invoices WHERE booking_id=$1 AND kind='credit_note' AND reason='Goodwill refund'", [bookingId])).rows[0].g;
    const out: string[] = [];
    const make = async (care: number, taxable: number, reason: string) => {
      if (taxable <= 0 && care <= 0) return;
      const gst = Math.round((Math.max(0, taxable) * rate) / 10000); const t = split(taxable, gst, intra); const n = await nextNumber(c, "credit_note", biz.invoicePrefix);
      const against = (await c.query("SELECT id FROM invoices WHERE booking_id=$1 AND kind='invoice' ORDER BY issued_at DESC LIMIT 1", [bookingId])).rows[0]?.id ?? null;
      await c.query(`INSERT INTO invoices (kind, fy, seq, number, booking_id, against_id, care_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, gst_rate_bps, gstin, place_of_supply, sac_code, reason)
        VALUES ('credit_note',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'27',$14,$15)`, [n.fy, n.seq, n.number, bookingId, against, Math.max(0, care), Math.max(0, taxable), t.cgst, t.sgst, t.igst, Math.max(0, care) + Math.max(0, taxable) + gst, rate, biz.gstin || null, biz.sacCode || null, reason]);
      out.push(n.number);
    };
    await make(careDue, taxableDue, "Unused days refunded");
    await make(0, goodwillTaxable - already, "Goodwill refund");
    return out;
  });
}
export async function invoiceRegister(f: { month?: string; kind?: string }) {
  const month = f.month && /^\d{4}-\d{2}$/.test(f.month) ? f.month : new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7);
  const rows = await q<any>(`SELECT i.id, i.kind, i.number, i.issued_at, i.care_paise, i.taxable_paise, i.cgst_paise, i.sgst_paise, i.igst_paise, i.total_paise, i.gst_rate_bps, i.status, i.reason, i.buyer_name, b.code AS booking, b.id AS booking_id
    FROM invoices i JOIN bookings b ON b.id=i.booking_id WHERE to_char(i.issued_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')=$1 ${f.kind ? "AND i.kind=$2" : ""} ORDER BY i.issued_at, i.number`, f.kind ? [month, f.kind] : [month]);
  const sum = (k: string, kind: string) => rows.filter((r) => r.kind === kind && r.status === "issued").reduce((s, r) => s + r[k], 0);
  const summary = Object.fromEntries(["taxable_paise", "cgst_paise", "sgst_paise", "igst_paise", "care_paise"].map((k) => [k, sum(k, "invoice") - sum(k, "credit_note")]));
  const recognised = await one<any>(`SELECT COALESCE(sum(credit_paise) FILTER (WHERE account='uday_fee'),0)::bigint AS fee, COALESCE(sum(credit_paise) FILTER (WHERE account='gst_payable'),0)::bigint AS gst
    FROM ledger_entries WHERE to_char(at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')=$1`, [month]);
  return { month, rows, summary, invoices: rows.filter((r) => r.kind === "invoice").length, creditNotes: rows.filter((r) => r.kind === "credit_note").length, recognised, business: await business() };
}
/** CSV of the register for the CA (GSTR-1 preparation). */
export async function registerCsv(month: string) {
  const r = await invoiceRegister({ month });
  const head = ["Type", "Number", "Date", "Booking", "Buyer", "Place of supply", "SAC", "Rate %", "Care fee (not taxable, Rs)", "Taxable value (Rs)", "CGST (Rs)", "SGST (Rs)", "IGST (Rs)", "Invoice total (Rs)", "Status", "Note"];
  const rs = (p: number) => (p / 100).toFixed(2);
  const lines = r.rows.map((x) => [x.kind === "invoice" ? "Invoice" : "Credit note", x.number, new Date(x.issued_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }), x.booking, x.buyer_name ?? "", "27 Maharashtra", r.business.sacCode,
    (x.gst_rate_bps / 100).toFixed(2), rs(x.care_paise), rs(x.taxable_paise), rs(x.cgst_paise), rs(x.sgst_paise), rs(x.igst_paise), rs(x.total_paise), x.status, x.reason ?? ""]);
  return csv([head, ...lines, [], ["Net for the month (invoices less credit notes)", "", "", "", "", "", "", "", rs(r.summary.care_paise), rs(r.summary.taxable_paise), rs(r.summary.cgst_paise), rs(r.summary.sgst_paise), rs(r.summary.igst_paise)]]);
}
export function csv(rows: (string | number)[][]) {
  return "﻿" + rows.map((r) => r.map((v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\r\n");
}

/** The invoice document for a booking: one page per invoice and credit note in the register. Family members and the Uday team can open it. */
export async function invoicesPdf(u: SessionUser, bookingId: string) {
  const b = await one<any>(`SELECT b.*, c.display_name, r.name AS senior, x.name AS payer, x.email, x.city, x.country FROM bookings b JOIN caregivers c ON c.id=b.caregiver_id
    JOIN care_recipients r ON r.id=b.care_recipient_id JOIN users x ON x.id=b.payer_id WHERE b.id=$1`, [bookingId]);
  if (!b || (u.role !== "ops" && !(await familyRole(u.id, b.care_recipient_id)))) throw new AppError("Not found", 404);
  await ensureInvoices(bookingId);
  const rows = await q<any>("SELECT * FROM invoices WHERE booking_id=$1 ORDER BY issued_at, number", [bookingId]);
  if (!rows.length) throw new AppError("The invoice is ready once payment is taken");
  const biz = await business();
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.06, 0.25); const rupee = (p: number) => "Rs " + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  for (const inv of rows) {
    const page = doc.addPage([595, 842]); let y = 790;
    const text = (t: string, x: number, size = 10, f = font) => page.drawText(t, { x, y, size, font: f, color: ink });
    const draft = !biz.gstin || !biz.caReviewed;
    if (draft) page.drawText(!biz.gstin ? "DRAFT - GSTIN NOT YET ADDED" : "DRAFT - AWAITING CA REVIEW", { x: 110, y: 420, size: 26, font: bold, color: rgb(0.9, 0.3, 0.3), opacity: 0.25, rotate: { type: "degrees" as any, angle: 30 } as any });
    if (inv.status === "cancelled") page.drawText("CANCELLED", { x: 200, y: 470, size: 40, font: bold, color: rgb(0.8, 0.2, 0.2), opacity: 0.3 });
    text(inv.kind === "credit_note" ? "CREDIT NOTE" : biz.gstin ? "TAX INVOICE" : "INVOICE (DRAFT)", 50, 20, bold); y -= 24;
    text(biz.legalName || `${biz.brandName} (legal name to be added in Settings)`, 50, 11, bold); y -= 14;
    if (biz.address) { text(`${biz.address}, ${biz.city} ${biz.pincode}`.trim(), 50, 9); y -= 12; }
    text(`GSTIN: ${biz.gstin || "not added"}   ·   PAN: ${biz.pan || "-"}   ·   State: ${biz.state} (${biz.stateCode})`, 50, 9); y -= 26;
    text(`${inv.kind === "credit_note" ? "Credit note" : "Invoice"} no: ${inv.number}`, 50, 10, bold); text(`Date: ${new Date(inv.issued_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`, 400); y -= 14;
    if (inv.against_id) { const a = rows.find((r) => r.id === inv.against_id); text(`Against invoice: ${a?.number ?? ""}`, 50); y -= 14; }
    text(`Booking: ${b.code}   ·   Place of supply: Maharashtra (27)`, 50); y -= 24;
    text("Billed to", 50, 10, bold); y -= 14; text(`${b.payer ?? "Family member"}${b.email ? " · " + b.email : ""}`, 50); y -= 14; text(`${b.city ?? ""}${b.country ? ", " + b.country : ""}`, 50); y -= 14;
    text(`Care for ${b.senior} by ${b.display_name}${inv.reason ? " · " + inv.reason : ""}${b.day_off != null ? ` (day off ${WEEKDAYS[b.day_off]})` : ""}`, 50); y -= 28;
    const pct = inv.gst_rate_bps / 100;
    const lines: [string, number][] = [["Care fee collected for the caregiver (not Uday's supply)", inv.care_paise], [`${biz.brandName} platform fee, SAC ${inv.sac_code || "to be confirmed"} (taxable value)`, inv.taxable_paise],
      ...(inv.igst_paise ? [[`IGST ${pct}%`, inv.igst_paise]] as [string, number][] : [[`CGST ${pct / 2}%`, inv.cgst_paise], [`SGST ${pct / 2}%`, inv.sgst_paise]] as [string, number][])];
    page.drawLine({ start: { x: 50, y: y + 10 }, end: { x: 545, y: y + 10 }, thickness: 0.5, color: ink });
    for (const [t, v] of lines) { text(t, 50); text(rupee(v), 450); y -= 18; }
    page.drawLine({ start: { x: 50, y: y + 8 }, end: { x: 545, y: y + 8 }, thickness: 0.5, color: ink }); y -= 6;
    text("Total", 50, 11, bold); text(rupee(inv.total_paise), 450, 11, bold); y -= 34;
    for (const l of ["The care fee is passed to the caregiver in full and is not the platform's revenue. GST applies to the platform fee only.",
      ...(biz.caReviewed ? [] : ["Format, SAC code, place of supply and tax split to be confirmed by a chartered accountant before use."])]) { text(l, 50, 8); y -= 12; }
  }
  return Buffer.from(await doc.save());
}

// ───────── reconciliation ─────────
type Issue = { severity: "high" | "medium" | "low"; check: string; booking?: string; detail: string };
/** Checks that money records agree: payments, the ledger, weekly cycles, payouts, invoices and (when connected) Razorpay. */
export async function reconcile(u: SessionUser, from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new AppError("Choose a valid date range");
  const issues: Issue[] = []; const range = [from, to];
  const inRange = "b.created_at >= $1::date AND b.created_at < $2::date + 1";
  // 1. Payments against the ledger, per booking.
  for (const r of await q<any>(`SELECT b.id, b.code,
      (SELECT COALESCE(sum(captured_paise - refunded_paise),0) FROM payments p WHERE p.booking_id=b.id)::bigint AS pay,
      (SELECT COALESCE(sum(debit_paise),0) - COALESCE((SELECT sum(credit_paise) FROM ledger_entries l2 WHERE l2.booking_id=b.id AND l2.account='family_refunds'),0) FROM ledger_entries l WHERE l.booking_id=b.id AND l.account='family_payments')::bigint AS led
    FROM bookings b WHERE ${inRange}`, range))
    if (Number(r.pay) !== Number(r.led)) issues.push({ severity: "high", check: "Payments match the ledger", booking: r.code, detail: `Gateway records ₹${(Number(r.pay) / 100).toFixed(2)}, ledger ₹${(Number(r.led) / 100).toFixed(2)}` });
  // 2. Money left in escrow on finished bookings.
  for (const r of await q<any>(`SELECT b.code, b.status, (SELECT COALESCE(sum(credit_paise - debit_paise),0) FROM ledger_entries l WHERE l.booking_id=b.id AND l.account='escrow')::bigint AS esc
    FROM bookings b WHERE ${inRange} AND b.status IN ('closed','cancelled','released') AND b.updated_at < now() - interval '1 day'`, range))
    if (Number(r.esc) !== 0) issues.push({ severity: "medium", check: "Escrow is empty when care ends", booking: r.code, detail: `₹${(Number(r.esc) / 100).toFixed(2)} still held on a ${r.status} booking` });
  // 3. Weekly cycles marked paid have a payment.
  for (const r of await q<any>(`SELECT b.code, y.cycle_no FROM billing_cycles y JOIN bookings b ON b.id=y.booking_id WHERE ${inRange} AND y.status='paid'
      AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.booking_id=y.booking_id AND l.reason = 'week ' || y.cycle_no || ' charged')`, range))
    issues.push({ severity: "high", check: "Weekly payments are recorded", booking: r.code, detail: `Week ${r.cycle_no} is marked paid but has no ledger entry` });
  // 4. Charging for more than a day.
  for (const r of await q<any>(`SELECT b.code, y.cycle_no FROM billing_cycles y JOIN bookings b ON b.id=y.booking_id WHERE y.status='held' AND y.due_at < now() - interval '1 day'`))
    issues.push({ severity: "medium", check: "Weekly charges are confirmed", booking: r.code, detail: `Week ${r.cycle_no} has waited more than a day for the gateway's confirmation` });
  // 5. Payouts against caregiver balances.
  const po = await one<any>(`SELECT (SELECT COALESCE(sum(amount_paise),0) FROM payouts WHERE created_at >= $1::date AND created_at < $2::date + 1)::bigint AS payouts,
    (SELECT COALESCE(sum(credit_paise),0) FROM ledger_entries WHERE account='bank_payouts' AND at >= $1::date AND at < $2::date + 1)::bigint AS ledger`, range);
  if (Number(po.payouts) !== Number(po.ledger)) issues.push({ severity: "high", check: "Payouts match the ledger", detail: `Payout records ₹${(Number(po.payouts) / 100).toFixed(2)}, ledger ₹${(Number(po.ledger) / 100).toFixed(2)}` });
  for (const r of await q<any>("SELECT c.display_name, (SELECT COALESCE(sum(credit_paise - debit_paise),0) FROM ledger_entries l WHERE l.account='caregiver:'||c.id)::bigint AS bal FROM caregivers c"))
    if (Number(r.bal) < 0) issues.push({ severity: "high", check: "No caregiver is paid more than she earned", detail: `${r.display_name}: balance ₹${(Number(r.bal) / 100).toFixed(2)}` });
  // 6. Every booking that took money has an invoice.
  for (const r of await q<any>(`SELECT b.id, b.code FROM bookings b WHERE ${inRange} AND b.paid_paise > 0 AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.booking_id=b.id)`, range)) {
    await ensureInvoices(r.id).catch(() => {});
    if (!(await one("SELECT 1 FROM invoices WHERE booking_id=$1", [r.id]))) issues.push({ severity: "low", check: "Paid bookings have an invoice", booking: r.code, detail: "No invoice in the register" });
  }
  // 7. Razorpay, when connected: every captured payment there is known here.
  let gatewayChecked = false, gatewayNote = "Razorpay is not connected, so payments were checked only against Uday's own records.";
  const rz = await cfg("razorpay");
  if (rz?.keyId) {
    try {
      const auth = "Basic " + Buffer.from(`${rz.keyId}:${rz.keySecret}`).toString("base64");
      const fromTs = Math.floor(Date.parse(from + "T00:00:00+05:30") / 1000), toTs = Math.floor(Date.parse(to + "T23:59:59+05:30") / 1000);
      let skip = 0, seen = 0;
      for (;;) {
        const r = await fetch(`https://api.razorpay.com/v1/payments?from=${fromTs}&to=${toTs}&count=100&skip=${skip}`, { headers: { Authorization: auth } });
        if (!r.ok) throw new Error(`Razorpay answered ${r.status}`);
        const items = ((await r.json()) as any).items ?? [];
        for (const p of items) {
          seen++;
          if (p.status !== "captured" && p.status !== "refunded") continue;
          const mine = await one<any>("SELECT captured_paise FROM payments WHERE payment_id=$1 OR gateway_ref=$1 OR gateway_ref=$2", [p.id, p.order_id ?? ""]);
          const cyc = mine ? null : await one("SELECT 1 FROM billing_cycles WHERE gateway_ref=$1 OR order_ref=$2", [p.id, p.order_id ?? ""]);
          const man = mine || cyc ? null : await one("SELECT 1 FROM mandates WHERE order_ref=$1", [p.order_id ?? ""]);
          if (!mine && !cyc && !man) issues.push({ severity: "high", check: "Razorpay payments are known to Uday", detail: `${p.id} for ₹${(p.amount / 100).toFixed(2)} is not in Uday's records` });
        }
        if (items.length < 100 || skip > 5000) break; skip += 100;
      }
      gatewayChecked = true; gatewayNote = `${seen} Razorpay payments checked.`;
    } catch (e: any) { gatewayNote = "Razorpay check failed: " + String(e?.message ?? e).slice(0, 160); issues.push({ severity: "medium", check: "Razorpay check", detail: gatewayNote }); }
  }
  const totals = await one<any>(`SELECT
    (SELECT COALESCE(sum(debit_paise),0) FROM ledger_entries WHERE account='family_payments' AND at >= $1::date AND at < $2::date + 1)::bigint AS collected,
    (SELECT COALESCE(sum(credit_paise),0) FROM ledger_entries WHERE account='family_refunds' AND at >= $1::date AND at < $2::date + 1)::bigint AS refunded,
    (SELECT COALESCE(sum(credit_paise),0) FROM ledger_entries WHERE account='uday_fee' AND at >= $1::date AND at < $2::date + 1)::bigint AS fees,
    (SELECT COALESCE(sum(credit_paise),0) FROM ledger_entries WHERE account='gst_payable' AND at >= $1::date AND at < $2::date + 1)::bigint AS gst,
    (SELECT COALESCE(sum(credit_paise),0) FROM ledger_entries WHERE account LIKE 'caregiver:%' AND reason NOT LIKE 'weekly payout%' AND at >= $1::date AND at < $2::date + 1)::bigint AS caregiver_earned,
    (SELECT COALESCE(sum(credit_paise),0) FROM ledger_entries WHERE account='bank_payouts' AND at >= $1::date AND at < $2::date + 1)::bigint AS paid_out,
    (SELECT COALESCE(sum(debit_paise),0) FROM ledger_entries WHERE account='uday_goodwill' AND at >= $1::date AND at < $2::date + 1)::bigint AS goodwill,
    (SELECT COALESCE(sum(credit_paise - debit_paise),0) FROM ledger_entries WHERE account='escrow')::bigint AS escrow_now`, range);
  const summary = { ...Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Number(v)])), gatewayChecked, gatewayNote, issues: issues.length, high: issues.filter((i) => i.severity === "high").length };
  const run = await one<{ id: string; created_at: string }>("INSERT INTO recon_runs (from_day, to_day, run_by, summary, issues) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at", [from, to, u.id, summary, JSON.stringify(issues)]);
  await audit(u.id, "run", "reconciliation", run!.id, `${from} to ${to}: ${issues.length} issues`);
  return { id: run!.id, at: run!.created_at, from, to, summary, issues };
}
export async function reconRuns() {
  return q("SELECT r.id, r.from_day, r.to_day, r.summary, r.issues, r.created_at, u.name FROM recon_runs r LEFT JOIN users u ON u.id=r.run_by ORDER BY r.created_at DESC LIMIT 20");
}

// ───────── payouts ─────────
export async function payouts() {
  const due = await q<any>(`SELECT c.id, c.display_name, c.bank_last4, c.bank_ref IS NOT NULL AS has_bank, (c.bank_changed_at > now() - interval '48 hours') AS bank_recent,
      (SELECT COALESCE(sum(credit_paise - debit_paise),0) FROM ledger_entries l WHERE l.account='caregiver:'||c.id)::bigint AS balance
    FROM caregivers c ORDER BY 5 DESC`);
  const recent = await q("SELECT p.id, c.display_name, p.amount_paise, p.status, p.bank_last4, p.created_at, p.paid_at, p.gateway_ref FROM payouts p JOIN caregivers c ON c.id=p.caregiver_id ORDER BY p.created_at DESC LIMIT 50");
  return { due: due.filter((d) => Number(d.balance) !== 0).map((d) => ({ ...d, balance: Number(d.balance) })), recent };
}
export async function runPayoutsNow(u: SessionUser) { const r = await runPayouts(); await audit(u.id, "run", "payouts", null, `${r.paid} paid`); return r; }
export type { OpsRole };
