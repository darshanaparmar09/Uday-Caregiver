export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { verifyCheckout } from "@/lib/checkout";
export const POST = handle(async (req: Request) => { const i = z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() }).parse(await body(req)); return verifyCheckout(await requireUser("family"), i.orderId, i.paymentId, i.signature); });
