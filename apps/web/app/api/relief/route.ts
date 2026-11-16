export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { myRelief } from "@/lib/care";
export const GET = handle(async () => myRelief(await requireUser("caregiver")));
