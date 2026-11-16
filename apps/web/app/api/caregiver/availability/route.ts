export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import * as cg from "@/lib/caregiver";
const I = z.object({ day: z.string(), available: z.boolean() });
export const GET = handle(async () => cg.availability(await requireUser("caregiver")));
export const PUT = handle(async (req: Request) => { const i = I.parse(await body(req)); await cg.setDay(await requireUser("caregiver"), i.day, i.available); return { ok: true }; });
