export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { ConsentIn, getConsent, setConsent } from "@/lib/account";
type P = { params: { id: string } };
export const GET = handle(async (_r: Request, { params }: P) => getConsent(await requireUser("family"), params.id));
export const PUT = handle(async (req: Request, { params }: P) => setConsent(await requireUser("family"), params.id, ConsentIn.parse(await body(req))));
