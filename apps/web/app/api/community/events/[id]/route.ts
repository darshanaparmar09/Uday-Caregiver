export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { rsvp } from "@/lib/senior";
type C = { params: { id: string } };
export const POST = handle(async (req: Request, { params }: C) => rsvp(await requireUser("senior"), params.id, z.object({ going: z.boolean() }).parse(await body(req)).going));
