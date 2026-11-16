export const dynamic = "force-dynamic";
import { z } from "zod";
import { handle, body } from "@/lib/http";
import * as ops from "@/lib/ops";
export const GET = handle(async (_r: Request, { params }: { params: { id: string } }) => ops.personDetail(await ops.requireOps("view"), params.id));
