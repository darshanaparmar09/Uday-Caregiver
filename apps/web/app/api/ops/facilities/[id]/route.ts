export const dynamic = "force-dynamic";
import { requireOps, audit } from "@/lib/ops";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { opsReview } from "@/lib/facilities";
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => { const u = await requireOps("people"); const i = z.object({ status: z.enum(["live", "suspended"]), licenceVerified: z.boolean().optional() }).parse(await body(req)); await opsReview(i.status, params.id, i.licenceVerified); await audit(u.id, "facility_" + i.status, "facility", params.id, i.licenceVerified != null ? `licence verified: ${i.licenceVerified}` : undefined); return { ok: true }; });
