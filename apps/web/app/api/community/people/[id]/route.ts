export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { namaste } from "@/lib/senior";
type C = { params: { id: string } };
export const POST = handle(async (_r: Request, { params }: C) => namaste(await requireUser("senior"), params.id));
