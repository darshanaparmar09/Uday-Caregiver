import { offerWindowMinutes, shiftStart } from "@uday/core";
import { one, q, tx } from "./db";
import { gateway } from "./payments";
import { policyNow } from "./settings";
import { cyclePaid, cycleFailed, mandateAuthorised } from "./care";
import { notify } from "./notify";
import { AppError, familyRole } from "./bookings";
import type { SessionUser } from "./auth";

/**
 * Live gateway checkout. The booking waits as "offered" without a timer until the family authorises payment
 * on the gateway's page; then the caregiver is alerted and the answer window starts.
 */
export async function authorised(orderId: string, paymentId: string) {
  return tx(async (c) => {
    const p = (await c.query("SELECT * FROM payments WHERE gateway_ref=$1 FOR UPDATE", [orderId])).rows[0];
    if (!p) throw new AppError("Payment not found", 404);
    if (p.status !== "pending") return { bookingId: p.booking_id, already: true };
    const b = (await c.query("SELECT b.*, cg.user_id AS cg_user FROM bookings b JOIN caregivers cg ON cg.id=b.caregiver_id WHERE b.id=$1 FOR UPDATE", [p.booking_id])).rows[0];
    await c.query("UPDATE payments SET status='held', payment_id=$2, updated_at=now() WHERE id=$1", [p.id, paymentId]);
    const start = shiftStart(String(b.start_date instanceof Date ? b.start_date.toISOString() : b.start_date).slice(0, 10), String(b.start_time).slice(0, 5), 0);
    const win = Number(process.env.OFFER_WINDOW_MINUTES) || offerWindowMinutes(start, new Date(), await policyNow());
    await c.query("UPDATE bookings SET offer_expires_at=now() + ($2 || ' minutes')::interval WHERE id=$1", [b.id, String(win)]);
    await c.query("INSERT INTO booking_events (booking_id, actor_role, message) VALUES ($1,'system','Payment authorised. Request sent to the caregiver.')", [b.id]);
    if (b.cg_user) await notify(b.cg_user, "booking_offer", { bookingId: b.id });
    return { bookingId: b.id };
  });
}
export async function verifyCheckout(u: SessionUser, orderId: string, paymentId: string, signature: string) {
  if (!(await gateway()).verifyPayment(orderId, paymentId, signature)) throw new AppError("Payment could not be verified", 400);
  // Auto pay authorisation, or a week paid by hand.
  const m = await one<any>("SELECT booking_id FROM mandates WHERE order_ref=$1 AND user_id=$2", [orderId, u.id]);
  if (m) return mandateAuthorised(orderId, paymentId);
  const y = await one<any>("SELECT y.id, b.care_recipient_id FROM billing_cycles y JOIN bookings b ON b.id=y.booking_id WHERE y.order_ref=$1", [orderId]);
  if (y) { if (!(await familyRole(u.id, y.care_recipient_id))) throw new AppError("Not found", 404); await cyclePaid(y.id, paymentId); return { paid: true }; }
  const p = await one<any>("SELECT p.booking_id, b.care_recipient_id FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE p.gateway_ref=$1", [orderId]);
  if (!p || !(await familyRole(u.id, p.care_recipient_id))) throw new AppError("Not found", 404);
  return authorised(orderId, paymentId);
}
/** Gateway webhook: payment authorised or failed. */
export async function webhook(raw: string, signature: string) {
  if (!(await gateway()).verifyWebhook(raw, signature)) throw new AppError("Bad signature", 400);
  const e = JSON.parse(raw); const pay = e?.payload?.payment?.entity;
  if (String(e.event ?? "").startsWith("subscription.") && e.payload?.subscription?.entity?.id) {
    const { plusWebhook } = await import("./family"); if (await plusWebhook(e.event, e.payload.subscription.entity)) return { ok: true };
  }
  if (pay?.order_id && ["payment.authorized", "payment.captured"].includes(e.event)) {
    if (await one("SELECT 1 FROM mandates WHERE order_ref=$1", [pay.order_id])) return (await mandateAuthorised(pay.order_id, pay.id)) ?? { ok: true };
    const y = await one<any>("SELECT id FROM billing_cycles WHERE order_ref=$1 OR gateway_ref=$2", [pay.order_id, pay.id]);
    if (y) { await cyclePaid(y.id, pay.id); return { ok: true }; }
    if (e.event === "payment.authorized") return authorised(pay.order_id, pay.id);
    return { ok: true };
  }
  if (e.event === "payment.failed" && pay?.id && (await cycleFailed(pay.id))) return { ok: true };
  if (e.event === "payment.failed" && pay?.order_id) {
    const p = await one<any>("SELECT p.booking_id, b.payer_id FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE p.gateway_ref=$1", [pay.order_id]);
    if (p) { await q("INSERT INTO booking_events (booking_id, actor_role, message) VALUES ($1,'system','Payment failed. Please try again.')", [p.booking_id]); await notify(p.payer_id, "payment_failed", { bookingId: p.booking_id }); }
  }
  return { ok: true };
}
/** Unpaid requests close after 30 minutes. */
export async function sweepUnpaid() {
  const rows = await q<{ booking_id: string }>(`SELECT p.booking_id FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE p.status='pending' AND b.status='offered' AND p.created_at < now() - interval '30 minutes'`);
  for (const r of rows) { await q("UPDATE bookings SET status='released', updated_at=now() WHERE id=$1", [r.booking_id]); await q("UPDATE payments SET status='released' WHERE booking_id=$1 AND status='pending'", [r.booking_id]);
    await q("INSERT INTO booking_events (booking_id, actor_role, to_status, message) VALUES ($1,'system','released','Payment was not completed in 30 minutes. Request closed.')", [r.booking_id]); }
  return rows.length;
}
