export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import * as cg from "@/lib/caregiver";
const I = z.object({ aadhaar: z.string().min(12).max(14), pan: z.string().length(10) });
export const POST = handle(async (req: Request) => {
  const b = await body(req); const u = await requireUser("caregiver");
  if (b?.otp) return cg.identityOtp(u, z.string().parse(b.otp));
  const i = I.parse(b); return cg.identity(u, i.aadhaar, i.pan);
});
