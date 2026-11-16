export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { cancelPlan } from "@/lib/facilities";
export const POST = handle(async () => { await cancelPlan(await requireUser("facility")); return { ok: true }; });
