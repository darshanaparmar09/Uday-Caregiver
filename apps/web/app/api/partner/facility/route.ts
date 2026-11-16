export const dynamic = "force-dynamic";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { myFacility, saveFacility, FacilityIn } from "@/lib/facilities";
export const GET = handle(async () => myFacility(await requireUser("facility", "family")));
export const PUT = handle(async (req: Request) => saveFacility(await requireUser("facility", "family"), FacilityIn.parse(await body(req))));
