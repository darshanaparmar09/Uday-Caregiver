export const dynamic = "force-dynamic";
import { handle, body } from "@/lib/http";
import { requireOps } from "@/lib/ops";
import * as fin from "@/lib/finance";
export const GET = handle(async () => { await requireOps("money"); return fin.payouts(); });
export const POST = handle(async () => fin.runPayoutsNow(await requireOps("money")));
