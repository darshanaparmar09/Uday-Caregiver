export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { actAppointment, AppointmentAct } from "@/lib/appointments";
type C = { params: { id: string; aid: string } };
export const POST = handle(async (req: Request, { params }: C) => actAppointment(await requireUser("family"), params.id, params.aid, AppointmentAct.parse(await body(req))));
