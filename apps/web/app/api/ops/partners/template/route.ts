export const dynamic = "force-dynamic";
import { requireOps } from "@/lib/ops";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { template } from "@/lib/partners";
export const GET = handle(async () => { await requireOps("view");
  return new Response(await template(), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="uday-partners-template.xlsx"' } }); });
