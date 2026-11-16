export const dynamic = "force-dynamic";
import { z } from "zod";
import { handle, body } from "@/lib/http";
import * as ops from "@/lib/ops";
export const GET = handle(async () => { const u = await ops.requireOps("view"); return { id: u.id, name: u.name, role: u.opsRole, perms: ops.permsFor(u.opsRole) }; });
