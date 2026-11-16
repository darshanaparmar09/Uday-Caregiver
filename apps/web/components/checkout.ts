"use client";
import { api } from "./api";
/** Opens Razorpay Checkout for an order, then verifies the signature on the server. recurring: saves an auto pay mandate. */
export async function payOnGateway(ck: { orderId: string; keyId: string; amountPaise: number; name: string; description: string; customerId?: string; recurring?: boolean }) {
  if (!(window as any).Razorpay) await new Promise<void>((res, rej) => { const sc = document.createElement("script"); sc.src = "https://checkout.razorpay.com/v1/checkout.js"; sc.onload = () => res(); sc.onerror = () => rej(new Error("Could not open the payment page")); document.body.appendChild(sc); });
  return new Promise<any>((res, rej) => {
    const rz = new (window as any).Razorpay({ key: ck.keyId, order_id: ck.orderId, amount: ck.amountPaise, currency: "INR", name: ck.name, description: ck.description,
      ...(ck.recurring ? { customer_id: ck.customerId, recurring: "1" } : {}),
      handler: (r: any) => api("/api/payments/verify", { body: { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature } }).then(res).catch(rej),
      modal: { ondismiss: () => rej(new Error("Payment was not completed.")) } });
    rz.open();
  });
}
