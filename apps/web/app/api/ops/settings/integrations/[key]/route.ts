export const dynamic = "force-dynamic";
import { requireOps } from "@/lib/ops";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { saveIntegration, SaveIn } from "@/lib/settings";
import { AppError } from "@/lib/bookings";
export const PUT = handle(async (req: Request, { params }: { params: { key: string } }) => { const u = await requireOps("settings");
  try { return await saveIntegration(u, params.key, SaveIn.parse(await body(req))); } catch (e: any) { if (e?.status) throw new AppError(e.message, e.status); throw e; } });
