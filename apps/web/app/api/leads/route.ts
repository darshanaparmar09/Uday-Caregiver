export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { lead } from "@/lib/family";
import { listPartners } from "@/lib/partners";
/** Partners shown to families and seniors, by kind. */
export const GET = handle(async (req: Request) => { await requireUser("senior", "family"); return listPartners(new URL(req.url).searchParams.get("kind") ?? undefined, true); });
export const POST = handle(async (req: Request) => { const i = z.object({ kind: z.enum(["insurance", "tablet", "telehealth"]), note: z.string().max(300).optional(), consent: z.boolean().optional() }).parse(await body(req)); return lead(await requireUser("senior", "family"), i.kind, i.note, !!i.consent); });
