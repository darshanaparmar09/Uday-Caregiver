export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { weekFor } from "@/lib/senior";
type C = { params: { id: string } };
export const GET = handle(async (_r: Request, { params }: C) => weekFor(await requireUser("family"), params.id));
