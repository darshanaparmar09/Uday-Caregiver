export const dynamic = "force-dynamic";
import { requireOps } from "@/lib/ops";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import * as cg from "@/lib/caregiver";
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => { const { tier } = z.object({ tier: z.number().int().min(1).max(3) }).parse(await body(req)); return cg.convertApplication(await requireOps("people"), params.id, tier); });
