export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { callback } from "@/lib/senior";
const I = z.object({ reason: z.enum(["talk", "doctor", "lonely"]) });
export const POST = handle(async (req: Request) => callback(await requireUser("senior"), I.parse(await body(req)).reason));
