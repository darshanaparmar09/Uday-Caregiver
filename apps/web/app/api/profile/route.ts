export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { saveProfile, ProfileInput } from "@/lib/people";
import { handle, body } from "@/lib/http";
export const PUT = handle(async (req: Request) => { const u = await requireUser("family"); await saveProfile(u, ProfileInput.parse(await body(req))); return { ok: true }; });
