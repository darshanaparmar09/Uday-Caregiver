export const dynamic = "force-dynamic";
import { z } from "zod";
import { handle, body } from "@/lib/http";
import * as ops from "@/lib/ops";
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => ops.resolveSos(await ops.requireOps("incidents"), Number(params.id), z.object({ resolution: z.string().min(3).max(500) }).parse(await body(req)).resolution));
