export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { answerLink, linkRequests } from "@/lib/senior";
/** A parent sees which families want to connect, and agrees or refuses. Nothing is shared with a family before this. */
export const GET = handle(async () => linkRequests(await requireUser("senior")));
export const POST = handle(async (req: Request) => { const i = z.object({ id: z.string().uuid(), accept: z.boolean() }).parse(await body(req)); return answerLink(await requireUser("senior"), i.id, i.accept); });
