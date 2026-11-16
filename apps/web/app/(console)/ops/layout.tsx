import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { opsRole, permsFor } from "@/lib/ops";
import { ConsoleShell } from "@/components/ops/Shell";
export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Operations", template: "%s · Uday operations" }, robots: { index: false, follow: false } };
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  if (!u) redirect("/signin?next=/ops");
  if (u.role !== "ops") redirect("/app");
  const role = await opsRole(u.id);
  if (!role) return <div className="mx-auto max-w-lg p-10"><h1 className="text-2xl font-bold">Access switched off</h1><p className="mt-2">Your operations access has been switched off. Ask an admin to switch it back on.</p></div>;
  return <ConsoleShell name={u.name ?? "Team"} role={role} perms={permsFor(role)}>{children}</ConsoleShell>;
}
