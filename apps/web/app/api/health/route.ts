export const dynamic = "force-dynamic";
import { q } from "@/lib/db";
import { handle } from "@/lib/http";
export const GET = handle(async () => { await q("SELECT 1"); return { ok: true }; });
