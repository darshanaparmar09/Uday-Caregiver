import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  if (!u) redirect("/signin?next=/app");
  if (u.role === "ops") redirect("/ops");
  if (u.role !== "family") return <div className="wrap py-16"><h1 className="text-2xl font-bold">Please use the Uday app</h1><p className="mt-2">Seniors and caregivers use the Uday mobile app. This website is for families.</p></div>;
  return <div className="min-h-[70vh] bg-gradient-to-b from-indigo-50/70 to-paper"><div className="wrap max-w-4xl py-8 sm:py-12">{children}</div></div>;
}
