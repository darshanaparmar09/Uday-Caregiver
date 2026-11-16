export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { listIntegrations, business } from "@/lib/settings";
export const GET = handle(async () => { await requireUser("ops"); return { integrations: await listIntegrations(), business: await business() }; });
