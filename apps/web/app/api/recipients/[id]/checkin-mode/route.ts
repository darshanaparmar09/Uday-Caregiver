export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { setCheckinMode, CallModeIn } from "@/lib/family";
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => setCheckinMode(await requireUser("family"), params.id, CallModeIn.parse(await body(req))));
