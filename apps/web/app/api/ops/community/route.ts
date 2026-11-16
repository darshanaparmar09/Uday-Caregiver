export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { opsCommunity, opsPost, createEvent, opsClose, EventIn } from "@/lib/senior";
const I = z.discriminatedUnion("action", [z.object({ action: z.literal("post"), id: z.string().uuid(), status: z.enum(["live", "hidden"]) }),
  z.object({ action: z.literal("close"), kind: z.enum(["safety", "callback"]), id: z.string() }), EventIn.extend({ action: z.literal("event") })]);
export const GET = handle(async () => { await requireUser("ops"); return opsCommunity(); });
export const POST = handle(async (req: Request) => { const u = await requireUser("ops"); const i = I.parse(await body(req));
  if (i.action === "post") return opsPost(i.id, i.status); if (i.action === "close") return opsClose(i.kind, i.id); return createEvent(u, i); });
