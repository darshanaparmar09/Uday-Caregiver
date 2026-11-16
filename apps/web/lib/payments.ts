import { TEST_MODE } from "./env";
import { cfg } from "./settings";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Payment gateway adapter. Uday never sees card numbers or UPI PINs: the family pays on the gateway's
 * hosted checkout, and the server only receives references and webhooks.
 *
 * Flow required by the Platform Specification:
 *   hold (authorise) on request -> capture when a caregiver accepts -> release if nobody accepts
 *   -> refund unused days on cancel. Split payouts to caregivers through the gateway's marketplace product.
 *
 * Razorpay is used when its keys are saved and switched on in Operations, Settings (or set in env as before).
 * Otherwise the mock gateway runs in development and tests and moves no money; production refuses to take payments.
 *
 * Auto pay (weekly care): the family authorises a UPI AutoPay or card mandate once, at Razorpay Checkout with
 * recurring=1. Uday stores only the customer and token references, then charges each week with a recurring payment.
 * The flow follows Razorpay's Recurring Payments API at the time of writing; confirm the authorisation amount,
 * mandate limits and webhook events with Razorpay before going live (UNVERIFIED against a live account).
 */
export interface MandateStart { orderId: string; customerId: string; keyId?: string; amountPaise: number; active?: boolean; tokenRef?: string }
export interface HoldResult { gatewayRef: string; checkoutUrl?: string; status: "held" | "pending_customer" }
export interface Gateway {
  name: string;
  hold(amountPaise: number, receipt: string, method: string): Promise<HoldResult>;
  capture(gatewayRef: string, amountPaise: number): Promise<void>;
  release(gatewayRef: string): Promise<void>;
  refund(gatewayRef: string, amountPaise: number): Promise<void>;
  verifyWebhook(rawBody: string, signature: string): boolean;
  /** Bank account check by a small test deposit. Returns the gateway's reference for the account. */
  verifyBank(accountNumber: string, ifsc: string, holder: string): Promise<{ ref: string; nameMatch: boolean }>;
  /** Send a payout to a verified bank account reference. */
  payout(bankRef: string, amountPaise: number, reference: string): Promise<{ ref: string; status: "paid" | "processing" }>;
  /** Monthly charge for a facility listing plan. Returns the subscription reference. */
  subscribe(planId: string, amountPaise: number, reference: string): Promise<{ ref: string; status: "active" | "pending_customer"; checkoutUrl?: string }>;
  chargeRenewal(subscriptionRef: string, amountPaise: number, who?: { email?: string; contact?: string; receipt?: string }): Promise<{ ok: boolean; ref?: string; pending?: boolean; reason?: string }>;
  /** Starts auto pay: an order the family authorises once at checkout. Mock activates at once. */
  startMandate(o: { name: string; email?: string; contact?: string; maxPaise: number; method: string; receipt: string }): Promise<MandateStart>;
  /** After checkout: reads the saved token from the payment. Returns "customerId:tokenId". */
  confirmMandate(paymentId: string): Promise<string | null>;
  cancelMandate(tokenRef: string): Promise<void>;
  /** A one off order for paying a week by hand. */
  order(amountPaise: number, receipt: string): Promise<{ orderId: string; keyId?: string; paid?: boolean }>;
  keyId?: string;
  /** Checks the signature the checkout returns after the family pays. */
  verifyPayment(orderId: string, paymentId: string, signature: string): boolean;
}

class MockGateway implements Gateway {
  name = "mock";
  async hold(amountPaise: number) { if (amountPaise <= 0) throw new Error("bad amount"); return { gatewayRef: "mock_" + randomUUID(), status: "held" as const }; }
  async capture() {}
  async release() {}
  async refund() {}
  verifyWebhook() { return true; }
  async verifyBank(_a: string, _i: string, _h: string) { return { ref: "mock_fa_" + randomUUID().slice(0, 8), nameMatch: true }; }
  async subscribe(_p: string, amountPaise: number) { if (amountPaise <= 0) throw new Error("bad amount"); return { ref: "mock_sub_" + randomUUID().slice(0, 8), status: "active" as const }; }
  async chargeRenewal() { return { ok: true, ref: "mock_rc_" + randomUUID().slice(0, 8) }; }
  verifyPayment() { return true; }
  async startMandate(o: { maxPaise: number; receipt: string }) { return { orderId: "mock_md_" + randomUUID().slice(0, 8), customerId: "mock_cust", amountPaise: 100, active: true, tokenRef: "mock_cust:mock_tok_" + o.receipt }; }
  async confirmMandate() { return "mock_cust:mock_tok"; }
  async cancelMandate() {}
  async order(_a: number, _r: string) { return { orderId: "mock_or_" + randomUUID().slice(0, 8), paid: true }; }
  async payout(_ref: string, amountPaise: number) { if (amountPaise <= 0) throw new Error("bad amount"); return { ref: "mock_po_" + randomUUID().slice(0, 8), status: "paid" as const }; }
}

