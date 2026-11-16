export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { devices, connect } from "@/lib/readings";
type C = { params: { id: string } };
export const GET = handle(async (_r: Request, { params }: C) => devices(await requireUser("family", "senior"), params.id));
export const POST = handle(async (req: Request, { params }: C) => { const i = z.object({ device: z.string(), disconnect: z.boolean().optional() }).parse(await body(req)); return connect(await requireUser("family", "senior"), params.id, i.device, i.disconnect); });
