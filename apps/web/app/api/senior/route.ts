export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { home } from "@/lib/senior";
export const GET = handle(async () => home(await requireUser("senior")));
