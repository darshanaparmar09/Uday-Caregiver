export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { ivrResult } from "@/lib/family";
/** Voice flow callback (for example an Exotel passthru applet): ?token=IVR_TOKEN&call=<id or CustomField>&digits=1|2 */
async function run(req: Request) {
  const u = new URL(req.url); const p = (k: string) => u.searchParams.get(k) ?? "";
  try { return NextResponse.json(await ivrResult(p("token"), p("call") || p("CustomField"), (p("digits") || p("digit")).replace(/\D/g, "").slice(0, 1))); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status ?? 400 }); }
}
export const GET = run; export const POST = run;
