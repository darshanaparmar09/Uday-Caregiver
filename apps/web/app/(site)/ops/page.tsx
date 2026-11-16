import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { OpsBoard } from "@/components/forms/OpsBoard";
import { OpsQueues, OpsCommunity, OpsCare, OpsFamily } from "@/components/forms/OpsQueues";
export const dynamic = "force-dynamic";
export const metadata = { title: "Operations", robots: { index: false } };
export default async function Page() {
  const u = await currentUser();
  if (!u) redirect("/signin?next=/ops");
  if (u.role !== "ops") redirect("/app");
  return <div className="wrap grid gap-10 py-8"><div className="flex flex-wrap gap-3"><Link href="/ops/settings" className="btn-ghost">Settings: connections, business and GST, partners</Link></div><OpsBoard /><OpsQueues /><OpsCare /><OpsFamily /><OpsCommunity /></div>;
}
