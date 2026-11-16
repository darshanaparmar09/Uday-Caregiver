export const dynamic = "force-dynamic";
import { z } from "zod";
import { handle, body } from "@/lib/http";
import * as ops from "@/lib/ops";
export const GET = handle(async (req: Request) => { await ops.requireOps("view"); const sp = new URL(req.url).searchParams; const g = (k: string) => sp.get(k) ?? undefined; return ops.bookings({ status: g("status"), q: g("q"), from: g("from"), to: g("to"), care: g("care"), page: Number(g("page") ?? 0) }); });
