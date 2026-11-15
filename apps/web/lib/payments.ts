import { TEST_MODE } from "./env";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Payment gateway adapter. Uday never sees card numbers or UPI PINs: the family pays on the gateway's
 * hosted checkout, and the server only receives references and webhooks.
 *
 * Flow required by the Platform Specification:
 *   hold (authorise) on request -> capture when a caregiver accepts -> release if nobody accepts
 *   -> refund unused days on cancel. Split payouts to caregivers through the gateway's marketplace product.
 *
 * GATEWAY=mock   : test mode, used in development and automated tests. Moves no money.
 * GATEWAY=razorpay: skeleton below. Complete once the gateway is chosen after quotes.
 */
export interface HoldResult { gatewayRef: string; checkoutUrl?: string; status: "held" | "pending_customer" }
export interface Gateway {
  name: string;
  hold(amountPaise: number, receipt: string, method: string): Promise<HoldResult>;
  capture(gatewayRef: string, amountPaise: number): Promise<void>;
  release(gatewayRef: string): Promise<void>;
  refund(gatewayRef: string, amountPaise: number): Promise<void>;
  verifyWebhook(rawBody: string, signature: string): boolean;
}

class MockGateway implements Gateway {
  name = "mock";
  async hold(amountPaise: number) { if (amountPaise <= 0) throw new Error("bad amount"); return { gatewayRef: "mock_" + randomUUID(), status: "held" as const }; }
  async capture() {}
  async release() {}
  async refund() {}
  verifyWebhook() { return true; }
}

class RazorpayGateway implements Gateway {
  name = "razorpay";
  private auth = "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  private async call(path: string, body: unknown) {
    const r = await fetch("https://api.razorpay.com/v1" + path, { method: "POST", headers: { Authorization: this.auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Razorpay ${path} failed: ${r.status}`);
    return r.json();
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
  verifyWebhook(rawBody: string, signature: string) {
    const exp = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET ?? "").update(rawBody).digest("hex");
    return exp.length === signature.length && timingSafeEqual(Buffer.from(exp), Buffer.from(signature));
  }
}

export function gateway(): Gateway {
  const g = process.env.GATEWAY ?? "mock";
  if (g === "mock") {
    if (!TEST_MODE) throw new Error("Mock payments are disabled in production");
    return new MockGateway();
  }
  if (g === "razorpay") return new RazorpayGateway();
  throw new Error(`Unknown GATEWAY ${g}`);
}
