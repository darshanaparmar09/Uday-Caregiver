export const dynamic = "force-dynamic";
import { z } from "zod";
import { q, one } from "@/lib/db";
import { enc, lookupHash, normalisePhone } from "@/lib/crypto";
import { handle, body } from "@/lib/http";
import { AppError } from "@/lib/bookings";
const I = z.object({ name: z.string().min(2).max(80), phone: z.string(), area: z.string().min(2).max(60), experience: z.string().max(60) });
export const POST = handle(async (req: Request) => {
  const i = I.parse(await body(req)); const p = normalisePhone(i.phone); const h = lookupHash(p);
  const recent = await one("SELECT 1 FROM caregiver_applications WHERE phone_hash=$1 AND created_at > now() - interval '1 day'", [h]);
  if (recent) throw new AppError("We already have your application. Our recruiter will call you.", 409);
  await q("INSERT INTO caregiver_applications (name, phone_enc, phone_hash, area, experience) VALUES ($1,$2,$3,$4,$5)", [i.name, enc(p), h, i.area, i.experience]);
  return { ok: true };
});
