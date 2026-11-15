export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { checkIn } from "@/lib/people";
import { handle, body } from "@/lib/http";
const I = z.object({ status: z.enum(["ok", "help"]), recipientId: z.string().uuid().optional() });
export const POST = handle(async (req: Request) => { const i = I.parse(await body(req)); return checkIn(await requireUser("senior", "family"), i.status, i.recipientId); });
