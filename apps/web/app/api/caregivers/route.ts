export const dynamic = "force-dynamic";
import { currentUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { matchCaregivers, MatchQuery } from "@/lib/insights";
/**
 * Caregivers for a care type, ranked for this booking with the reasons ("Why this match").
 * Optional: tier, recipientId (the family's senior), need (care need id), start (YYYY-MM-DD) and days.
 */
export const GET = handle(async (req: Request) => {
  const p = Object.fromEntries(new URL(req.url).searchParams);
  const i = MatchQuery.parse({ ...p, type: p.type ?? "day", tier: p.tier || undefined, days: p.days || undefined });
  return matchCaregivers(i.recipientId ? await currentUser() : null, i);
});
