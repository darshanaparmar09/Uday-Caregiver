export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { latestUpdates } from "@/lib/insights";
/** The latest daily care update for each senior this family member follows. */
export const GET = handle(async () => latestUpdates(await requireUser("family")));