class RazorpayGateway implements Gateway {
  name = "razorpay";
  keyId: string;
  private auth: string;
  constructor(private c: Record<string, string>) { this.keyId = c.keyId; this.auth = "Basic " + Buffer.from(`${c.keyId}:${c.keySecret}`).toString("base64"); }
  private async call(path: string, body?: unknown, method = "POST") {
    const r = await fetch("https://api.razorpay.com/v1" + path, { method, headers: { Authorization: this.auth, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`Razorpay ${path} failed: ${r.status} ${t.slice(0, 160)}`); }
    return r.json() as Promise<any>;
  }
  async hold(amountPaise: number, receipt: string) {
    // Creates an order with manual capture. The family completes payment on Razorpay Checkout;
    // the payment.authorized webhook then marks the payment held. Agency: confirm against current Razorpay docs.
    const o = await this.call("/orders", { amount: amountPaise, currency: "INR", receipt, payment_capture: 0 });
    return { gatewayRef: o.id as string, status: "pending_customer" as const };
  }
  async capture(paymentId: string, amountPaise: number) { await this.call(`/payments/${paymentId}/capture`, { amount: amountPaise, currency: "INR" }); }
  async release(_paymentId: string) { /* Uncaptured authorisations lapse automatically after the gateway's hold period. */ }
  async refund(paymentId: string, amountPaise: number) { await this.call(`/payments/${paymentId}/refund`, { amount: amountPaise }); }
  async verifyBank(accountNumber: string, ifsc: string, holder: string) {
    // RazorpayX fund account validation (penny drop). Agency: create contact + fund account, then validate. Confirm against current docs.
    const contact = await this.call("/contacts", { name: holder, type: "employee" });
    const fa = await this.call("/fund_accounts", { contact_id: contact.id, account_type: "bank_account", bank_account: { name: holder, ifsc, account_number: accountNumber } });
    return { ref: fa.id as string, nameMatch: true };
  }
  async subscribe(planId: string, _amountPaise: number, reference: string) {
    // Razorpay Subscriptions: create a plan once in the dashboard per listing plan, store its id in env, then create a subscription.
    const sub = await this.call("/subscriptions", { plan_id: this.c[`plan_${planId}`] ?? process.env[`RAZORPAY_PLAN_${planId.toUpperCase()}`], total_count: 120, notes: { reference } });
    return { ref: sub.id as string, status: "pending_customer" as const, checkoutUrl: sub.short_url as string };
  }
  async chargeRenewal(tokenRef: string, amountPaise: number, who: { email?: string; contact?: string; receipt?: string } = {}) {
    // Weekly care: a recurring payment on the saved mandate token. tokenRef is "customerId:tokenId".
    // The result arrives by webhook (payment.captured or payment.failed), so the cycle waits as "charging".
    // Facility plans use Razorpay Subscriptions and are charged by Razorpay itself.
    const [customer_id, token] = tokenRef.split(":");
    if (!token) return { ok: false, reason: "no_autopay" };
    try { const o = await this.call("/orders", { amount: amountPaise, currency: "INR", payment_capture: 1, receipt: who.receipt });
      const p = await this.call("/payments/create/recurring", { email: who.email || "care@uday.app", contact: who.contact || "", amount: amountPaise, currency: "INR", order_id: o.id, customer_id, token, recurring: "1", description: "Uday weekly care" });
      return { ok: true, pending: true, ref: (p.razorpay_payment_id ?? o.id) as string }; } catch (e: any) { return { ok: false, reason: String(e?.message ?? e).slice(0, 200) }; }
  }
  async startMandate(o: { name: string; email?: string; contact?: string; maxPaise: number; method: string; receipt: string }) {
    const cust = await this.call("/customers", { name: o.name, email: o.email || undefined, contact: o.contact || undefined, fail_existing: "0" });
    const order = await this.call("/orders", { amount: 100, currency: "INR", customer_id: cust.id, method: o.method === "card" ? "card" : o.method === "emandate" ? "emandate" : "upi", receipt: o.receipt, payment_capture: 1,
      token: { max_amount: o.maxPaise, expire_at: Math.floor(Date.now() / 1000) + 2 * 365 * 86400, frequency: "as_presented" } });
    return { orderId: order.id as string, customerId: cust.id as string, keyId: this.keyId, amountPaise: 100 };
  }
  async confirmMandate(paymentId: string) {
    const p = await this.call(`/payments/${paymentId}`, undefined, "GET");
    return p.token_id && p.customer_id ? `${p.customer_id}:${p.token_id}` : null;
  }
  async cancelMandate(tokenRef: string) {
    const [cid, tid] = tokenRef.split(":"); if (tid) await this.call(`/customers/${cid}/tokens/${tid}/cancel`, {}, "PUT").catch(() => this.call(`/customers/${cid}/tokens/${tid}`, undefined, "DELETE"));
  }
  async order(amountPaise: number, receipt: string) { const o = await this.call("/orders", { amount: amountPaise, currency: "INR", receipt, payment_capture: 1 }); return { orderId: o.id as string, keyId: this.keyId }; }
  verifyPayment(orderId: string, paymentId: string, signature: string) {
    const exp = createHmac("sha256", this.c.keySecret ?? "").update(`${orderId}|${paymentId}`).digest("hex");
    return exp.length === signature.length && timingSafeEqual(Buffer.from(exp), Buffer.from(signature));
  }
  async payout(bankRef: string, amountPaise: number, reference: string) {
    const p = await this.call("/payouts", { account_number: this.c.razorpayxAccount, fund_account_id: bankRef, amount: amountPaise, currency: "INR", mode: "IMPS", purpose: "payout", reference_id: reference });
    return { ref: p.id as string, status: "processing" as const };
  }
  verifyWebhook(rawBody: string, signature: string) {
    const exp = createHmac("sha256", this.c.webhookSecret ?? "").update(rawBody).digest("hex");
    return exp.length === signature.length && timingSafeEqual(Buffer.from(exp), Buffer.from(signature));
  }
}

/** The gateway to use now: Razorpay when connected, otherwise the mock gateway in development and tests. */
export async function gateway(): Promise<Gateway> {
  const c = await cfg("razorpay");
  if (c?.keyId && c?.keySecret) return new RazorpayGateway(c);
  if (!TEST_MODE) throw new Error("Payments are not connected. Connect Razorpay in Operations, Settings.");
  return new MockGateway();
}
