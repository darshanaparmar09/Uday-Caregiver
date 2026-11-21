export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { suggestFromDocument } from "@/lib/appointments";
type C = { params: { id: string } };
/** AI reads one uploaded document and suggests appointments for the family to confirm. */
export const POST = handle(async (req: Request, { params }: C) => suggestFromDocument(await requireUser("family"), params.id, z.object({ documentId: z.string().uuid() }).parse(await body(req)).documentId));
