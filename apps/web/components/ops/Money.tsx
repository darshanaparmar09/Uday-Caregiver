"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useOps } from "./Shell";
import { Box, CARE, Empty, Head, Kpi, Msg, Pill, ReasonAction, Table, Tabs, day, rs, rs2, useLoad, when } from "./ui";
import { OpsFamily } from "../forms/OpsQueues";

const ist = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600e3).toISOString();
const month = () => ist().slice(0, 7);

export function Money() {
  const [tab, setTab] = useState("invoices");
  return (<>
    <Head title="Payments and GST" sub="Invoices and credit notes, the monthly GST summary, reconciliation and caregiver payouts." />
    <Tabs value={tab} onChange={setTab} tabs={[["invoices", "GST invoices"], ["recon", "Reconciliation"], ["payouts", "Payouts"]]} />
    {tab === "invoices" && <Invoices />}{tab === "recon" && <Recon />}{tab === "payouts" && <Payouts />}
  </>);
}
function Invoices() {
  const [m, setM] = useState(month()); const { d, err } = useLoad<any>(`/api/ops/invoices?month=${m}`);
  return (<>
    <div className="mb-4 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm font-semibold">Month<input type="month" className="input-sm" value={m} onChange={(e) => setM(e.target.value)} /></label>
      <a className="btn-sm" href={`/api/ops/invoices/csv?month=${m}`}>Download for the CA (CSV)</a></div>
    {err && <p className="text-red-700">{err}</p>}
    {d && <>
      {(!d.business.gstin || !d.business.caReviewed) && <p className="mb-4 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900">{!d.business.gstin ? "No GSTIN yet: invoices are drafts. Add it in Settings, Business and GST." : "Waiting for the CA's review: invoices say DRAFT until it is ticked in Settings."}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Invoices" value={d.invoices} sub={`${d.creditNotes} credit notes`} />
        <Kpi label="Taxable value (net)" value={rs(d.summary.taxable_paise)} sub="Uday's fee" />
        <Kpi label="CGST + SGST" value={rs(d.summary.cgst_paise + d.summary.sgst_paise)} sub="intra state" />
        <Kpi label="IGST" value={rs(d.summary.igst_paise)} />
        <Kpi label="Care fees passed through" value={rs(d.summary.care_paise)} sub="not Uday's supply" />
      </div>
      <p className="note mt-2">For comparison, the ledger recognised {rs(d.recognised?.fee)} of fees and {rs(d.recognised?.gst)} of GST this month as care was delivered. Invoices are issued when money is collected. Your CA decides which basis to file on.</p>
      <Box title={`Register for ${m}`} className="mt-4"><Table empty={!d.rows.length && "Nothing issued this month"}>
        <thead><tr><th>Number</th><th>Type</th><th>Date</th><th>Booking</th><th>Buyer</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th><th>Note</th></tr></thead>
        <tbody>{d.rows.map((r: any) => <tr key={r.id}><td className="whitespace-nowrap font-mono text-xs">{r.number}</td><td>{r.kind === "invoice" ? "Invoice" : <Pill s="partially_refunded">credit note</Pill>}</td><td className="whitespace-nowrap">{day(r.issued_at)}</td>
          <td><Link className="font-semibold text-indigo-700" href={`/ops/bookings/${r.booking_id}`}>{r.booking}</Link></td><td>{r.buyer_name ?? ""}</td><td>{rs2(r.taxable_paise)}</td><td>{rs2(r.cgst_paise)}</td><td>{rs2(r.sgst_paise)}</td><td>{rs2(r.igst_paise)}</td><td>{rs2(r.total_paise)}</td><td className="text-muted">{r.reason}</td></tr>)}</tbody></Table></Box>
    </>}
  </>);
}
function Recon() {
  const runs = useLoad<any[]>("/api/ops/reconcile"); const [from, setFrom] = useState(ist(new Date(Date.now() - 30 * 864e5)).slice(0, 10)); const [to, setTo] = useState(ist().slice(0, 10));
  const [r, setR] = useState<any>(null); const [busy, setBusy] = useState(false); const [m, setM] = useState<[boolean, string] | null>(null);
  async function run() { setBusy(true); setM(null); try { setR(await api("/api/ops/reconcile", { body: { from, to } })); runs.load(); } catch (e: any) { setM([false, e.message]); } finally { setBusy(false); } }
  const show = r ?? (runs.d?.[0] ? { ...runs.d[0], from: runs.d[0].from_day, to: runs.d[0].to_day, at: runs.d[0].created_at } : null);
  return (<>
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm font-semibold">From<input type="date" className="input-sm" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="grid gap-1 text-sm font-semibold">To<input type="date" className="input-sm" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <button className="btn-sm" disabled={busy} onClick={run}>{busy ? "Checking" : "Run reconciliation"}</button></div>
    <Msg m={m} />
    <p className="note mb-4">Checks that payments match the ledger, escrow is empty when care ends, weekly payments are recorded, payouts match caregiver balances, paid bookings have invoices, and, when Razorpay is connected, that every Razorpay payment is known to Uday.</p>
    {show && <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Issues" value={show.summary.issues} sub={`${show.summary.high} serious`} tone={show.summary.high ? "alert" : undefined} />
        <Kpi label="Collected" value={rs(show.summary.collected)} sub={`refunded ${rs(show.summary.refunded)}`} />
        <Kpi label="Uday fees + GST" value={rs(show.summary.fees + show.summary.gst)} sub={`goodwill ${rs(show.summary.goodwill)}`} />
        <Kpi label="Held in escrow now" value={rs(show.summary.escrow_now)} sub={`caregivers earned ${rs(show.summary.caregiver_earned)}, paid ${rs(show.summary.paid_out)}`} />
      </div>
      <p className="note mt-2">{show.summary.gatewayNote} Run {when(show.at)} for {day(show.from)} to {day(show.to)}.</p>
      <Box title="Issues found" className="mt-4">{!show.issues.length ? <Empty>Everything agrees</Empty> : <Table><thead><tr><th>Severity</th><th>Check</th><th>Booking</th><th>Detail</th></tr></thead>
        <tbody>{show.issues.map((i: any, k: number) => <tr key={k}><td><Pill s={i.severity} /></td><td>{i.check}</td><td>{i.booking ?? ""}</td><td>{i.detail}</td></tr>)}</tbody></Table>}</Box>
    </>}
    {!!runs.d?.length && <Box title="Earlier runs" className="mt-4"><Table><thead><tr><th>Run</th><th>Period</th><th>By</th><th>Issues</th></tr></thead>
      <tbody>{runs.d.map((x) => <tr key={x.id}><td>{when(x.created_at)}</td><td>{day(x.from_day)} to {day(x.to_day)}</td><td>{x.name}</td><td>{x.summary.issues}</td></tr>)}</tbody></Table></Box>}
  </>);
}
function Payouts() {
  const { d, err, load } = useLoad<any>("/api/ops/payouts"); const [m, setM] = useState<[boolean, string] | null>(null);
  return (<>
    <Msg m={m} />{err && <p className="text-red-700">{err}</p>}
    {d && <><Box title="Owed to caregivers" right={<ReasonAction label="Run payouts now" confirm="Pays every caregiver with a balance and a verified bank account. Accounts changed in the last 48 hours wait." reasonLabel="Note for the record" run={async () => { const r = await api("/api/ops/payouts", { body: {} }); setM([true, `${r.paid} paid`]); load(); }} />}>
      <Table empty={!d.due.length && "Nobody is owed anything"}><thead><tr><th>Caregiver</th><th>Balance</th><th>Bank</th></tr></thead>
        <tbody>{d.due.map((x: any) => <tr key={x.id}><td><Link className="font-semibold text-indigo-700" href={`/ops/caregivers/${x.id}`}>{x.display_name}</Link></td><td className={x.balance < 0 ? "font-bold text-red-700" : ""}>{rs(x.balance)}</td>
          <td>{x.has_bank ? `••${x.bank_last4}${x.bank_recent ? " (changed recently: held 48 h)" : ""}` : <span className="text-red-700">no bank account</span>}</td></tr>)}</tbody></Table></Box>
      <Box title="Recent payouts" className="mt-4"><Table empty={!d.recent.length && "None yet"}><thead><tr><th>When</th><th>Caregiver</th><th>Amount</th><th>Status</th><th>Bank</th><th>Reference</th></tr></thead>
        <tbody>{d.recent.map((p: any) => <tr key={p.id}><td>{when(p.created_at)}</td><td>{p.display_name}</td><td>{rs(p.amount_paise)}</td><td><Pill s={p.status} /></td><td>••{p.bank_last4}</td><td className="font-mono text-xs">{p.gateway_ref}</td></tr>)}</tbody></Table></Box></>}
  </>);
}

// ───────── pricing and policy ─────────
export function Pricing() {
  const { d, err, setD } = useLoad<any>("/api/ops/pricing"); const { can } = useOps(); const [p, setP] = useState<any>(null); const [rates, setRates] = useState<Record<string, string>>({}); const [apply, setApply] = useState(false); const [m, setM] = useState<[boolean, string] | null>(null);
  useEffect(() => { if (d) { setP(d.policy); setRates(Object.fromEntries(d.rates.map((r: any) => [`${r.tier}-${r.care_type}`, String(r.rate_paise / 100)]))); } }, [d]);
  if (err) return <p className="text-red-700">{err}</p>; if (!d || !p) return <p>Loading</p>;
  const edit = can("pricing");
  async function savePolicy() { setM(null); try { const { updatedAt, ...body } = p; setD(await api("/api/ops/pricing", { method: "PUT", body: Object.fromEntries(Object.entries(body).map(([k, v]) => [k, k === "oncallPhones" ? String(v ?? "") : Number(v)])) })); setM([true, "Policy saved. New bookings use it."]); } catch (e: any) { setM([false, e.message]); } }
  async function saveRates() { setM(null); try { setD(await api("/api/ops/pricing/rates", { method: "PUT", body: { applyToCaregivers: apply, rates: Object.entries(rates).map(([k, v]) => { const [t, c] = k.split("-"); return { tier: Number(t), careType: c, ratePaise: Math.round(Number(v) * 100) }; }) } })); setM([true, apply ? "Rates saved and applied to caregivers. Existing bookings keep their price." : "Standard rates saved for new caregivers."]); } catch (e: any) { setM([false, e.message]); } }
  const F = (k: string, label: string, unit: string, help?: string) => <label className="grid gap-1 text-sm font-semibold">{label} ({unit})<input className="input-sm" type="number" step="any" disabled={!edit} value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} />{help && <span className="text-xs font-normal text-muted">{help}</span>}</label>;
  const fee = Number(p.platformFeePct) || 0; const gst = d.gstRatePct;
  return (<>
    <Head title="Pricing and policy" sub={edit ? "Changes apply to new bookings. Existing bookings keep the price and rules they were made with." : "Only an admin can change these."} />
    <Msg m={m} />
    <div className="mt-3 grid gap-5 xl:grid-cols-2">
      <Box title="Standard caregiver rates per day" right={edit && <button className="btn-sm" onClick={saveRates}>Save rates</button>}>
        <Table><thead><tr><th>Tier</th>{["day", "night", "live"].map((c) => <th key={c}>{CARE[c]} (₹)</th>)}<th>Caregivers</th></tr></thead>
          <tbody>{[1, 2, 3].map((t) => <tr key={t}><td className="font-semibold">Tier {t}</td>{["day", "night", "live"].map((c) => <td key={c}><input aria-label={`Tier ${t} ${CARE[c]}`} className="input-sm w-28" inputMode="numeric" disabled={!edit} value={rates[`${t}-${c}`] ?? ""} onChange={(e) => setRates({ ...rates, [`${t}-${c}`]: e.target.value })} /></td>)}
            <td>{d.caregiversByTier.find((x: any) => x.tier === t)?.n ?? 0}</td></tr>)}</tbody></Table>
        {edit && <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={apply} onChange={(e) => setApply(e.target.checked)} />Also move every caregiver of that tier to these rates (her own custom rates are replaced).</label>}
        <p className="note mt-2">What a family pays for one day of Tier 2 day care: ₹{Number(rates["2-day"] ?? 0).toLocaleString("en-IN")} care + {fee}% Uday fee + {gst}% GST on the fee = <b>₹{Math.round(Number(rates["2-day"] ?? 0) * (1 + fee / 100 * (1 + gst / 100))).toLocaleString("en-IN")}</b>. All prices are pilot assumptions.</p>
      </Box>
      <Box title="Fees and rules" right={edit && <button className="btn-sm" onClick={savePolicy}>Save policy</button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          {F("platformFeePct", "Uday fee on the care fee", "%", "GST rate is set in Settings, Business and GST")}{F("freeCancelHours", "Free cancellation until", "hours before")}
          {F("lateCancelPct", "Late cancellation fee", "% of one day", "Paid to the caregiver")}{F("offerSameDayMin", "Answer time, start within 24 h", "minutes")}
          {F("offerFutureMin", "Answer time, later starts", "minutes")}{F("missedCheckinGraceMin", "Missed check in alert after", "minutes")}
          {F("ticketSlaMin", "Help request answer time", "minutes")}{F("urgentTicketSlaMin", "Urgent help answer time", "minutes")}
          {F("urgentEscalateMin", "SOS and help: alert again every", "minutes", "Until someone responds")}{F("missedEscalateMin", "Missed check in: alert again every", "minutes")}
          <label className="grid gap-1 text-sm font-semibold sm:col-span-2">On call phones for urgent alerts<input className="input-sm" disabled={!edit} value={p.oncallPhones ?? ""} onChange={(e) => setP({ ...p, oncallPhones: e.target.value })} placeholder="+919822000000, +919822000001" />
            <span className={`text-xs font-normal ${p.oncallPhones ? "text-muted" : "text-red-700"}`}>{p.oncallPhones ? "Every SOS, help request and missed check in is sent to these numbers by SMS, so alerts do not depend on someone watching the console." : "Not set: urgent alerts reach the Uday team only if someone is watching the console. Add at least one number."}</span></label>
        </div><p className="note mt-2">Last changed {when(p.updatedAt)}.</p></Box>
    </div>
    <div className="mt-5"><OpsFamily /></div>
  </>);
}

// ───────── reports ─────────
export function Reports() {
  const [to, setTo] = useState(ist().slice(0, 10)); const [from, setFrom] = useState(ist(new Date(Date.now() - 29 * 864e5)).slice(0, 10));
  const { d, err } = useLoad<any>(`/api/ops/reports?from=${from}&to=${to}`);
  const preset = (n: number) => { setTo(ist().slice(0, 10)); setFrom(ist(new Date(Date.now() - (n - 1) * 864e5)).slice(0, 10)); };
  return (<>
    <Head title="Reports" sub="From the live records for the dates you choose. Download everything as one CSV.">
      <a className="btn-sm" href={`/api/ops/reports/csv?from=${from}&to=${to}`}>Download CSV</a></Head>
    <div className="mb-4 flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-sm font-semibold">From<input type="date" className="input-sm" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="grid gap-1 text-sm font-semibold">To<input type="date" className="input-sm" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      {[[7, "7 days"], [30, "30 days"], [90, "90 days"]].map(([n, l]) => <button key={n} className="btn-sm-ghost" onClick={() => preset(n as number)}>{l}</button>)}</div>
    {err && <p className="text-red-700">{err}</p>}
    {!d ? <p>Loading</p> : <div className="grid gap-5">
      <section><h2 className="mb-2 text-lg font-bold">Care</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Requests" value={d.bookings.requested} sub={`${d.bookings.confirmed} confirmed`} /><Kpi label="Fill rate" value={`${d.bookings.fill_rate}%`} sub={`${d.bookings.unfilled} unfilled`} tone={d.bookings.fill_rate < 80 && d.bookings.requested ? "alert" : undefined} />
        <Kpi label="Time to accept" value={`${d.bookings.minutesToAccept} min`} sub="average" /><Kpi label="Shifts started" value={d.shifts.started} sub={`${d.shifts.completed} completed`} />
        <Kpi label="No shows" value={d.shifts.no_shows} tone={d.shifts.no_shows ? "alert" : undefined} /><Kpi label="Day off cover" value={d.shifts.relief_days} sub={`${d.shifts.relief_unfilled} not found, ${d.shifts.relief_covered_by_regular} by the regular`} />
      </div></section>
      <section><h2 className="mb-2 text-lg font-bold">Money</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Collected" value={rs(d.money.collected)} sub={`refunded ${rs(d.money.refunded)}`} /><Kpi label="Uday fee earned" value={rs(d.money.fee_revenue)} sub={`GST ${rs(d.money.gst)}`} />
        <Kpi label="Caregivers earned" value={rs(d.money.caregiver_earnings)} sub={`paid out ${rs(d.money.paid_out)}`} /><Kpi label="Facility listings" value={rs(d.money.listing_revenue)} />
        <Kpi label="Uday Plus" value={rs(d.money.membership_revenue)} /><Kpi label="Goodwill refunds" value={rs(d.money.goodwill)} />
      </div></section>
      <section><h2 className="mb-2 text-lg font-bold">Seniors, help and safety</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Check ins" value={d.checkins.total} sub={`${d.checkins.seniors} seniors`} /><Kpi label="Asked for help" value={d.checkins.help + d.checkins.medical} sub={`${d.checkins.lonely} felt lonely`} />
        <Kpi label="Missed check in alerts" value={d.checkins.missed_alerts} /><Kpi label="SOS" value={d.checkins.sos} tone={d.checkins.sos ? "alert" : undefined} />
        <Kpi label="Help requests" value={d.help.opened} sub={`${d.help.within_sla}% resolved in time`} /><Kpi label="First answer" value={`${d.help.first_response_min} min`} sub="average" />
      </div></section>
      <section><h2 className="mb-2 text-lg font-bold">Growth</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="New families" value={d.growth.new_families} /><Kpi label="Parents added" value={d.growth.new_parents} /><Kpi label="Caregiver applications" value={d.growth.applications} />
        <Kpi label="Caregivers activated" value={d.growth.caregivers_activated} /><Kpi label="Joined Uday Plus" value={d.growth.plus_joined} /><Kpi label="Partner requests" value={d.growth.partner_leads} />
      </div></section>
      <div className="grid gap-5 xl:grid-cols-2">
        <Box title="Day by day"><Daily rows={d.daily} /></Box>
        <Box title="By care type"><Table empty={!d.byType.length && "No bookings"}><thead><tr><th>Care</th><th>Bookings</th><th>Value</th></tr></thead><tbody>{d.byType.map((t: any) => <tr key={t.care_type}><td>{CARE[t.care_type]}</td><td>{t.n}</td><td>{rs(t.value)}</td></tr>)}</tbody></Table>
          <h3 className="mb-1 mt-4 text-sm font-bold">Busiest areas</h3>{d.topAreas.map((a: any) => <div key={a.locality} className="flex justify-between text-sm"><span>{a.locality}</span><b>{a.n}</b></div>)}
          <h3 className="mb-1 mt-4 text-sm font-bold">Incidents</h3>{!d.incidents.length ? <p className="text-sm text-muted">None</p> : d.incidents.map((i: any, k: number) => <div key={k} className="flex justify-between text-sm"><span><Pill s={i.severity} /> {i.category.replace("_", " ")}</span><b>{i.n}</b></div>)}</Box>
      </div>
      <Box title="Caregivers"><Table empty={!d.caregivers.length && "None"}><thead><tr><th>Caregiver</th><th>Tier</th><th>Days worked</th><th>Earned</th><th>Rating</th></tr></thead>
        <tbody>{d.caregivers.map((c: any) => <tr key={c.display_name}><td>{c.display_name}</td><td>{c.tier}</td><td>{c.days_worked}</td><td>{rs(c.earned)}</td><td>{c.rating ? Number(c.rating).toFixed(1) : ""}</td></tr>)}</tbody></Table></Box>
    </div>}
  </>);
}
/** Bar chart of requests and collections per day: values sit on the bars' hover titles and in the CSV. */
function Daily({ rows }: { rows: any[] }) {
  const max = Math.max(1, ...rows.map((r) => r.requests)); const maxC = Math.max(1, ...rows.map((r) => Number(r.collected)));
  return (<div>
    <div className="flex h-40 items-end gap-[2px]" role="img" aria-label="Requests per day">{rows.map((r) => <div key={r.day} className="flex flex-1 flex-col justify-end" title={`${r.day}: ${r.requests} requests, ${r.shifts} shifts, ${r.checkins} check ins, ${rs(r.collected)} collected`}>
      <div className="rounded-t bg-indigo-600" style={{ height: `${(r.requests / max) * 100}%`, minHeight: r.requests ? 3 : 0 }} /></div>)}</div>
    <div className="mt-1 flex h-16 items-end gap-[2px]" role="img" aria-label="Money collected per day">{rows.map((r) => <div key={r.day} className="flex flex-1 flex-col justify-end"><div className="rounded-t bg-orange-400" style={{ height: `${(Number(r.collected) / maxC) * 100}%`, minHeight: Number(r.collected) ? 2 : 0 }} /></div>)}</div>
    <div className="mt-1 flex justify-between text-xs text-muted"><span>{rows[0]?.day}</span><span><span className="inline-block h-2 w-2 rounded-sm bg-indigo-600" /> requests (peak {max}) · <span className="inline-block h-2 w-2 rounded-sm bg-orange-400" /> collected (peak {rs(maxC)})</span><span>{rows[rows.length - 1]?.day}</span></div>
  </div>);
}

// ───────── team and audit ─────────
export function Team() {
  const { d, err, setD } = useLoad<any[]>("/api/ops/team"); const { can } = useOps(); const [m, setM] = useState<[boolean, string] | null>(null); const [n, setN] = useState({ name: "", phone: "", role: "agent" });
  async function act(body: any, ok: string) { setM(null); try { setD(await api("/api/ops/team", { body })); setM([true, ok]); } catch (e: any) { setM([false, e.message]); } }
  return (<>
    <Head title="Team" sub="Who can use this console and what they can do. Every change is recorded." />
    <Msg m={m} />{err && <p className="text-red-700">{err}</p>}
    <div className="mt-3 grid gap-5 xl:grid-cols-[1fr_360px]">
      <Box title="Members">{!d ? <p>Loading</p> : <Table><thead><tr><th>Name</th><th>Role</th><th>Last sign in</th><th></th></tr></thead>
        <tbody>{d.map((x) => <tr key={x.id} className={x.active ? "" : "opacity-60"}><td className="font-semibold">{x.name} <span className="text-xs text-muted">••{x.phone_last4}</span></td>
          <td>{can("team") ? <select aria-label={`Role for ${x.name}`} className="input-sm w-32" value={x.role} onChange={(e) => act({ action: "role", userId: x.id, role: e.target.value }, "Role changed")}>{["admin", "agent", "finance", "viewer"].map((r) => <option key={r}>{r}</option>)}</select> : <Pill s={x.role} />}</td>
          <td>{x.last_sign_in ? when(x.last_sign_in) : "never"}</td>
          <td>{can("team") && <button className="btn-sm-ghost" onClick={() => act({ action: "active", userId: x.id, active: !x.active }, x.active ? "Access switched off and signed out" : "Access switched on")}>{x.active ? "Switch off" : "Switch on"}</button>}</td></tr>)}</tbody></Table>}</Box>
      <div className="grid content-start gap-5">
        {can("team") && <Box title="Add a team member"><div className="grid gap-2">
          <input className="input-sm" placeholder="Name" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
          <input className="input-sm" placeholder="Mobile number" inputMode="tel" value={n.phone} onChange={(e) => setN({ ...n, phone: e.target.value })} />
          <select aria-label="Role" className="input-sm" value={n.role} onChange={(e) => setN({ ...n, role: e.target.value })}>{["agent", "finance", "viewer", "admin"].map((r) => <option key={r}>{r}</option>)}</select>
          <button className="btn-sm justify-self-start" disabled={!n.name || n.phone.replace(/\D/g, "").length < 10} onClick={() => act({ action: "add", ...n }, `${n.name} added. They sign in with this number.`).then(() => setN({ name: "", phone: "", role: "agent" }))}>Add</button>
          <p className="note">Use a work number that is not also a family or caregiver account.</p></div></Box>}
        <Box title="What each role can do"><ul className="grid gap-1.5 text-sm">
          <li><Pill s="admin" /> everything, including pricing, settings, team and removing a caregiver</li><li><Pill s="agent" /> bookings, help requests, incidents, caregivers and families, community</li>
          <li><Pill s="finance" /> payments, refunds, GST invoices, reconciliation, payouts, audit log</li><li><Pill s="viewer" /> sees everything, changes nothing</li></ul></Box>
      </div>
    </div>
  </>);
}
export function Audit() {
  const [tab, setTab] = useState("audit"); const [f, setF] = useState({ entity: "", from: "", to: "" }); const [mf, setMf] = useState({ channel: "", template: "" });
  const a = useLoad<any[]>(tab === "audit" ? `/api/ops/audit?${new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any)}` : null);
  const msg = useLoad<any[]>(tab === "messages" ? `/api/ops/messages?${new URLSearchParams(Object.entries(mf).filter(([, v]) => v) as any)}` : null);
  return (<>
    <Head title="Audit and messages" sub="Every change and every look at personal details by the team; every message Uday sent." />
    <Tabs value={tab} onChange={setTab} tabs={[["audit", "Audit log"], ["messages", "Messages sent"]]} />
    {tab === "audit" ? <><div className="mb-4 grid gap-2 sm:grid-cols-4">
      <select aria-label="What" className="input-sm" value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })}><option value="">Everything</option>{["booking", "ticket", "incident", "caregiver", "user", "team", "policy", "tier_rates", "integration", "business", "partners", "payouts", "reconciliation", "sos", "console"].map((x) => <option key={x}>{x}</option>)}</select>
      <input aria-label="From" type="date" className="input-sm" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /><input aria-label="To" type="date" className="input-sm" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
      <Box>{!a.d ? <p>{a.err || "Loading"}</p> : <Table empty={!a.d.length && "Nothing recorded"}><thead><tr><th>When</th><th>Who</th><th>Did</th><th>To</th><th>Note</th></tr></thead>
        <tbody>{a.d.map((x) => <tr key={x.id}><td className="whitespace-nowrap">{when(x.at)}</td><td>{x.actor ?? "system"}{x.role ? <div className="text-xs text-muted">{x.role}</div> : null}</td><td>{x.action.replace(/_/g, " ")}</td><td>{x.entity}{x.entity_id ? <div className="font-mono text-[11px] text-muted">{String(x.entity_id).slice(0, 8)}</div> : null}</td><td className="max-w-[360px] text-muted">{x.reason}</td></tr>)}</tbody></Table>}</Box></>
    : <><div className="mb-4 grid gap-2 sm:grid-cols-4">
      <select aria-label="Channel" className="input-sm" value={mf.channel} onChange={(e) => setMf({ ...mf, channel: e.target.value })}><option value="">All channels</option>{["push", "sms", "whatsapp", "email"].map((x) => <option key={x}>{x}</option>)}</select>
      <input className="input-sm" placeholder="Template, for example checkin_missed" value={mf.template} onChange={(e) => setMf({ ...mf, template: e.target.value })} /></div>
      <Box>{!msg.d ? <p>{msg.err || "Loading"}</p> : <Table empty={!msg.d.length && "Nothing sent"}><thead><tr><th>When</th><th>To</th><th>Channel</th><th>Message</th><th>Status</th></tr></thead>
        <tbody>{msg.d.map((x) => <tr key={x.id}><td className="whitespace-nowrap">{when(x.at)}</td><td>{x.name ?? (x.role ? x.role : "Uday team")}</td><td>{x.channel}</td><td>{x.template.replace(/_/g, " ")}</td><td><Pill s={x.status} /></td></tr>)}</tbody></Table>}</Box></>}
  </>);
}
