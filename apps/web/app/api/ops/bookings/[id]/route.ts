export const dynamic = "force-dynamic";
import { z } from "zod";
import { handle, body } from "@/lib/http";
import * as ops from "@/lib/ops";
export const GET = handle(async (_r: Request, { params }: { params: { id: string } }) => ops.bookingDetail(await ops.requireOps("view"), params.id));
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => { const u = await ops.requireOps("bookings"); const r = await ops.override(u, params.id, ops.OverrideIn.parse(await body(req))); return { ...(r as object), ...(await ops.bookingDetail(u, params.id)) }; });
