export const dynamic = "force-dynamic";
import { requireOps, audit } from "@/lib/ops";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import * as cg from "@/lib/caregiver";
const I = z.object({ stage: z.number().int(), status: z.enum(["clear", "not_clear", "pending"]), note: z.string().max(200).optional() });
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => { const i = I.parse(await body(req)); const u = await requireOps("people"); await cg.opsSetStage(u, params.id, i.stage, i.status, i.note); await audit(u.id, "onboarding_stage", "caregiver", params.id, `stage ${i.stage}: ${i.status}${i.note ? " · " + i.note : ""}`); return { ok: true }; });
