export const dynamic = "force-dynamic";
import { z } from "zod";
import { handle, body } from "@/lib/http";
import * as ops from "@/lib/ops";
export const GET = handle(async (req: Request) => { await ops.requireOps("view"); return ops.families({ q: new URL(req.url).searchParams.get("q") ?? undefined }); });
