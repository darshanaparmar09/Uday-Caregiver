export const dynamic = "force-dynamic";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { settings, saveSettings, SettingsIn } from "@/lib/senior";
export const GET = handle(async () => settings(await requireUser("senior")));
export const PUT = handle(async (req: Request) => saveSettings(await requireUser("senior"), SettingsIn.parse(await body(req))));
