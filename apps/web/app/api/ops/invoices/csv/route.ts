export const dynamic = "force-dynamic";
import { handle, body } from "@/lib/http";
import { requireOps } from "@/lib/ops";
import * as fin from "@/lib/finance";
export const GET = handle(async (req: Request) => { await requireOps("money"); const m = new URL(req.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  return new Response(await fin.registerCsv(m), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="uday-gst-register-${m}.csv"` } }); });
