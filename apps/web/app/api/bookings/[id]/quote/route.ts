export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { quote } from "@/lib/bookings";
import { handle } from "@/lib/http";
export const GET = handle(async (_r: Request, { params }: { params: { id: string } }) => quote(await requireUser("family"), params.id));
