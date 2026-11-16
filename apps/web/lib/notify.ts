import { q } from "./db";
import { TEST_MODE } from "./env";
import { pushToUser, type PushMessage } from "./push";

/**
 * Notifications. Every message is recorded in the notifications table; delivery goes through a provider.
 * Providers to connect (Onboarding Specification, integrations): SMS for OTP, WhatsApp Business API,
 * push (Expo push service or Firebase), email. Until configured, messages are logged, not sent.
 */
export type Template =
  | "booking_requested" | "booking_offer" | "booking_accepted" | "booking_proposal" | "booking_released"
  | "caregiver_enroute" | "caregiver_arrived" | "shift_started" | "shift_log" | "shift_ended"
  | "booking_cancelled" | "rate_request" | "ticket_opened" | "checkin_ok" | "checkin_help" | "checkin_missed" | "sos" | "payout_paid" | "leave_decided" | "stage_updated" | "vitals_alert" | "visit_requested" | "visit_updated" | "facility_review";

export async function notify(userId: string | null, template: Template, payload: Record<string, unknown> = {}, channel: "push" | "whatsapp" | "sms" | "email" = "push") {
  await q("INSERT INTO notifications (user_id, channel, template, payload) VALUES ($1,$2,$3,$4)", [userId, channel, template, payload]);
  if (process.env.NOTIFY_LOG === "1") console.log(`[notify] ${channel} ${template} -> ${userId}`, payload);
  const m = PUSH_TEXT[template];
  if (userId && m) await pushToUser(userId, { ...m, data: { template, ...payload } }).catch((e) => console.error("push failed", e.message));
}

/** Short, plain messages. Urgent ones wake the phone with high priority. */
const PUSH_TEXT: Partial<Record<Template, PushMessage>> = {
  booking_offer: { title: "New care request", body: "Open Uday to accept or decline before the timer ends.", urgent: true },
  booking_accepted: { title: "Caregiver confirmed", body: "Your booking is confirmed." },
  booking_proposal: { title: "Your approval needed", body: "Uday has found another caregiver of the same tier." },
  booking_released: { title: "Request closed", body: "No caregiver was available. Your payment hold is released." },
  caregiver_enroute: { title: "Caregiver on the way", body: "Your caregiver has started travelling." },
  caregiver_arrived: { title: "Caregiver at the door", body: "Open Uday to see the start code.", urgent: true },
  shift_log: { title: "New shift log", body: "Today's care notes are ready." },
  rate_request: { title: "Care completed", body: "Please rate the care." },
  booking_cancelled: { title: "Booking cancelled", body: "A booking was cancelled." },
  checkin_help: { title: "Help requested", body: "Your parent asked for help. Please call them now.", urgent: true },
  checkin_missed: { title: "No check in yet", body: "Your parent has not checked in today.", urgent: true },
  vitals_alert: { title: "Check on your parent", body: "Today's readings were outside the usual range. Open Uday for details.", urgent: true },
  visit_requested: { title: "New visit request", body: "A family wants to visit. Open Uday to confirm." },
  visit_updated: { title: "Facility visit update", body: "Your visit request was updated." },
  payout_paid: { title: "Payout sent", body: "This week's earnings are on the way to your bank." },
  leave_decided: { title: "Leave request updated", body: "Open Uday to see the decision." },
};

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
