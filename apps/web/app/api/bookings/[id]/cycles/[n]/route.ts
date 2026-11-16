export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { payCycle } from "@/lib/care";
export const POST = handle(async (_r: Request, { params }: { params: { id: string; n: string } }) => payCycle(await requireUser("family"), params.id, z.coerce.number().int().min(1).parse(params.n)));
