export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { events } from "@/lib/senior";
export const GET = handle(async () => events(await requireUser("senior")));
