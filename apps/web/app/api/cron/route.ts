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
import { TEST_MODE } from "@/lib/env";
// Call every minute from the host's scheduler with header x-cron-secret. Weekly payouts: POST /api/cron?job=payouts every Monday 10:00 IST.
export const POST = handle(async (req: Request) => {
  if (!process.env.CRON_SECRET || req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const job = new URL(req.url).searchParams.get("job");
  if (job === "payouts") return runPayouts();
  if (job === "renewals") return renewSubscriptions();
  // Weekly care billing. In test mode ?booking=<id> charges that booking's remaining weeks now.
  if (job === "billing") return sweepBilling(TEST_MODE ? new URL(req.url).searchParams.get("booking") ?? undefined : undefined);
  if (job === "relief") return sweepRelief();
  return { offersExpired: await sweepOffers(), missedCheckins: await sweepMissedCheckins(), noShows: await sweepNoShows(), relief: await sweepRelief(), billing: await sweepBilling(), checkinCalls: await sweepCheckinCalls(), unpaid: await sweepUnpaid() };
});
