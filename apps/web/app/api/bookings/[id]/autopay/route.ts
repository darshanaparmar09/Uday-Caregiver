export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { autopayStatus, startAutopay, stopAutopay } from "@/lib/care";
export const GET = handle(async (_r: Request, { params }: { params: { id: string } }) => autopayStatus(await requireUser("family"), params.id));
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => startAutopay(await requireUser("family"), params.id, z.object({ method: z.string().max(10).default("upi") }).parse(await body(req)).method));
export const DELETE = handle(async (_r: Request, { params }: { params: { id: string } }) => stopAutopay(await requireUser("family"), params.id));
