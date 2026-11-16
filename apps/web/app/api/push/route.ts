export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import * as cg from "@/lib/caregiver";
const I = z.object({ token: z.string().max(200), platform: z.enum(["ios", "android", "web"]) });
export const POST = handle(async (req: Request) => { const i = I.parse(await body(req)); await cg.registerPush(await requireUser(), i.token, i.platform); return { ok: true }; });
