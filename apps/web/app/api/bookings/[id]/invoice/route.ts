export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { invoicePdf } from "@/lib/family";
export async function GET(_r: Request, { params }: { params: { id: string } }) {
  try { const pdf = await invoicePdf(await requireUser("family"), params.id);
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Uday-invoice-${params.id.slice(0, 8)}.pdf"`, "Cache-Control": "private, no-store" } }); }
  catch (e: any) { return new Response(e.message ?? "Not found", { status: e.status ?? 404 }); }
}
