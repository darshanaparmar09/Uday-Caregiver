import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { OpsBoard } from "@/components/forms/OpsBoard";
export const dynamic = "force-dynamic";
export const metadata = { title: "Operations", robots: { index: false } };
export default async function Page() {
  const u = await currentUser();
  if (!u) redirect("/signin?next=/ops");
  if (u.role !== "ops") redirect("/app");
  return <div className="wrap py-8"><OpsBoard /></div>;
}
