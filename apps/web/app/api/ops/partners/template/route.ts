export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { template } from "@/lib/partners";
export const GET = handle(async () => { await requireUser("ops");
  return new Response(await template(), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="uday-partners-template.xlsx"' } }); });
