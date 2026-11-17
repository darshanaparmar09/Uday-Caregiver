export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { acknowledge, alertFor, resolveAlert } from "@/lib/alerts";
import { requireOps } from "@/lib/ops";
type P = { params: { id: string } };
/** Who was reached and who has responded. The person who raised the alert polls this. */
export const GET = handle(async (_r: Request, { params }: P) => alertFor(await requireUser(), params.id));
const I = z.discriminatedUnion("action", [z.object({ action: z.literal("ack") }), z.object({ action: z.literal("resolve"), note: z.string().min(2).max(300) })]);
export const POST = handle(async (req: Request, { params }: P) => {
  const i = I.parse(await body(req)); const u = await requireUser();
  if (u.role === "ops") await requireOps("incidents");
  return i.action === "ack" ? acknowledge(u, params.id) : resolveAlert(u, params.id, i.note);
});
