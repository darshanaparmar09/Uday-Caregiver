export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { review } from "@/lib/facilities";
const I = z.object({ relation: z.enum(["visited", "resident_family"]), areas: z.record(z.string(), z.number().int()), text: z.string().max(1000).optional() });
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => { const i = I.parse(await body(req)); return review(await requireUser("family"), params.id, i.relation, i.areas, i.text); });
