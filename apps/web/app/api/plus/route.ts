export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { plusStatus, joinPlus, leavePlus } from "@/lib/family";
export const GET = handle(async () => plusStatus(await requireUser("family")));
export const POST = handle(async (req: Request) => { const u = await requireUser("family"); return z.object({ action: z.enum(["join", "leave"]) }).parse(await body(req)).action === "join" ? joinPlus(u) : leavePlus(u); });
