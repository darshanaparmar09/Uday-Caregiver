export const dynamic = "force-dynamic";
import { handle, body } from "@/lib/http";
import { requireOps } from "@/lib/ops";
import * as fin from "@/lib/finance";
export const PUT = handle(async (req: Request) => fin.saveRates(await requireOps("pricing"), fin.RatesIn.parse(await body(req))));
