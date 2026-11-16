export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { introAct } from "@/lib/care";
const I = z.discriminatedUnion("action", [z.object({ action: z.literal("choose"), slot: z.string() }), z.object({ action: z.literal("decline") }), z.object({ action: z.literal("cancel") }), z.object({ action: z.literal("done") })]);
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => introAct(await requireUser(), params.id, I.parse(await body(req))));
