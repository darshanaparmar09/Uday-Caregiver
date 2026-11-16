export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { opsFamily, createCoupon, closeLead, CouponIn } from "@/lib/family";
const I = z.discriminatedUnion("action", [CouponIn.extend({ action: z.literal("coupon") }), z.object({ action: z.literal("lead_done"), id: z.string().uuid() })]);
export const GET = handle(async () => { await requireUser("ops"); return opsFamily(); });
export const POST = handle(async (req: Request) => { await requireUser("ops"); const i = I.parse(await body(req)); return i.action === "coupon" ? createCoupon(i) : closeLead(i.id); });
