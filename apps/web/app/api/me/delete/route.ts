export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser, clearSessionCookie } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { deleteAccount, deletionBlockers } from "@/lib/account";
/** GET: can the account be deleted now, and if not, why. POST {confirm:"DELETE"}: erase it. */
export const GET = handle(async () => { const b = await deletionBlockers(await requireUser()); return { canDelete: !b.length, blockers: b }; });
export const POST = handle(async (req: Request) => { const u = await requireUser(); const r = await deleteAccount(u, z.object({ confirm: z.string() }).parse(await body(req)).confirm); try { clearSessionCookie(); } catch {} return r; });
