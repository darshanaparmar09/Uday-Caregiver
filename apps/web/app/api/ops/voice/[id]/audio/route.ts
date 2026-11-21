export const dynamic = "force-dynamic";
import { requireOps } from "@/lib/ops";
import { voiceAudio } from "@/lib/voice";
export async function GET(_: Request, { params }: { params: { id: string } }) {
  try { const a = await voiceAudio(await requireOps("people"), params.id, true); return new Response(new Uint8Array(a.body), { headers: { "content-type": a.mime, "cache-control": "private, no-store" } }); }
  catch (e: any) { return Response.json({ error: e?.message ?? "Not found" }, { status: e?.status ?? 404 }); }
}
