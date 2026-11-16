export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { requestVisit } from "@/lib/facilities";
const I = z.object({ preferredDate: z.string(), note: z.string().max(500).optional() });
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => { const i = I.parse(await body(req)); return requestVisit(await requireUser("family"), params.id, i.preferredDate, i.note); });
