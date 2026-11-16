export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { testIntegration } from "@/lib/settings";
export const POST = handle(async (req: Request, { params }: { params: { key: string } }) => { const u = await requireUser("ops"); const i = z.object({ phone: z.string().max(16).optional() }).parse(await body(req)); return testIntegration(u, params.key, i.phone || undefined); });
