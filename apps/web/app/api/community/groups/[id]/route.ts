export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { posts, setMember, addPost } from "@/lib/senior";
type C = { params: { id: string } };
const I = z.union([z.object({ join: z.boolean() }), z.object({ body: z.string() })]);
export const GET = handle(async (_r: Request, { params }: C) => posts(await requireUser("senior"), params.id));
export const POST = handle(async (req: Request, { params }: C) => { const u = await requireUser("senior"); const i = I.parse(await body(req)); return "join" in i ? setMember(u, params.id, i.join) : addPost(u, params.id, i.body); });
