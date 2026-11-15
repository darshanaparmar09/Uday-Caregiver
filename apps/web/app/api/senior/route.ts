export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { seniorHome } from "@/lib/people";
import { handle } from "@/lib/http";
export const GET = handle(async () => seniorHome(await requireUser("senior")));
