export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { handle, body } from "@/lib/http";
export const POST = handle(async (req: Request) => { const u = await requireUser("caregiver"); const { online } = z.object({ online: z.boolean() }).parse(await body(req));
  await q("UPDATE caregivers SET online=$2 WHERE user_id=$1 AND status='active'", [u.id, online]); return { online }; });
