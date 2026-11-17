export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { cronHealth } from "@/lib/cron";
import { UDAY_ENV } from "@/lib/env";
/**
 * For the load balancer and an outside uptime monitor. Unhealthy (503) when the database is down OR when the
 * scheduled safety jobs have not run in the last five minutes, because then missed check ins and unanswered
 * alerts are not being followed up. Point an external monitor at this URL and page the on call person on 503.
 * ?deep=0 checks the database only (use that for container liveness so a paused scheduler does not restart the app).
 */
export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") !== "0";
  try {
    await one("SELECT 1");
    if (!deep) return NextResponse.json({ ok: true, db: true });
    const c = await cronHealth();
    return NextResponse.json({ ok: c.ok, db: true, scheduler: c.ok ? "running" : "stale", stale: c.stale, env: UDAY_ENV }, { status: c.ok ? 200 : 503 });
  } catch { return NextResponse.json({ ok: false, db: false }, { status: 503 }); }
}
