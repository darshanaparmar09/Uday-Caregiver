export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { setVoiceStatus } from "@/lib/voice";
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) =>
  setVoiceStatus(await requireUser("family"), params.id, z.object({ status: z.enum(["seen", "done", "dismissed"]) }).parse(await body(req)).status));
