export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { customerKyc } from "@/lib/family";
export const POST = handle(async (req: Request) => { const i = z.object({ aadhaar: z.string(), consent: z.boolean() }).parse(await body(req)); return customerKyc(await requireUser("family"), i.aadhaar, i.consent); });
