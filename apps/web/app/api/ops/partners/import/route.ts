export const dynamic = "force-dynamic";
import { requireOps } from "@/lib/ops";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { importSheet } from "@/lib/partners";
import { AppError } from "@/lib/bookings";
/** Upload the partners Excel sheet. ?dryRun=1 checks it and shows what would change. */
export const POST = handle(async (req: Request) => { const u = await requireOps("people");
  const f = (await req.formData()).get("file"); if (!f || typeof f === "string") throw new AppError("Choose the Excel file");
  if (f.size > 2_000_000) throw new AppError("The file is larger than 2 MB");
  return importSheet(u, Buffer.from(await f.arrayBuffer()), new URL(req.url).searchParams.get("dryRun") === "1"); });
