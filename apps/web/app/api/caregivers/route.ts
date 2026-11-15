export const dynamic = "force-dynamic";
import { z } from "zod";
import { listCaregivers } from "@/lib/bookings";
import { handle } from "@/lib/http";
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  const type = z.enum(["day", "night", "live"]).parse(u.searchParams.get("type") ?? "day");
  const tier = Number(u.searchParams.get("tier")) || undefined;
  return listCaregivers(type, tier && tier >= 1 && tier <= 3 ? tier : undefined);
});
