export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { search } from "@/lib/facilities";
export const GET = handle(async (req: Request) => { const u = new URL(req.url).searchParams;
  return search({ type: u.get("type") ?? undefined, q: u.get("q")?.slice(0, 60) ?? undefined, maxMonthly: Number(u.get("max")) || undefined, dementia: u.get("dementia") === "1", pets: u.get("pets") === "1" }); });
