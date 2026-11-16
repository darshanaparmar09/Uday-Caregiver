export const dynamic = "force-dynamic";
import { z } from "zod";
import { handle, body } from "@/lib/http";
import * as ops from "@/lib/ops";
export const GET = handle(async (req: Request) => { const u = await ops.requireOps("view"); const s = new URL(req.url).searchParams.get("q") ?? ""; await ops.audit(u.id, "search", "console", null, s.replace(/\d{5,}/g, "•••")); return ops.search(s); });
