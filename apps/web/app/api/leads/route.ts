export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { lead } from "@/lib/family";
export const POST = handle(async (req: Request) => { const i = z.object({ kind: z.enum(["insurance", "tablet", "telehealth"]), note: z.string().max(300).optional() }).parse(await body(req)); return lead(await requireUser("senior", "family"), i.kind, i.note); });
