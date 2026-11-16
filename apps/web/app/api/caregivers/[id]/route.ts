export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { caregiverProfile } from "@/lib/care";
export const GET = handle(async (_r: Request, { params }: { params: { id: string } }) => caregiverProfile(params.id));
