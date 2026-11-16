export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createBooking, listBookings, sweepOffers } from "@/lib/bookings";
import { handle, body } from "@/lib/http";
const I = z.object({ recipientId: z.string().uuid(), caregiverId: z.string().uuid(), careType: z.enum(["day", "night", "live"]),
  days: z.number().int(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startTime: z.string().regex(/^\d{2}:\d{2}$/),
  method: z.enum(["UPI", "Card", "Net banking"]), note: z.string().max(500).optional(),
  careNeed: z.string().max(40), careNeedNote: z.string().max(200).optional(), homeCommitments: z.array(z.string().max(40)).max(30), dayOff: z.number().int().min(0).max(6).optional(), coupon: z.string().max(20).optional() });
export const GET = handle(async () => { const u = await requireUser("family", "caregiver"); await sweepOffers(); return listBookings(u); });
export const POST = handle(async (req: Request) => createBooking(await requireUser("family"), I.parse(await body(req))));
