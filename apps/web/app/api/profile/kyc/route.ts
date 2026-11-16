export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { customerKyc, customerKycOtp } from "@/lib/family";
export const POST = handle(async (req: Request) => {
  const b = await body(req); const u = await requireUser("family");
  if (b?.otp) return customerKycOtp(u, z.string().parse(b.otp));
  const i = z.object({ aadhaar: z.string(), consent: z.boolean() }).parse(b); return customerKyc(u, i.aadhaar, i.consent);
});
