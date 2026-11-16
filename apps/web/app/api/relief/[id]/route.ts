export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { reliefAct, ReliefAct } from "@/lib/care";
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => reliefAct(await requireUser("caregiver"), params.id, ReliefAct.parse(await body(req))));
