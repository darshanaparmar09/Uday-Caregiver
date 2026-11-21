export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { familyVoiceRequests } from "@/lib/voice";
export const GET = handle(async () => familyVoiceRequests(await requireUser("family")));
