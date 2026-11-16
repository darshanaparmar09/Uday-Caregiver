import { one, q } from "./db";
import { AppError } from "./bookings";
import { csv } from "./finance";

/** Operations reports for a date range (India time). Every figure comes from the live records; nothing is estimated. */
export async function report(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new AppError("Choose a valid date range");
  const R = [from, to];
  const D = (col: string) => `(${col} AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date`;
  const [bookings, byType, byTier, money, shifts, checkins, help, incidents, growth, caregivers, daily, topAreas, sla] = await Promise.all([
    one<any>(`SELECT count(*)::int AS requested, count(*) FILTER (WHERE status NOT IN ('offered','proposal','released','cancelled') OR (status='cancelled' AND days_done > 0))::int AS confirmed,
      count(*) FILTER (WHERE status='released')::int AS unfilled, count(*) FILTER (WHERE status='cancelled')::int AS cancelled,
      COALESCE(round(100.0 * count(*) FILTER (WHERE status NOT IN ('offered','proposal','released')) / NULLIF(count(*) FILTER (WHERE status NOT IN ('offered','proposal')),0)),0)::int AS fill_rate
      FROM bookings WHERE ${D("created_at")}`, R),
    q(`SELECT care_type, count(*)::int AS n, COALESCE(sum(total_paise),0)::bigint AS value FROM bookings WHERE ${D("created_at")} AND status NOT IN ('released') GROUP BY 1 ORDER BY 1`, R),
    q(`SELECT tier, count(*)::int AS n FROM bookings WHERE ${D("created_at")} GROUP BY 1 ORDER BY 1`, R),
    one<any>(`SELECT
      COALESCE(sum(debit_paise) FILTER (WHERE account='family_payments'),0)::bigint AS collected,
      COALESCE(sum(credit_paise) FILTER (WHERE account='family_refunds'),0)::bigint AS refunded,
      COALESCE(sum(credit_paise) FILTER (WHERE account='uday_fee'),0)::bigint AS fee_revenue,
      COALESCE(sum(credit_paise) FILTER (WHERE account='gst_payable'),0)::bigint AS gst,
      COALESCE(sum(credit_paise) FILTER (WHERE account LIKE 'caregiver:%' AND reason NOT LIKE 'weekly payout%'),0)::bigint AS caregiver_earnings,
      COALESCE(sum(credit_paise) FILTER (WHERE account='bank_payouts'),0)::bigint AS paid_out,
      COALESCE(sum(credit_paise) FILTER (WHERE account='uday_listing_revenue'),0)::bigint AS listing_revenue,
      COALESCE(sum(credit_paise) FILTER (WHERE account='uday_membership_revenue'),0)::bigint AS membership_revenue,
      COALESCE(sum(debit_paise) FILTER (WHERE account='uday_goodwill'),0)::bigint AS goodwill
      FROM ledger_entries WHERE ${D("at")}`, R),
    one<any>(`SELECT count(*) FILTER (WHERE kind='start')::int AS started, count(*) FILTER (WHERE kind IN ('end','day_close'))::int AS completed,
      (SELECT count(*)::int FROM tickets WHERE category='Caregiver did not arrive' AND ${D("created_at")}) AS no_shows,
      (SELECT count(*)::int FROM relief_shifts WHERE day BETWEEN $1::date AND $2::date AND status IN ('done','ended','completed')) AS relief_days,
      (SELECT count(*)::int FROM relief_shifts WHERE day BETWEEN $1::date AND $2::date AND day < current_date AND status IN ('open','offered')) AS relief_unfilled,
      (SELECT count(*)::int FROM relief_shifts WHERE day BETWEEN $1::date AND $2::date AND status='covered') AS relief_covered_by_regular
      FROM attendance WHERE ${D("at")}`, R),
    one<any>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status='ok')::int AS ok, count(*) FILTER (WHERE status='help')::int AS help, count(*) FILTER (WHERE status='medical')::int AS medical,
      count(*) FILTER (WHERE status='lonely')::int AS lonely, count(DISTINCT care_recipient_id)::int AS seniors,
      (SELECT count(*)::int FROM notifications WHERE template='checkin_missed' AND ${D("at")}) AS missed_alerts,
      (SELECT count(*)::int FROM sos_events WHERE ${D("at")}) AS sos
      FROM checkins WHERE ${D("at")}`, R),
    one<any>(`SELECT count(*)::int AS opened, count(*) FILTER (WHERE status='resolved')::int AS resolved, count(*) FILTER (WHERE urgent)::int AS urgent,
      COALESCE(round(100.0 * count(*) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at <= sla_due_at) / NULLIF(count(*) FILTER (WHERE resolved_at IS NOT NULL),0)),0)::int AS within_sla,
      COALESCE(round(avg(extract(epoch FROM (COALESCE(first_response_at, resolved_at) - created_at)) / 60) FILTER (WHERE COALESCE(first_response_at, resolved_at) IS NOT NULL)),0)::int AS first_response_min
      FROM tickets WHERE ${D("created_at")}`, R),
    q(`SELECT severity, category, count(*)::int AS n FROM incidents WHERE ${D("opened_at")} GROUP BY 1, 2 ORDER BY 1, 2`, R),
    one<any>(`SELECT (SELECT count(*)::int FROM users WHERE role='family' AND ${D("created_at")}) AS new_families,
      (SELECT count(*)::int FROM care_recipients WHERE ${D("created_at")}) AS new_parents,
      (SELECT count(*)::int FROM caregiver_applications WHERE ${D("created_at")}) AS applications,
      (SELECT count(*)::int FROM onboarding_steps WHERE stage=15 AND status='clear' AND ${D("updated_at")}) AS caregivers_activated,
      (SELECT count(*)::int FROM memberships WHERE ${D("created_at")}) AS plus_joined,
      (SELECT count(*)::int FROM leads WHERE ${D("created_at")}) AS partner_leads`, R),
    q(`SELECT c.display_name, c.tier,
      (SELECT count(*)::int FROM ledger_entries l WHERE l.account='caregiver:'||c.id AND l.reason ~ '^(shift|day|relief day) [0-9]+ pay$' AND ${D("l.at")}) AS days_worked,
      (SELECT COALESCE(sum(credit_paise),0)::bigint FROM ledger_entries l WHERE l.account='caregiver:'||c.id AND l.reason NOT LIKE 'weekly payout%' AND ${D("l.at")}) AS earned,
      c.rating::float AS rating FROM caregivers c WHERE c.status IN ('active','paused') ORDER BY 3 DESC, 1 LIMIT 50`, R),
    q(`SELECT d::date AS day,
      (SELECT count(*)::int FROM bookings b WHERE (b.created_at AT TIME ZONE 'Asia/Kolkata')::date = d::date) AS requests,
      (SELECT count(*)::int FROM attendance a WHERE a.kind='start' AND (a.at AT TIME ZONE 'Asia/Kolkata')::date = d::date) AS shifts,
      (SELECT count(*)::int FROM checkins k WHERE (k.at AT TIME ZONE 'Asia/Kolkata')::date = d::date) AS checkins,
      (SELECT COALESCE(sum(debit_paise),0)::bigint FROM ledger_entries l WHERE l.account='family_payments' AND (l.at AT TIME ZONE 'Asia/Kolkata')::date = d::date) AS collected
      FROM generate_series($1::date, LEAST($2::date, $1::date + 92), interval '1 day') d ORDER BY 1`, R),
    q(`SELECT r.locality, count(*)::int AS n FROM bookings b JOIN care_recipients r ON r.id=b.care_recipient_id WHERE ${D("b.created_at")} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, R),
    one<any>(`SELECT COALESCE(round(avg(extract(epoch FROM (e.at - b.created_at)) / 60)),0)::int AS minutes_to_accept FROM bookings b
      JOIN booking_events e ON e.booking_id=b.id AND e.to_status='accepted' WHERE ${D("b.created_at")}`, R),
  ]);
  const n = (o: any) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, typeof v === "string" && /^-?\d+$/.test(v) ? Number(v) : v]));
  return { from, to, bookings: { ...n(bookings), minutesToAccept: sla?.minutes_to_accept ?? 0 }, byType: byType.map(n), byTier, money: n(money), shifts: n(shifts), checkins: n(checkins), help: n(help), incidents, growth: n(growth),
    caregivers: caregivers.map(n), daily: daily.map((d) => ({ ...n(d), day: String(d.day instanceof Date ? d.day.toISOString() : d.day).slice(0, 10) })), topAreas };
}
/** One CSV with every table of the report. */
export async function reportCsv(from: string, to: string) {
  const r = await report(from, to); const rs = (p: number) => (Number(p) / 100).toFixed(2);
  const rows: (string | number)[][] = [[`Uday operations report ${from} to ${to}`], []];
  const kv = (title: string, o: Record<string, any>, money: string[] = []) => { rows.push([title]); for (const [k, v] of Object.entries(o)) rows.push([k.replace(/_/g, " "), money.includes(k) ? rs(v) : v]); rows.push([]); };
  kv("Bookings", r.bookings); kv("Money (Rs)", r.money, Object.keys(r.money)); kv("Shifts", r.shifts); kv("Daily check ins", r.checkins); kv("Help requests", r.help); kv("Growth", r.growth);
  rows.push(["Care type", "Bookings", "Value (Rs)"], ...r.byType.map((t: any) => [t.care_type, t.n, rs(t.value)]), []);
  rows.push(["Incidents: severity", "Category", "Count"], ...r.incidents.map((i: any) => [i.severity, i.category, i.n]), []);
  rows.push(["Caregiver", "Tier", "Days worked", "Earned (Rs)", "Rating"], ...r.caregivers.map((c: any) => [c.display_name, c.tier, c.days_worked, rs(c.earned), c.rating ?? ""]), []);
  rows.push(["Day", "Requests", "Shifts started", "Check ins", "Collected (Rs)"], ...r.daily.map((d: any) => [d.day, d.requests, d.shifts, d.checkins, rs(d.collected)]));
  return csv(rows);
}
