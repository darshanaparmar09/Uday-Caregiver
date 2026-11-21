export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireOps } from "@/lib/ops";
import { handle, body } from "@/lib/http";
import { shiftRisks, opsFlags, reviewFlag, weeklyQuality, buildThemes } from "@/lib/insights";
import { opsVoiceRequests, setVoiceStatus } from "@/lib/voice";
const D = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Care insights for Operations: tomorrow's risks, care flags, spoken requests and the weekly quality report. */
export const GET = handle(async (req: Request) => {
  await requireOps("view"); const p = new URL(req.url).searchParams; const view = p.get("view") ?? "risks";
  if (view === "risks") return shiftRisks(p.get("date") ? D.parse(p.get("date")) : undefined);
  if (view === "flags") return opsFlags(p.get("status") === "reviewed" ? "reviewed" : "open");
  if (view === "voice") return opsVoiceRequests(p.get("all") !== "1");
  if (view === "quality") return weeklyQuality(p.get("week") ? D.parse(p.get("week")) : undefined);
  return { error: "Unknown view" };
});
const A = z.discriminatedUnion("action", [
  z.object({ action: z.literal("review_flag"), id: z.coerce.number().int(), note: z.string().min(2).max(500) }),
  z.object({ action: z.literal("themes"), week: D.optional() }),
  z.object({ action: z.literal("voice"), id: z.string().uuid(), status: z.enum(["seen", "done", "dismissed"]) }),
]);
export const POST = handle(async (req: Request) => {
  const u = await requireOps("people"); const a = A.parse(await body(req));
  if (a.action === "review_flag") return reviewFlag(u, a.id, a.note);
  if (a.action === "themes") return buildThemes(u, a.week);
  return setVoiceStatus(u, a.id, a.status, true);
});
