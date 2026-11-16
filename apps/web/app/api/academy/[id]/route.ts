export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import * as cg from "@/lib/caregiver";
const I = z.object({ answers: z.array(z.number().int().min(0).max(9)).max(20) });
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => cg.attempt(await requireUser("caregiver"), params.id, I.parse(await body(req)).answers));
