export const dynamic = "force-dynamic";
import { handle, body } from "@/lib/http";
import { requireOps } from "@/lib/ops";
import * as fin from "@/lib/finance";
import { z } from "zod";
export const GET = handle(async () => { await requireOps("money"); return fin.reconRuns(); });
export const POST = handle(async (req: Request) => { const i = z.object({ from: z.string(), to: z.string() }).parse(await body(req)); return fin.reconcile(await requireOps("money"), i.from, i.to); });
