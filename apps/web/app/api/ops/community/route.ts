export const dynamic = "force-dynamic";
import { requireOps } from "@/lib/ops";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { q } from "@/lib/db";
import { opsCommunity, opsPost, createEvent, opsClose, opsCloseUserReport, opsCloseAiReport, EventIn } from "@/lib/senior";
const I = z.discriminatedUnion("action", [z.object({ action: z.literal("post"), id: z.string().uuid(), status: z.enum(["live", "hidden"]) }),
  z.object({ action: z.literal("close"), kind: z.enum(["safety", "callback"]), id: z.string() }),
  z.object({ action: z.literal("person"), id: z.coerce.number().int(), remove: z.boolean() }), z.object({ action: z.literal("ai"), id: z.coerce.number().int() }), EventIn.extend({ action: z.literal("event") })]);
export const GET = handle(async () => { await requireOps("view"); return opsCommunity(); });
export const POST = handle(async (req: Request) => { const u = await requireOps("community"); const i = I.parse(await body(req));
  if (i.action === "person") return opsCloseUserReport(i.id, i.remove, u.id); if (i.action === "ai") return opsCloseAiReport(i.id, u.id);
  if (i.action === "post") { await opsPost(i.id, i.status); await q("INSERT INTO audit_log (actor_id, action, entity, entity_id, reason) VALUES ($1,'moderate','group_post',$2,$3)", [u.id, i.id, i.status]); return { ok: true }; } if (i.action === "close") return opsClose(i.kind, i.id); return createEvent(u, i); });
