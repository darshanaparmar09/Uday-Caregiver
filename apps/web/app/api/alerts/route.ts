export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { myAlerts } from "@/lib/alerts";
/** Open alerts for the parents this family member looks after. */
export const GET = handle(async () => myAlerts(await requireUser("family")));
