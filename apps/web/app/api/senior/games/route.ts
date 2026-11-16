export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { games, savePlay } from "@/lib/senior";
const I = z.object({ game: z.enum(["memory", "trivia", "words"]), score: z.number().int().min(0), seconds: z.number().int().min(0).max(36000).optional() });
export const GET = handle(async () => games(await requireUser("senior")));
export const POST = handle(async (req: Request) => { const i = I.parse(await body(req)); return savePlay(await requireUser("senior"), i.game, i.score, i.seconds); });
