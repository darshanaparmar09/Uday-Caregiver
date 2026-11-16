export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { list, addManual } from "@/lib/readings";
type C = { params: { id: string } };
export const GET = handle(async (req: Request, { params }: C) => list(await requireUser("family", "senior"), params.id, Number(new URL(req.url).searchParams.get("days")) || 30));
export const POST = handle(async (req: Request, { params }: C) => { const i = z.object({ readings: z.array(z.object({ kind: z.string(), value: z.number(), at: z.string().optional() })).min(1).max(20) }).parse(await body(req)); return addManual(await requireUser("family"), params.id, i.readings); });
