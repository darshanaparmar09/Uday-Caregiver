export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { getBooking, sweepOffers } from "@/lib/bookings";
import { handle } from "@/lib/http";
export const GET = handle(async (_r: Request, { params }: { params: { id: string } }) => { const u = await requireUser(); await sweepOffers(); return getBooking(u, params.id); });
