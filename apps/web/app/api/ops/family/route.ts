export const dynamic = "force-dynamic";
import { requireOps } from "@/lib/ops";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { opsFamily, createCoupon, closeLead, CouponIn } from "@/lib/family";
const I = z.discriminatedUnion("action", [CouponIn.extend({ action: z.literal("coupon") }), z.object({ action: z.literal("lead_done"), id: z.string().uuid() })]);
export const GET = handle(async () => { await requireOps("view"); return opsFamily(); });
export const POST = handle(async (req: Request) => { await requireOps("people"); const i = I.parse(await body(req)); return i.action === "coupon" ? createCoupon(i) : closeLead(i.id); });
