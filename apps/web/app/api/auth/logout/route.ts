export const dynamic = "force-dynamic";
import { currentUser, clearSessionCookie, revokeSession } from "@/lib/auth";
import { handle } from "@/lib/http";
export const POST = handle(async () => { const u = await currentUser(); if (u) await revokeSession(u.sessionId); clearSessionCookie(); return { ok: true }; });
