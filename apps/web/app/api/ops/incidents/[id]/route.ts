export const dynamic = "force-dynamic";
import { z } from "zod";
import { handle, body } from "@/lib/http";
import * as ops from "@/lib/ops";
export const GET = handle(async (_r: Request, { params }: { params: { id: string } }) => { await ops.requireOps("view"); return ops.incidentDetail(params.id); });
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => ops.incidentAct(await ops.requireOps("incidents"), params.id, ops.IncidentIn.parse(await body(req))));
