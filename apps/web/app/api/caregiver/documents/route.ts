export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import * as cg from "@/lib/caregiver";
const I = z.object({ kind: z.enum(["certificate", "nursing_registration", "address_proof", "fitness", "vaccination", "photo"]), base64: z.string().max(7_200_000), mime: z.string() });
export const POST = handle(async (req: Request) => { const i = I.parse(await body(req)); return cg.uploadDocument(await requireUser("caregiver"), i.kind, i.base64, i.mime); });
