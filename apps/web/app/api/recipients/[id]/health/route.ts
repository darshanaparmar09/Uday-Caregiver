export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { getHealth, saveHealth, HealthInput } from "@/lib/people";
import { handle, body } from "@/lib/http";
type C = { params: { id: string } };
export const GET = handle(async (_r: Request, { params }: C) => getHealth(await requireUser("family"), params.id));
export const PUT = handle(async (req: Request, { params }: C) => { await saveHealth(await requireUser("family"), params.id, HealthInput.parse(await body(req))); return { ok: true }; });
