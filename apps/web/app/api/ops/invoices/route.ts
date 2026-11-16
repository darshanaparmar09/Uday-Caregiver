export const dynamic = "force-dynamic";
import { handle, body } from "@/lib/http";
import { requireOps } from "@/lib/ops";
import * as fin from "@/lib/finance";
export const GET = handle(async (req: Request) => { await requireOps("money"); const sp = new URL(req.url).searchParams; return fin.invoiceRegister({ month: sp.get("month") ?? undefined, kind: sp.get("kind") ?? undefined }); });
