export const dynamic = "force-dynamic";
import { requireOps } from "@/lib/ops";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { testIntegration } from "@/lib/settings";
export const POST = handle(async (req: Request, { params }: { params: { key: string } }) => { const u = await requireOps("settings"); const i = z.object({ phone: z.string().max(16).optional() }).parse(await body(req)); return testIntegration(u, params.key, i.phone || undefined); });
