import { currentUser } from "@/lib/auth";
import { opsRole } from "@/lib/ops";
import { OpsSettings } from "@/components/forms/OpsSettings";
export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };
export default async function Page() {
  const u = await currentUser();
  if (!u || (await opsRole(u.id)) !== "admin") return <p>Only an admin can open Settings.</p>;
  return <OpsSettings />;
}
