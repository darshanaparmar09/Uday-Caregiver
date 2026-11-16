export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { subscribe } from "@/lib/facilities";
export const POST = handle(async (req: Request) => subscribe(await requireUser("facility"), z.object({ plan: z.enum(["listed", "featured"]) }).parse(await body(req)).plan));
