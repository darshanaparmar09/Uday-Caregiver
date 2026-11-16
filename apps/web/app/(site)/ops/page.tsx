import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { OpsBoard } from "@/components/forms/OpsBoard";
import { OpsQueues } from "@/components/forms/OpsQueues";
export const dynamic = "force-dynamic";
export const metadata = { title: "Operations", robots: { index: false } };
export default async function Page() {
  const u = await currentUser();
  if (!u) redirect("/signin?next=/ops");
  if (u.role !== "ops") redirect("/app");
  return <div className="wrap grid gap-10 py-8"><OpsBoard /><OpsQueues /></div>;
}
