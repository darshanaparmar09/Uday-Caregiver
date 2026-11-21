export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { act, type Action } from "@/lib/bookings";
import { handle, body, once } from "@/lib/http";
import { afterCareRecord } from "@/lib/insights";
const I = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }), z.object({ action: z.literal("decline"), reason: z.string().min(2).max(120) }),
  z.object({ action: z.literal("approve") }), z.object({ action: z.literal("reject") }), z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("cg_cancel"), reason: z.string().max(200).optional() }),
  z.object({ action: z.literal("day_close") }), z.object({ action: z.literal("return"), code: z.string().regex(/^\d{4}$/) }),
  z.object({ action: z.literal("day_check"), day: z.number().int().min(1), ok: z.boolean(), note: z.string().max(500).optional() }),
  z.object({ action: z.literal("replace"), reason: z.string().max(200).optional() }),
  z.object({ action: z.literal("extend"), days: z.union([z.literal(7), z.literal(30)]) }), z.object({ action: z.literal("extension"), accept: z.boolean() }),
  z.object({ action: z.literal("reschedule"), startDate: z.string() }),
  z.object({ action: z.literal("enroute"), lat: z.number().optional(), lng: z.number().optional() }),
  z.object({ action: z.literal("arrive"), lat: z.number().optional(), lng: z.number().optional() }),
  z.object({ action: z.literal("start"), code: z.string().regex(/^\d{4}$/) }),
  z.object({ action: z.literal("log"), meal: z.boolean().optional(), meds: z.boolean().optional(), mood: z.string().max(40), note: z.string().max(1000).optional(),
    checklist: z.record(z.string().max(40), z.string().max(40)).optional(),
    vitals: z.object({ bpSys: z.number().int().min(50).max(260).optional(), bpDia: z.number().int().min(30).max(160).optional(), pulse: z.number().int().min(25).max(220).optional(),
      tempC: z.number().min(32).max(43).optional(), pain: z.number().int().min(0).max(10).optional(), skinConcern: z.boolean().optional(), appetite: z.enum(["normal", "low", "high"]).optional() }).optional() }),
  z.object({ action: z.literal("end"), code: z.string().regex(/^\d{4}$/) }),
  z.object({ action: z.literal("rate"), areas: z.record(z.string(), z.number().int().min(1).max(5)), tags: z.array(z.string().max(40)).max(8).default([]), note: z.string().max(1000).optional(), publicText: z.string().max(400).optional() }),
  z.object({ action: z.literal("ticket"), category: z.string().min(2).max(80), text: z.string().max(2000).optional() }),
]);
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const u = await requireUser(); const a = I.parse(await body(req)) as Action;
  const r = await once(req, u.id, () => act(u, params.id, a));
  // A care record changed: refresh the family's daily update and check the note for things a person should see.
  if (["log", "end", "day_close"].includes(a.action)) await afterCareRecord(params.id, a.action).catch((e) => console.error("[after care record]", e));
  return r;
});
