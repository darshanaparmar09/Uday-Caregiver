export const dynamic = "force-dynamic";
import { requireOps } from "@/lib/ops";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { listPartners } from "@/lib/partners";
import { opsFamily } from "@/lib/family";
export const GET = handle(async () => { await requireOps("view"); return { partners: await listPartners(), leads: (await opsFamily()).leads }; });
