export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { voiceStatus, voiceConsent, dictate, speakToCompanion, speakToUday } from "@/lib/voice";
import { AppError } from "@/lib/bookings";
export const GET = handle(async () => voiceStatus(await requireUser("senior", "caregiver")));
export const PUT = handle(async (req: Request) => voiceConsent(await requireUser("senior", "caregiver"), z.object({ consent: z.boolean() }).parse(await body(req)).consent));
/** Multipart: audio (the recording) and purpose: request (Speak to Uday), companion, or note (caregiver dictation). */
export const POST = handle(async (req: Request) => {
  const u = await requireUser("senior", "caregiver");
  const f = await req.formData().catch(() => null); const file = f?.get("audio");
  if (!f || !file || typeof file === "string") throw new AppError("Send the recording as audio");
  const purpose = z.enum(["request", "companion", "note"]).parse(f.get("purpose") ?? "request");
  const audio = Buffer.from(await file.arrayBuffer()); const mime = file.type || "audio/m4a";
  if (purpose === "note") return dictate(u, audio, mime);
  if (purpose === "companion") return speakToCompanion(u, audio, mime);
  return speakToUday(u, audio, mime);
});
