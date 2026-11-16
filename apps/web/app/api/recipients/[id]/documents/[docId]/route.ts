export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { document, deleteDocument } from "@/lib/family";
type C = { params: { id: string; docId: string } };
export async function GET(_r: Request, { params }: C) {
  try { const d = await document(await requireUser("family"), params.id, params.docId);
    return new Response(new Uint8Array(d.body), { headers: { "Content-Type": d.mime, "Content-Disposition": `inline; filename="${d.title.replace(/[^\w .-]/g, "")}"`, "Cache-Control": "private, no-store" } }); }
  catch (e: any) { return new Response(e.message ?? "Not found", { status: e.status ?? 404 }); }
}
export const DELETE = handle(async (_r: Request, { params }: C) => deleteDocument(await requireUser("family"), params.id, params.docId));
