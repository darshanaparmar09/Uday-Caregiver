export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import * as cg from "@/lib/caregiver";
const I = z.object({ stage: z.number().int(), status: z.enum(["clear", "not_clear", "pending"]), note: z.string().max(200).optional() });
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => { const i = I.parse(await body(req)); await cg.opsSetStage(await requireUser("ops"), params.id, i.stage, i.status, i.note); return { ok: true }; });
