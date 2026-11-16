export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { groups } from "@/lib/senior";
export const GET = handle(async () => groups(await requireUser("senior")));
