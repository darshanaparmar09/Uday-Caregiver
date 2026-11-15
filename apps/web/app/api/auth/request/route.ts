export const dynamic = "force-dynamic";
import { z } from "zod";
import { requestOtp } from "@/lib/auth";
import { handle, body } from "@/lib/http";
export const POST = handle(async (req: Request) => requestOtp(z.object({ phone: z.string().min(6).max(20) }).parse(await body(req)).phone));
