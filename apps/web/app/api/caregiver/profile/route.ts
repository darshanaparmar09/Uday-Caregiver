export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import * as cg from "@/lib/caregiver";
export const PUT = handle(async (req: Request) => { await cg.saveProfile(await requireUser("caregiver"), cg.ProfileIn.parse(await body(req))); return { ok: true }; });
