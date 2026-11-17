export const dynamic = "force-dynamic";
import { requireOps, audit } from "@/lib/ops";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import * as cg from "@/lib/caregiver";
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => { const { approve } = z.object({ approve: z.boolean() }).parse(await body(req)); const u = await requireOps("people"); await cg.decideLeave(u, params.id, approve); await audit(u.id, approve ? "leave_approved" : "leave_declined", "leave", params.id); return { ok: true }; });
