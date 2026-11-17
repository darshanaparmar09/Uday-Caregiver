export const dynamic = "force-dynamic";
import { handle } from "@/lib/http";
import { acknowledgeByLink } from "@/lib/alerts";
import { limit, clientIp } from "@/lib/ratelimit";
/** An emergency contact without the app taps the link in their SMS to say they are responding. */
export const POST = handle(async (_r: Request, { params }: { params: { token: string } }) => { await limit("alert-link:" + clientIp(), 30, 600); return acknowledgeByLink(params.token); });
