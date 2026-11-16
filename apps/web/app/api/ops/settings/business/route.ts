export const dynamic = "force-dynamic";
import { requireOps } from "@/lib/ops";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { saveBusiness, BusinessIn } from "@/lib/settings";
import { AppError } from "@/lib/bookings";
export const PUT = handle(async (req: Request) => { const u = await requireOps("settings");
  try { return await saveBusiness(u, BusinessIn.parse(await body(req))); } catch (e: any) { if (e?.status) throw new AppError(e.message, e.status); throw e; } });
