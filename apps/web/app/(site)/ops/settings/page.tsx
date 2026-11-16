import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { OpsSettings } from "@/components/forms/OpsSettings";
export const dynamic = "force-dynamic";
export const metadata = { title: "Settings", robots: { index: false } };
export default async function Page() {
  const u = await currentUser();
  if (!u) redirect("/signin?next=/ops/settings");
  if (u.role !== "ops") redirect("/app");
  return <div className="wrap grid gap-6 py-8"><Link href="/ops" className="text-sm font-semibold text-indigo-600">← Operations</Link><OpsSettings /></div>;
}
