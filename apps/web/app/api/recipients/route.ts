export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { createRecipient, listRecipients, RecipientInput } from "@/lib/people";
import { handle, body } from "@/lib/http";
export const GET = handle(async () => listRecipients(await requireUser("family")));
export const POST = handle(async (req: Request) => createRecipient(await requireUser("family"), RecipientInput.parse(await body(req))));
