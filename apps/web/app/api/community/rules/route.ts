export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { communityRules, acceptRules } from "@/lib/senior";
export const GET = handle(async () => communityRules(await requireUser("senior")));
export const POST = handle(async () => acceptRules(await requireUser("senior")));
