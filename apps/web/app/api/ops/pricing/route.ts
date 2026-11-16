export const dynamic = "force-dynamic";
import { handle, body } from "@/lib/http";
import { requireOps } from "@/lib/ops";
import * as fin from "@/lib/finance";
export const GET = handle(async () => { await requireOps("view"); return fin.pricing(); });
export const PUT = handle(async (req: Request) => fin.savePolicy(await requireOps("pricing"), fin.PolicyIn.parse(await body(req))));
