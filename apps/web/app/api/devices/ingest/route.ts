export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { ingest } from "@/lib/readings";
const I = z.object({ device: z.string(), recipientId: z.string().uuid().optional(), readings: z.array(z.object({ kind: z.string(), value: z.number(), at: z.string() })).max(500) });
export const POST = handle(async (req: Request) => { const i = I.parse(await body(req)); return ingest(await requireUser("senior", "family"), i.device, i.readings, i.recipientId); });
