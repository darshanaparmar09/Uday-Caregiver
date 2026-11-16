export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sweepOffers } from "@/lib/bookings";
import { sweepMissedCheckins } from "@/lib/people";
import { runPayouts } from "@/lib/caregiver";
import { handle } from "@/lib/http";
// Call every minute from the host's scheduler with header x-cron-secret. Weekly payouts: POST /api/cron?job=payouts every Monday 10:00 IST.
export const POST = handle(async (req: Request) => {
  if (!process.env.CRON_SECRET || req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (new URL(req.url).searchParams.get("job") === "payouts") return runPayouts();
  return { offersExpired: await sweepOffers(), missedCheckins: await sweepMissedCheckins() };
});
