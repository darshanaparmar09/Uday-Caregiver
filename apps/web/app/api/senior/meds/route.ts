export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { meds, markDose, addMedicine, MedIn } from "@/lib/senior";
const I = z.discriminatedUnion("action", [z.object({ action: z.literal("taken"), key: z.string(), slot: z.string(), taken: z.boolean().default(true) }), MedIn.extend({ action: z.literal("add") })]);
export const GET = handle(async () => meds(await requireUser("senior")));
export const POST = handle(async (req: Request) => { const u = await requireUser("senior"); const i = I.parse(await body(req)); return i.action === "add" ? addMedicine(u, i) : markDose(u, i.key, i.slot, i.taken); });
