export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { messages, sendMessage } from "@/lib/family";
type C = { params: { id: string } };
export const GET = handle(async (_r: Request, { params }: C) => messages(await requireUser("family", "caregiver"), params.id));
export const POST = handle(async (req: Request, { params }: C) => sendMessage(await requireUser("family", "caregiver"), params.id, z.object({ body: z.string().max(500) }).parse(await body(req)).body));
