export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { answerInvite } from "@/lib/family";
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => answerInvite(await requireUser("family"), params.id, z.object({ accept: z.boolean() }).parse(await body(req)).accept));
