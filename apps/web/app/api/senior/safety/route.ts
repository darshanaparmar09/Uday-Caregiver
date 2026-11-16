export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { safetyReport, SafetyIn } from "@/lib/senior";
export const POST = handle(async (req: Request) => safetyReport(await requireUser("senior"), SafetyIn.parse(await body(req))));
