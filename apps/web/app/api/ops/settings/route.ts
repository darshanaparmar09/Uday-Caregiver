export const dynamic = "force-dynamic";
import { requireOps } from "@/lib/ops";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { listIntegrations, business } from "@/lib/settings";
export const GET = handle(async () => { await requireOps("settings"); return { integrations: await listIntegrations(), business: await business() }; });
