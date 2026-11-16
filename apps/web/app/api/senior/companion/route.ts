export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { companion, companionHistory } from "@/lib/family";
export const GET = handle(async () => companionHistory(await requireUser("senior")));
export const POST = handle(async (req: Request) => companion(await requireUser("senior"), z.object({ message: z.string().max(600) }).parse(await body(req)).message));
