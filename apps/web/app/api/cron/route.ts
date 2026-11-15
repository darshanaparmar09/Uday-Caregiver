export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sweepOffers } from "@/lib/bookings";
import { sweepMissedCheckins } from "@/lib/people";
import { handle } from "@/lib/http";
// Call every minute from the host's scheduler with header x-cron-secret.
export const POST = handle(async (req: Request) => {
  if (!process.env.CRON_SECRET || req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return { offersExpired: await sweepOffers(), missedCheckins: await sweepMissedCheckins() };
});
