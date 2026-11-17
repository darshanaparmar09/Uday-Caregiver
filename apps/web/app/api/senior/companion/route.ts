export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { companion, companionHistory, companionConsent, reportCompanionReply } from "@/lib/family";
const I = z.union([
  z.object({ message: z.string().max(600) }),
  z.object({ consent: z.boolean() }),
  z.object({ report: z.coerce.number().int(), reason: z.string().max(300).optional() }),
]);
export const GET = handle(async () => companionHistory(await requireUser("senior")));
export const POST = handle(async (req: Request) => {
  const u = await requireUser("senior"); const i = I.parse(await body(req));
  if ("consent" in i) return companionConsent(u, i.consent);
  if ("report" in i) return reportCompanionReply(u, i.report, i.reason);
  return companion(u, i.message);
});
