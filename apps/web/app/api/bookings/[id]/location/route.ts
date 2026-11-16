export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { liveLocation, postLocation } from "@/lib/family";
type C = { params: { id: string } };
export const GET = handle(async (_r: Request, { params }: C) => liveLocation(await requireUser("family"), params.id));
export const POST = handle(async (req: Request, { params }: C) => { const i = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(await body(req)); return postLocation(await requireUser("caregiver"), params.id, i.lat, i.lng); });
