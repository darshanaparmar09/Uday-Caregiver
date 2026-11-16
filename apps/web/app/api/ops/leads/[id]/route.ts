export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { assignLead, sendLead } from "@/lib/partners";
import { closeLead } from "@/lib/family";
const I = z.discriminatedUnion("action", [z.object({ action: z.literal("assign"), partnerId: z.string().uuid().nullable() }), z.object({ action: z.literal("send") }), z.object({ action: z.literal("close") })]);
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => { await requireUser("ops"); const i = I.parse(await body(req));
  if (i.action === "assign") return assignLead(params.id, i.partnerId); if (i.action === "send") return sendLead(params.id); await closeLead(params.id); return { ok: true }; });
