export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { setVisit } from "@/lib/facilities";
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => { const { status } = z.object({ status: z.enum(["confirmed", "completed", "cancelled"]) }).parse(await body(req)); await setVisit(await requireUser("facility"), params.id, status); return { ok: true }; });
