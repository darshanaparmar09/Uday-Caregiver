export const dynamic = "force-dynamic";
import { z } from "zod";
import { handle, body } from "@/lib/http";
import * as ops from "@/lib/ops";
export const GET = handle(async (req: Request) => { await ops.requireOps("view"); return ops.incidents({ status: new URL(req.url).searchParams.get("status") ?? undefined }); });
export const POST = handle(async (req: Request) => ops.openIncident(await ops.requireOps("incidents"), ops.IncidentNew.parse(await body(req))));
