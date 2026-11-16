export const dynamic = "force-dynamic";
import { z } from "zod";
import { handle, body } from "@/lib/http";
import * as ops from "@/lib/ops";
export const GET = handle(async (req: Request) => { const u = await ops.requireOps("view"); const sp = new URL(req.url).searchParams; const g = (k: string) => sp.get(k) ?? undefined; return ops.tickets({ status: g("status"), mine: g("mine") === "1" ? u.id : undefined, q: g("q") }); });
const NewIn = z.object({ userId: z.string().uuid(), bookingId: z.string().uuid().optional(), category: z.string().min(3).max(80), text: z.string().max(2000).optional(), urgent: z.boolean().optional() });
export const POST = handle(async (req: Request) => ops.openTicketFor(await ops.requireOps("help"), NewIn.parse(await body(req))));
