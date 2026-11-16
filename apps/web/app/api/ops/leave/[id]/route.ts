export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import * as cg from "@/lib/caregiver";
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => { const { approve } = z.object({ approve: z.boolean() }).parse(await body(req)); await cg.decideLeave(await requireUser("ops"), params.id, approve); return { ok: true }; });
