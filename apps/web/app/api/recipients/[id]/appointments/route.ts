export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { handle, body } from "@/lib/http";
import { listAppointments, addAppointment, AppointmentIn } from "@/lib/appointments";
type C = { params: { id: string } };
export const GET = handle(async (_: Request, { params }: C) => listAppointments(await requireUser("family"), params.id));
export const POST = handle(async (req: Request, { params }: C) => addAppointment(await requireUser("family"), params.id, AppointmentIn.parse(await body(req))));
