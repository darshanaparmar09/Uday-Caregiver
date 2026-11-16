import { q } from "./db";
import { TEST_MODE } from "./env";
import { pushToUser, type PushMessage } from "./push";
import { sendSmsAuto, sendWhatsApp } from "./providers";
import { dec } from "./crypto";

/**
 * Notifications. Every message is recorded in the notifications table; delivery goes through a provider.
 * Providers to connect (Onboarding Specification, integrations): SMS for OTP, WhatsApp Business API,
 * push (Expo push service or Firebase), email. Until configured, messages are logged, not sent.
 */
export type Template =
  | "booking_requested" | "booking_offer" | "booking_accepted" | "booking_proposal" | "booking_released"
  | "caregiver_enroute" | "caregiver_arrived" | "shift_started" | "shift_log" | "shift_ended"
  | "booking_cancelled" | "rate_request" | "ticket_opened" | "checkin_ok" | "checkin_help" | "checkin_missed" | "sos" | "payout_paid" | "leave_decided" | "stage_updated" | "vitals_alert" | "visit_requested" | "visit_updated" | "facility_review" | "checkin_medical" | "checkin_lonely" | "checkin_reminder" | "safety_report" | "callback_request" | "namaste" | "senior_event" | "day_closed" | "caregiver_back" | "extension_request" | "extension_accepted" | "extension_declined" | "shift_reminder" | "caregiver_late" | "relief_offer" | "relief_assigned" | "relief_unfilled" | "payment_failed" | "payment_taken" | "intro_request" | "intro_confirmed" | "intro_declined" | "new_message";

export async function notify(userId: string | null, template: Template, payload: Record<string, unknown> = {}, channel: "push" | "whatsapp" | "sms" | "email" = "push") {
  await q("INSERT INTO notifications (user_id, channel, template, payload) VALUES ($1,$2,$3,$4)", [userId, channel, template, payload]);
  if (process.env.NOTIFY_LOG === "1") console.log(`[notify] ${channel} ${template} -> ${userId}`, payload);
  const m = PUSH_TEXT[template];
  if (userId && m) await pushToUser(userId, { ...m, data: { template, ...payload } }).catch((e) => console.error("push failed", e.message));
  // Urgent family alerts also go by WhatsApp or SMS, so they reach phones without the app.
  if (userId && m && (channel === "sms" || channel === "whatsapp")) {
    const u = (await q<{ phone_enc: string }>("SELECT phone_enc FROM users WHERE id=$1", [userId]))[0]; const phone = u ? dec(u.phone_enc) : null;
    if (phone) { const send = channel === "whatsapp" ? sendWhatsApp(phone, `uday_${template}`, []) : sendSmsAuto(phone, `Uday: ${m.title}. ${m.body}`);
      await send.catch((e) => console.error(`${channel} failed`, e.message)); }
  }
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
  checkin_medical: { title: "Medical help needed", body: "Your parent asked for medical help. Call them now. If serious, call 112.", urgent: true },
  checkin_lonely: { title: "A call would help today", body: "Your parent said they feel lonely. A call from you would mean a lot." },
  checkin_reminder: { title: "Good morning", body: "Tap the sun to tell your family you are well." },
  safety_report: { title: "Safety report", body: "Your parent reported fraud or a crime in Uday. Please call them.", urgent: true },
  namaste: { title: "Someone said namaste", body: "Open Uday to say namaste back." },
  senior_event: { title: "Your parent is going to an event", body: "They have signed up for an Uday community event." },
  day_closed: { title: "Today's care is done", body: "Read the care log. Was everything well today?" },
  caregiver_back: { title: "Your caregiver is back", body: "She is back after her day off." },
  extension_request: { title: "Family wants you to continue", body: "Open Uday to accept or decline within 24 hours.", urgent: true },
  extension_accepted: { title: "Care extended", body: "Your caregiver will continue. Open Uday for details." },
  extension_declined: { title: "Caregiver cannot continue", body: "Uday can find another caregiver for you." },
  shift_reminder: { title: "Your shift starts in one hour", body: "Tap Start travel when you leave." },
  caregiver_late: { title: "Caregiver not arrived yet", body: "Uday is calling her now. You can ask for a replacement in the app.", urgent: true },
  relief_offer: { title: "Relief day available", body: "Cover a live in caregiver's day off. Open Uday to accept.", urgent: true },
  relief_assigned: { title: "Day off covered", body: "A relief caregiver will cover your caregiver's day off." },
  relief_unfilled: { title: "Day off not covered", body: "We could not find a relief caregiver. Your regular caregiver stays, and Uday will call you." },
  payment_failed: { title: "Payment did not go through", body: "Next week's care payment failed. Please update your payment in Uday.", urgent: true },
  payment_taken: { title: "Weekly payment received", body: "Thank you. Next week's care is paid." },
  intro_request: { title: "A family wants to meet you", body: "Choose a time for a short video call." },
  intro_confirmed: { title: "Intro call confirmed", body: "Open Uday for the time and link." },
  intro_declined: { title: "Intro call not possible", body: "The caregiver cannot do these times. Try other times or another caregiver." },
  new_message: { title: "New message", body: "Open Uday to read it." },
  checkin_missed: { title: "No check in yet", body: "Your parent has not checked in today.", urgent: true },
  vitals_alert: { title: "Check on your parent", body: "Today's readings were outside the usual range. Open Uday for details.", urgent: true },
  visit_requested: { title: "New visit request", body: "A family wants to visit. Open Uday to confirm." },
  visit_updated: { title: "Facility visit update", body: "Your visit request was updated." },
  payout_paid: { title: "Payout sent", body: "This week's earnings are on the way to your bank." },
  leave_decided: { title: "Leave request updated", body: "Open Uday to see the decision." },
};

export async function sendOtp(phoneE164: string, code: string) {
  await sendSmsAuto(phoneE164, "", { otp: code });
}
