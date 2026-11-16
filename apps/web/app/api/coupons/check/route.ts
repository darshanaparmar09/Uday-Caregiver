export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { checkCoupon } from "@/lib/family";
export const POST = handle(async (req: Request) => { const i = z.object({ code: z.string().max(20), ratePaise: z.number().int().positive(), days: z.number().int().positive() }).parse(await body(req)); return checkCoupon(await requireUser("family"), i.code, i.ratePaise, i.days); });
