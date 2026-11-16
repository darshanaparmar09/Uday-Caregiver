export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { reportPost, deletePost } from "@/lib/senior";
type C = { params: { id: string } };
const I = z.object({ action: z.enum(["report", "delete"]), reason: z.string().max(200).optional() });
export const POST = handle(async (req: Request, { params }: C) => { const u = await requireUser("senior"); const i = I.parse(await body(req)); return i.action === "report" ? reportPost(u, params.id, i.reason) : deletePost(u, params.id); });
