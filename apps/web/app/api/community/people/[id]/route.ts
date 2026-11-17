export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { namaste, blockUser, reportUser } from "@/lib/senior";
type C = { params: { id: string } };
const I = z.object({ action: z.enum(["namaste", "block", "unblock", "report"]).default("namaste"), reason: z.string().max(300).optional() });
export const POST = handle(async (req: Request, { params }: C) => {
  const u = await requireUser("senior"); const i = I.parse((await body(req).catch(() => ({}))) ?? {});
  if (i.action === "block" || i.action === "unblock") return blockUser(u, params.id, i.action === "block");
  if (i.action === "report") return reportUser(u, params.id, i.reason);
  return namaste(u, params.id);
});
