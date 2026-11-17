export const dynamic = "force-dynamic";
import { requireUser, clearSessionCookie } from "@/lib/auth";
import { handle } from "@/lib/http";
import { signOutEverywhere } from "@/lib/account";
/** Sign out of every phone and browser. */
export const DELETE = handle(async () => { const r = await signOutEverywhere(await requireUser()); try { clearSessionCookie(); } catch {} return r; });
