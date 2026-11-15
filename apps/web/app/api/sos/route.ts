export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { sos } from "@/lib/people";
import { handle, body } from "@/lib/http";
const I = z.object({ bookingId: z.string().uuid().optional(), lat: z.number().optional(), lng: z.number().optional() });
export const POST = handle(async (req: Request) => { const i = I.parse(await body(req)); return sos(await requireUser(), i.bookingId, i.lat, i.lng); });
