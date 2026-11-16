export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import * as cg from "@/lib/caregiver";
const I = z.object({ accountNumber: z.string(), ifsc: z.string(), holder: z.string().min(2).max(80) });
export const POST = handle(async (req: Request) => { const i = I.parse(await body(req)); return cg.bank(await requireUser("caregiver"), i.accountNumber, i.ifsc, i.holder); });
