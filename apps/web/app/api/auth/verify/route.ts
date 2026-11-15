export const dynamic = "force-dynamic";
import { z } from "zod";
import { verifyOtp, setSessionCookie } from "@/lib/auth";
import { handle, body } from "@/lib/http";
const I = z.object({ phone: z.string(), code: z.string().regex(/^\d{4,6}$/), name: z.string().max(80).optional(), role: z.enum(["family", "senior"]).optional(), client: z.enum(["web", "app"]).default("web") });
export const POST = handle(async (req: Request) => {
  const i = I.parse(await body(req));
  const r = await verifyOtp(i.phone, i.code, { name: i.name, role: i.role });
  if (i.client === "web") { setSessionCookie(r.token); return { user: r.user }; }
  return r; // mobile app stores the token in secure storage
});
