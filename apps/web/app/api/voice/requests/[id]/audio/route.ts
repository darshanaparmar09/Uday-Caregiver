export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { voiceAudio } from "@/lib/voice";
import { AppError } from "@/lib/bookings";
export async function GET(_: Request, { params }: { params: { id: string } }) {
  try { const a = await voiceAudio(await requireUser("family"), params.id); return new Response(new Uint8Array(a.body), { headers: { "content-type": a.mime, "cache-control": "private, no-store" } }); }
  catch (e) { return Response.json({ error: e instanceof AppError ? e.message : "Not found" }, { status: e instanceof AppError ? e.status : 404 }); }
}
