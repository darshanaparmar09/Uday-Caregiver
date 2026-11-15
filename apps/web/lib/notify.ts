import { q } from "./db";
import { TEST_MODE } from "./env";

/**
 * Notifications. Every message is recorded in the notifications table; delivery goes through a provider.
 * Providers to connect (Onboarding Specification, integrations): SMS for OTP, WhatsApp Business API,
 * push (Expo push service or Firebase), email. Until configured, messages are logged, not sent.
 */
export type Template =
  | "booking_requested" | "booking_offer" | "booking_accepted" | "booking_proposal" | "booking_released"
  | "caregiver_enroute" | "caregiver_arrived" | "shift_started" | "shift_log" | "shift_ended"
  | "booking_cancelled" | "rate_request" | "ticket_opened" | "checkin_ok" | "checkin_help" | "checkin_missed" | "sos";

export async function notify(userId: string | null, template: Template, payload: Record<string, unknown> = {}, channel: "push" | "whatsapp" | "sms" | "email" = "push") {
  await q("INSERT INTO notifications (user_id, channel, template, payload) VALUES ($1,$2,$3,$4)", [userId, channel, template, payload]);
  if (process.env.NOTIFY_LOG === "1") console.log(`[notify] ${channel} ${template} -> ${userId}`, payload);
}

export async function sendOtp(phoneE164: string, code: string) {
  const provider = process.env.SMS_PROVIDER ?? "log";
  if (provider === "log") {
    if (!TEST_MODE) throw new Error("SMS_PROVIDER must be configured in production");
    console.log(`[otp] ${phoneE164.slice(0, 3)}******${phoneE164.slice(-2)} code ${code}`);
    return;
  }
  // Agency: implement the chosen SMS or WhatsApp OTP provider here (for example MSG91, Gupshup, Twilio Verify).
  throw new Error(`SMS provider ${provider} not implemented`);
}
