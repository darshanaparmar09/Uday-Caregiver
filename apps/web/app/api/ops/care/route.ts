export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { opsCare, coverRelief, opsPhoto, introAct } from "@/lib/care";
const I = z.discriminatedUnion("action", [z.object({ action: z.literal("cover"), id: z.string().uuid() }), z.object({ action: z.literal("photo"), caregiverId: z.string().uuid(), verified: z.boolean() }), z.object({ action: z.literal("intro_done"), id: z.string().uuid() })]);
export const GET = handle(async () => { await requireUser("ops"); return opsCare(); });
export const POST = handle(async (req: Request) => { const u = await requireUser("ops"); const i = I.parse(await body(req));
  if (i.action === "cover") return coverRelief(i.id); if (i.action === "photo") return opsPhoto(i.caregiverId, i.verified); return introAct(u, i.id, { action: "done" }); });
