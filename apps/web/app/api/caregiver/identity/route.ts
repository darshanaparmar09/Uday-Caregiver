export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import * as cg from "@/lib/caregiver";
const I = z.object({ aadhaar: z.string().min(12).max(14), pan: z.string().length(10) });
export const POST = handle(async (req: Request) => { const i = I.parse(await body(req)); return cg.identity(await requireUser("caregiver"), i.aadhaar, i.pan); });
