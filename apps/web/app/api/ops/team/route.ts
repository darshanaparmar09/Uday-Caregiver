export const dynamic = "force-dynamic";
import { z } from "zod";
import { handle, body } from "@/lib/http";
import * as ops from "@/lib/ops";
export const GET = handle(async () => { await ops.requireOps("view"); return ops.team(); });
export const POST = handle(async (req: Request) => ops.teamAct(await ops.requireOps("team"), ops.TeamIn.parse(await body(req))));
