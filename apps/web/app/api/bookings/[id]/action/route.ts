export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { act, type Action } from "@/lib/bookings";
import { handle, body } from "@/lib/http";
const I = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }), z.object({ action: z.literal("decline"), reason: z.string().min(2).max(120) }),
  z.object({ action: z.literal("approve") }), z.object({ action: z.literal("reject") }), z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("cg_cancel") }),
  z.object({ action: z.literal("reschedule"), startDate: z.string() }),
  z.object({ action: z.literal("enroute"), lat: z.number().optional(), lng: z.number().optional() }),
  z.object({ action: z.literal("arrive"), lat: z.number().optional(), lng: z.number().optional() }),
  z.object({ action: z.literal("start"), code: z.string().regex(/^\d{4}$/) }),
  z.object({ action: z.literal("log"), meal: z.boolean(), meds: z.boolean(), mood: z.string().max(40), note: z.string().max(1000).optional() }),
  z.object({ action: z.literal("end"), code: z.string().regex(/^\d{4}$/) }),
  z.object({ action: z.literal("rate"), stars: z.number().int().min(1).max(5), tags: z.array(z.string().max(40)).max(8).default([]), note: z.string().max(1000).optional() }),
  z.object({ action: z.literal("ticket"), category: z.string().min(2).max(80), text: z.string().max(2000).optional() }),
]);
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => act(await requireUser(), params.id, I.parse(await body(req)) as Action));
