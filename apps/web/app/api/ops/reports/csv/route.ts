export const dynamic = "force-dynamic";
import { handle } from "@/lib/http";
import { requireOps } from "@/lib/ops";
import { report, reportCsv } from "@/lib/reports";
const range = (req: Request) => { const sp = new URL(req.url).searchParams; const to = sp.get("to") ?? new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); return { from: sp.get("from") ?? new Date(Date.parse(to) - 29 * 864e5).toISOString().slice(0, 10), to }; };
export const GET = handle(async (req: Request) => { await requireOps("view"); const r = range(req);
  return new Response(await reportCsv(r.from, r.to), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="uday-report-${r.from}-to-${r.to}.csv"` } }); });
