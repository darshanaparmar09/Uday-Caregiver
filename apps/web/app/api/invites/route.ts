export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { myInvites } from "@/lib/family";
export const GET = handle(async () => myInvites(await requireUser("family")));
