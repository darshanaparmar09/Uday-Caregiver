export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { listPartners } from "@/lib/partners";
import { opsFamily } from "@/lib/family";
export const GET = handle(async () => { await requireUser("ops"); return { partners: await listPartners(), leads: (await opsFamily()).leads }; });
