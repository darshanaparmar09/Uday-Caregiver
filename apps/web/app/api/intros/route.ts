export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { intros, requestIntro, IntroIn } from "@/lib/care";
export const GET = handle(async () => intros(await requireUser("family", "caregiver")));
export const POST = handle(async (req: Request) => requestIntro(await requireUser("family"), IntroIn.parse(await body(req))));
