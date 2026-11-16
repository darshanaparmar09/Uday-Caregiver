export const dynamic = "force-dynamic";
import { z } from "zod";
import { handle, body } from "@/lib/http";
import * as ops from "@/lib/ops";
export const GET = handle(async (_r: Request, { params }: { params: { id: string } }) => ops.caregiverDetail(await ops.requireOps("view"), params.id));
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => ops.caregiverAct(await ops.requireOps("people"), params.id, ops.CaregiverIn.parse(await body(req))));
