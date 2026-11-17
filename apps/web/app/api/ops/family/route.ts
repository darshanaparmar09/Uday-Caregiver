export const dynamic = "force-dynamic";
import { requireOps, audit } from "@/lib/ops";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { opsFamily, createCoupon, closeLead, CouponIn } from "@/lib/family";
const I = z.discriminatedUnion("action", [CouponIn.extend({ action: z.literal("coupon") }), z.object({ action: z.literal("lead_done"), id: z.string().uuid() })]);
export const GET = handle(async () => { await requireOps("view"); return opsFamily(); });
export const POST = handle(async (req: Request) => { const i = I.parse(await body(req));
  // Coupons give money away: admin only (pricing), and always audited.
  const u = await requireOps(i.action === "coupon" ? "pricing" : "people");
  if (i.action === "coupon") { const r = await createCoupon(i); await audit(u.id, "coupon_created", "coupon", null, JSON.stringify(i).slice(0, 400)); return r; }
  await audit(u.id, "lead_done", "family_lead", i.id); return closeLead(i.id); });
