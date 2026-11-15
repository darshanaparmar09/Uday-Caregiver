export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { handle } from "@/lib/http";
export const GET = handle(async () => {
  await requireUser("ops");
  const [byStatus, tickets, sos, caregivers] = await Promise.all([
    q("SELECT status, count(*)::int AS n FROM bookings GROUP BY status"),
    q("SELECT code, category, urgent, status, sla_due_at FROM tickets WHERE status='open' ORDER BY urgent DESC, sla_due_at LIMIT 50"),
    q("SELECT id, role, booking_id, at FROM sos_events WHERE resolved_at IS NULL ORDER BY at DESC LIMIT 20"),
    q(`SELECT c.display_name, c.tier, c.status, c.online, array_agg(v.kind || ':' || v.result) FILTER (WHERE v.kind IS NOT NULL) AS checks
       FROM caregivers c LEFT JOIN caregiver_verifications v ON v.caregiver_id=c.id GROUP BY c.id ORDER BY c.display_name`),
  ]);
  const live = await q(`SELECT b.code, b.status, b.care_type, b.days, b.days_done, b.start_date, b.offer_expires_at, c.display_name AS caregiver, r.locality
    FROM bookings b JOIN caregivers c ON c.id=b.caregiver_id JOIN care_recipients r ON r.id=b.care_recipient_id
    WHERE b.status NOT IN ('closed','cancelled','released') ORDER BY b.updated_at DESC LIMIT 100`);
  return { byStatus, tickets, sos, caregivers, live };
});
