export const dynamic = "force-dynamic";
import { requireOps } from "@/lib/ops";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { opsReview } from "@/lib/facilities";
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => { await requireOps("people"); const i = z.object({ status: z.enum(["live", "suspended"]), licenceVerified: z.boolean().optional() }).parse(await body(req)); await opsReview(i.status, params.id, i.licenceVerified); return { ok: true }; });
