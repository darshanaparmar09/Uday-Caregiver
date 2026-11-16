export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { webhook } from "@/lib/checkout";
/** Gateway webhook. Configure in the Razorpay dashboard with RAZORPAY_WEBHOOK_SECRET. */
export async function POST(req: Request) {
  const raw = await req.text();
  try { return NextResponse.json(await webhook(raw, req.headers.get("x-razorpay-signature") ?? "")); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status ?? 400 }); }
}
