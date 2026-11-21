export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { getAiHelp, setAiHelp } from "@/lib/insights";
type C = { params: { id: string } };
export const GET = handle(async (_: Request, { params }: C) => getAiHelp(await requireUser("family"), params.id));
export const PUT = handle(async (req: Request, { params }: C) => setAiHelp(await requireUser("family"), params.id, z.object({ on: z.boolean() }).parse(await body(req)).on));
