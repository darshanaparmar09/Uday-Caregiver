export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { callOther } from "@/lib/family";
export const POST = handle(async (_r: Request, { params }: { params: { id: string } }) => callOther(await requireUser("family", "caregiver"), params.id));
