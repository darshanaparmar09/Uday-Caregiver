export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { saveNotes } from "@/lib/facilities";
export const PUT = handle(async (req: Request, { params }: { params: { id: string } }) => { const i = z.object({ answers: z.record(z.string(), z.string()) }).parse(await body(req)); await saveNotes(await requireUser("family"), params.id, i.answers); return { ok: true }; });
