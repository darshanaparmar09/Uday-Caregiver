export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { people } from "@/lib/senior";
export const GET = handle(async () => people(await requireUser("senior")));
