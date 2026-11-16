export const dynamic = "force-dynamic";
import { z } from "zod";
import { handle, body } from "@/lib/http";
import * as ops from "@/lib/ops";
export const GET = handle(async (req: Request) => { await ops.requireOps("audit"); const sp = new URL(req.url).searchParams; const g = (k: string) => sp.get(k) ?? undefined; return ops.auditLog({ entity: g("entity"), actor: g("actor"), from: g("from"), to: g("to") }); });
