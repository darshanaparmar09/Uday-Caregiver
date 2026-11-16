export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { documents, addDocument, DocIn } from "@/lib/family";
type C = { params: { id: string } };
export const GET = handle(async (_r: Request, { params }: C) => documents(await requireUser("family"), params.id));
export const POST = handle(async (req: Request, { params }: C) => addDocument(await requireUser("family"), params.id, DocIn.parse(await body(req))));
