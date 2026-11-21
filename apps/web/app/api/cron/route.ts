export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sweepOffers } from "@/lib/bookings";
import { sweepMissedCheckins } from "@/lib/people";
import { runPayouts } from "@/lib/caregiver";
import { renewSubscriptions } from "@/lib/facilities";
import { handle } from "@/lib/http";
import { sweepBilling, sweepNoShows, sweepRelief } from "@/lib/care";
import { sweepCheckinCalls } from "@/lib/family";
import { sweepUnpaid } from "@/lib/checkout";
import { sweepAlerts } from "@/lib/alerts";
import { sweepAppointments } from "@/lib/appointments";
import { sweepVoice } from "@/lib/voice";
import { runJob, sweepRetention } from "@/lib/cron";
import { TEST_MODE } from "@/lib/env";
import { sameSecret } from "@/lib/ratelimit";
// Call every minute from the host's scheduler with header x-cron-secret. Weekly payouts: POST /api/cron?job=payouts every Monday 10:00 IST.
// Each job runs on its own (lib/cron.ts): one failing job never stops the safety jobs, and every run leaves a heartbeat.
export const POST = handle(async (req: Request) => {
  if (!sameSecret(req.headers.get("x-cron-secret"), process.env.CRON_SECRET)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const job = new URL(req.url).searchParams.get("job");
  if (job === "payouts") return runJob("payouts", runPayouts);
  if (job === "renewals") return runJob("renewals", renewSubscriptions);
  // Weekly care billing. In test mode ?booking=<id> charges that booking's remaining weeks now.
  if (job === "billing") return runJob("billing", () => sweepBilling(TEST_MODE ? new URL(req.url).searchParams.get("booking") ?? undefined : undefined));
  if (job === "relief") return runJob("relief", sweepRelief);
  // Safety first: alerts and missed check ins run before anything that talks to a payment gateway.
  return {
    alerts: await runJob("alerts", sweepAlerts), missedCheckins: await runJob("missed_checkins", sweepMissedCheckins), checkinCalls: await runJob("checkin_calls", sweepCheckinCalls),
    noShows: await runJob("no_shows", sweepNoShows), offersExpired: await runJob("offers", sweepOffers), relief: await runJob("relief", sweepRelief),
    unpaid: await runJob("unpaid", sweepUnpaid), billing: await runJob("billing", () => sweepBilling()), retention: await runJob("retention", sweepRetention),
    appointments: await runJob("appointments", sweepAppointments), voice: await runJob("voice_retention", sweepVoice),
  };
});
