export const dynamic = "force-dynamic";
import { requireOps } from "@/lib/ops";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { setPartnerActive } from "@/lib/partners";
export const PATCH = handle(async (req: Request, { params }: { params: { id: string } }) => { await requireOps("people"); return setPartnerActive(params.id, z.object({ active: z.boolean() }).parse(await body(req)).active); });
