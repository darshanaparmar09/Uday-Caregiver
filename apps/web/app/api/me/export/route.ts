export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { exportData } from "@/lib/account";
import { limit } from "@/lib/ratelimit";
/** Download everything Uday holds about you, as a JSON file. */
export const GET = handle(async () => { const u = await requireUser(); await limit("export:" + u.id, 5, 3600);
  return new Response(JSON.stringify(await exportData(u), null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="my-uday-data.json"', "Cache-Control": "private, no-store" } }); });
