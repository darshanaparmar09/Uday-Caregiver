export const dynamic = "force-dynamic";
import { currentUser } from "@/lib/auth";
import { photo } from "@/lib/care";
/** Verified caregiver photo for families. Ops can see a photo waiting for checks. */
export async function GET(_r: Request, { params }: { params: { id: string } }) {
  try { const p = await photo(params.id, await currentUser().catch(() => null)); return new Response(new Uint8Array(p.body), { headers: { "Content-Type": p.mime, "Cache-Control": "private, max-age=300" } }); }
  catch { return new Response("Not found", { status: 404 }); }
}
