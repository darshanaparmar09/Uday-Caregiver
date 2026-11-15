export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { handle } from "@/lib/http";
export const GET = handle(async () => {
  const u = await requireUser();
  const p = await one("SELECT name, email, country, city, timezone, language FROM users WHERE id=$1", [u.id]);
  const cg = u.role === "caregiver" ? await one("SELECT id, display_name, tier, online, status FROM caregivers WHERE user_id=$1", [u.id]) : null;
  return { user: { ...u, sessionId: undefined, ...p }, caregiver: cg };
});
