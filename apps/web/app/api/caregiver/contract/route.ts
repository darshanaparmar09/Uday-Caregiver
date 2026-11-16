export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import * as cg from "@/lib/caregiver";
const I = z.object({ signedName: z.string().max(80), device: z.string().max(80).optional() });
export const POST = handle(async (req: Request) => { const i = I.parse(await body(req)); await cg.signContract(await requireUser("caregiver"), i.signedName, i.device); return { ok: true }; });
