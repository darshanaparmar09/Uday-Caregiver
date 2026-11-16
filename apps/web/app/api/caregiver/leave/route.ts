export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import * as cg from "@/lib/caregiver";
const I = z.object({ from: z.string(), to: z.string(), reason: z.string().max(200).optional() });
export const POST = handle(async (req: Request) => { const i = I.parse(await body(req)); return cg.requestLeave(await requireUser("caregiver"), i.from, i.to, i.reason); });
