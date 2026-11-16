"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../api";
import { useOps } from "./Shell";
import { Box, CARE, Empty, Head, Kpi, Msg, Pill, ReasonAction, Table, Tabs, ago, day, rs, useLoad, when } from "./ui";

// ───────── Today ─────────
export function Today() {
  const { d, err, load } = useLoad<any>("/api/ops/dashboard", 15000); const { can } = useOps();
  if (err) return <p className="text-red-700">{err}</p>; if (!d) return <p>Loading</p>;
  const c = d.counts ?? {}; const t = d.today ?? {};
  const st = Object.fromEntries(d.byStatus.map((s: any) => [s.status, s.n]));
  return (<>
    <Head title="Today" sub={`Updated ${when(new Date(), { hour: "numeric", minute: "2-digit" })}. Refreshes every 15 seconds.`} />
    {!!d.sos.length && <div className="mb-5 rounded-xl border-2 border-red-500 bg-red-50 p-4" role="alert">
      <h2 className="font-bold text-red-800">Open SOS ({d.sos.length}): act now</h2>
      <div className="mt-2 grid gap-2">{d.sos.map((s: any) => <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 text-sm">
        <span><b>{s.name ?? "Someone"}</b> ({s.role}) · {ago(s.at)}{s.code ? <> · <Link className="font-semibold text-indigo-600" href={`/ops/bookings/${s.booking_id}`}>{s.code}</Link></> : null}{s.lat ? <> · <a className="font-semibold text-indigo-600" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${s.lat},${s.lng}`}>location</a></> : null}</span>
        {can("incidents") && <ReasonAction label="Mark handled" reasonLabel="What was done" run={(v) => api(`/api/ops/sos/${s.id}`, { body: { resolution: v.reason } }).then(load)} />}</div>)}</div>
    </div>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
      <Kpi label="Care in progress" value={(st.active ?? 0) + (st.arrived ?? 0) + (st.enroute ?? 0)} sub={`${st.accepted ?? 0} confirmed, not started`} />
      <Kpi label="Waiting for caregiver" value={c.waiting_offers ?? 0} sub={`${c.proposals ?? 0} need family approval`} tone={(c.waiting_offers ?? 0) > 5 ? "alert" : undefined} />
      <Kpi label="Help requests open" value={c.open_tickets ?? 0} sub={`${c.late_tickets ?? 0} past their time`} tone={c.late_tickets ? "alert" : undefined} />
      <Kpi label="Incidents open" value={c.open_incidents ?? 0} tone={d.incidents.some((i: any) => i.severity === "critical") ? "alert" : undefined} />
      <Kpi label="Check ins today" value={`${t.checkins ?? 0} / ${t.seniors ?? 0}`} sub="seniors who checked in" />
      <Kpi label="Collected today" value={rs(t.collected)} sub={`${t.shifts_started ?? 0} shifts started`} />
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <Box title="Incidents" right={<Link href="/ops/incidents" className="text-sm font-semibold text-indigo-600">All incidents</Link>}>
        {!d.incidents.length ? <Empty>No open incidents</Empty> : <div className="grid gap-2">{d.incidents.map((i: any) => <Link key={i.id} href={`/ops/incidents/${i.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2.5 text-sm hover:border-indigo-400">
          <Pill s={i.severity} /><b className="text-ink">{i.code}</b><span className="min-w-0 flex-1 truncate">{i.summary}</span><span className="text-muted">{ago(i.opened_at)}</span></Link>)}</div>}
      </Box>
      <Box title="Help requests" right={<Link href="/ops/help" className="text-sm font-semibold text-indigo-600">Help desk</Link>}>
        {!d.tickets.length ? <Empty>Nothing waiting</Empty> : <div className="grid gap-2">{d.tickets.map((x: any) => <Link key={x.id} href={`/ops/help/${x.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2.5 text-sm hover:border-indigo-400">
          {x.urgent && <Pill s="high">urgent</Pill>}<b className="text-ink">{x.code}</b><span className="min-w-0 flex-1 truncate">{x.category}</span><span className={new Date(x.sla_due_at) < new Date() ? "font-bold text-red-700" : "text-muted"}>due {ago(x.sla_due_at)}</span></Link>)}</div>}
      </Box>
    </div>
    <Box title="Queues" className="mt-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([["New caregiver applications", c.applications, "/ops/caregivers#queues"], ["Caregivers being verified", c.verifying, "/ops/caregivers#queues"], ["Leave requests", c.leave, "/ops/caregivers#queues"], ["Day off cover not found (2 days)", c.relief_unfilled, "/ops/care"],
          ["Failed weekly payments", c.failed_payments, "/ops/bookings?status=attention"], ["Facilities to review", c.facilities_review, "/ops/caregivers#queues"], ["Community reports", c.reports, "/ops/community"], ["Caregivers online", `${c.online_caregivers ?? 0} / ${c.active_caregivers ?? 0}`, "/ops/caregivers"]] as [string, any, string][])
          .map(([l, v, h]) => <Link key={l} href={h} className="kpi hover:border-indigo-400"><div className="text-xs font-bold uppercase tracking-wider text-muted">{l}</div><div className="mt-1 font-display text-2xl font-extrabold text-ink">{v ?? 0}</div></Link>)}
      </div>
    </Box>
  </>);
}

// ───────── Bookings ─────────
export function Bookings({ initial }: { initial?: string }) {
  const [f, setF] = useState({ status: initial ?? "live", q: "", care: "", from: "", to: "" });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const { d, err } = useLoad<any[]>(`/api/ops/bookings?${qs}`, 30000);
  return (<>
    <Head title="Bookings" sub="Every request and booking. Open one to see its timeline, money and to step in." />
    <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
      <select aria-label="Status" className="input-sm" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
        {[["live", "Live (not finished)"], ["attention", "Needs attention"], ["offered", "Waiting for caregiver"], ["proposal", "Needs family approval"], ["accepted", "Confirmed"], ["active", "Care in progress"], ["completed", "Completed"], ["closed", "Closed"], ["cancelled", "Cancelled"], ["released", "Released"], ["", "All"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <select aria-label="Care type" className="input-sm" value={f.care} onChange={(e) => setF({ ...f, care: e.target.value })}><option value="">All care</option><option value="day">Day</option><option value="night">Night</option><option value="live">Live in</option></select>
      <input aria-label="Start from" type="date" className="input-sm" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
      <input aria-label="Start to" type="date" className="input-sm" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
      <input className="input-sm lg:col-span-2" placeholder="Code, parent, caregiver or area" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
    </div>
    {err && <p className="text-red-700">{err}</p>}
    <Box>{!d ? <p>Loading</p> : <Table empty={!d.length && "No bookings match"}>
      <thead><tr><th>Code</th><th>Status</th><th>Parent</th><th>Caregiver</th><th>Care</th><th>Starts</th><th>Value</th><th></th></tr></thead>
      <tbody>{d.map((b) => <tr key={b.id}><td><Link className="font-bold text-indigo-700" href={`/ops/bookings/${b.id}`}>{b.code}</Link></td><td><Pill s={b.status} />{b.status === "offered" && b.offer_expires_at ? <div className="text-xs text-muted">answer {ago(b.offer_expires_at)}</div> : null}</td>
        <td>{b.recipient}<div className="text-xs text-muted">{b.locality}</div></td><td>{b.caregiver}<div className="text-xs text-muted">Tier {b.tier}</div></td><td>{CARE[b.care_type]} · {b.days_done}/{b.days} days</td>
        <td className="whitespace-nowrap">{day(b.start_date)}</td><td className="whitespace-nowrap">{rs(b.total_paise)}{b.billing === "weekly" ? <div className="text-xs text-muted">paid {rs(b.paid_paise)}</div> : null}</td>
        <td>{b.open_tickets ? <Pill s="open">{b.open_tickets} help</Pill> : null}</td></tr>)}</tbody></Table>}</Box>
  </>);
}
export function BookingDetail({ id }: { id: string }) {
  const { d, err, load, setD } = useLoad<any>(`/api/ops/bookings/${id}`); const { can } = useOps(); const [m, setM] = useState<[boolean, string] | null>(null); const [tab, setTab] = useState("timeline"); const [note, setNote] = useState("");
  async function act(body: any, ok: string) { setM(null); try { const r = await api(`/api/ops/bookings/${id}`, { body }); setD(r); setM([true, ok]); } catch (e: any) { setM([false, e.message]); throw e; } }
  if (err) return <p className="text-red-700">{err}</p>; if (!d) return <p>Loading</p>;
  const b = d.booking; const live = !["closed", "cancelled", "released"].includes(b.status);
  return (<>
    <Link href="/ops/bookings" className="text-sm font-semibold text-indigo-600">← Bookings</Link>
    <Head title={b.code} sub={`${CARE[b.care_type]} care for ${b.recipient}, ${b.locality} · ${b.days} days from ${day(b.start_date)} · ${String(b.start_time).slice(0, 5)}`}>
      <Pill s={b.status} /><a className="btn-sm-ghost" href={`/api/bookings/${id}/invoice`} target="_blank" rel="noreferrer">Invoices (PDF)</a></Head>
    <Msg m={m} />
    <div className="mt-3 grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="grid min-w-0 gap-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Caregiver" value={<span className="text-lg">{b.caregiver}</span>} sub={`Tier ${b.cg_tier}${b.proposed ? ` · proposed: ${b.proposed}` : ""}`} />
          <Kpi label="Progress" value={`${b.days_done} / ${b.days}`} sub="days done" />
          <Kpi label="Total" value={rs(b.total_paise)} sub={`paid ${rs(b.paid_paise)}${b.refund_paise ? ` · refunded ${rs(b.refund_paise)}` : ""}`} />
          <Kpi label="In escrow" value={rs(d.escrow)} sub={b.billing === "weekly" ? `weekly · auto pay ${d.mandate?.status ?? "off"}` : "paid up front"} />
        </div>
        <Tabs value={tab} onChange={setTab} tabs={[["timeline", "Timeline"], ["money", "Money"], ["shifts", "Shifts"], ["help", `Help and incidents (${d.tickets.length + d.incidents.length})`]]} />
        {tab === "timeline" && <Box title="What happened">{d.events.map((e: any, k: number) => <div key={k} className="grid grid-cols-[110px_1fr] gap-3 border-b border-line/60 py-2 text-sm last:border-0">
          <span className="text-muted">{when(e.at)}</span><span><span className="mr-2 text-xs font-bold uppercase text-muted">{e.actor_role}</span>{e.to_status ? <Pill s={e.to_status} /> : null} {e.message}</span></div>)}</Box>}
        {tab === "money" && <div className="grid gap-5">
          <Box title="Payments"><Table empty={!d.payments.length && "No payments"}><thead><tr><th>When</th><th>Method</th><th>Amount</th><th>Captured</th><th>Refunded</th><th>Status</th><th>Reference</th></tr></thead>
            <tbody>{d.payments.map((p: any, k: number) => <tr key={k}><td>{when(p.created_at)}</td><td>{p.method}</td><td>{rs(p.amount_paise)}</td><td>{rs(p.captured_paise)}</td><td>{rs(p.refunded_paise)}</td><td><Pill s={p.status} /></td><td className="font-mono text-xs">{p.payment_id ?? p.gateway_ref}</td></tr>)}</tbody></Table></Box>
          {!!d.cycles.length && <Box title="Weekly payments"><Table><thead><tr><th>Week</th><th>Days</th><th>Amount</th><th>Status</th><th>Due</th></tr></thead>
            <tbody>{d.cycles.map((y: any) => <tr key={y.cycle_no}><td>{y.cycle_no}</td><td>{y.from_day} to {y.to_day}</td><td>{rs(y.amount_paise)}</td><td><Pill s={y.status} />{y.fail_reason ? <div className="text-xs text-muted">{y.fail_reason === "no_autopay" ? "no auto pay" : "declined"}</div> : null}</td><td>{when(y.due_at)}</td></tr>)}</tbody></Table></Box>}
          <Box title="Ledger"><Table empty={!d.ledger.length && "No entries"}><thead><tr><th>When</th><th>Account</th><th>Debit</th><th>Credit</th><th>Reason</th></tr></thead>
            <tbody>{d.ledger.map((l: any, k: number) => <tr key={k}><td>{when(l.at)}</td><td className="font-mono text-xs">{l.account.replace(/caregiver:.*/, "caregiver")}</td><td>{l.debit_paise ? rs(l.debit_paise) : ""}</td><td>{l.credit_paise ? rs(l.credit_paise) : ""}</td><td>{l.reason}</td></tr>)}</tbody></Table></Box>
          <Box title="Invoices and credit notes"><Table empty={!d.invoices.length && "None issued yet"}><thead><tr><th>Number</th><th>Type</th><th>Date</th><th>Total</th></tr></thead>
            <tbody>{d.invoices.map((i: any) => <tr key={i.id}><td className="font-mono text-xs">{i.number}</td><td>{i.kind === "invoice" ? "Invoice" : "Credit note"}</td><td>{day(i.issued_at)}</td><td>{rs(i.total_paise)}</td></tr>)}</tbody></Table></Box>
        </div>}
        {tab === "shifts" && <div className="grid gap-5"><Box title="Attendance"><Table empty={!d.attendance.length && "No shifts yet"}><thead><tr><th>Day</th><th>What</th><th>When</th></tr></thead>
          <tbody>{d.attendance.map((a: any, k: number) => <tr key={k}><td>{a.day}</td><td>{a.kind.replace("_", " ")}</td><td>{when(a.at)}</td></tr>)}</tbody></Table></Box>
          {!!d.relief.length && <Box title="Day off cover"><Table><thead><tr><th>Day</th><th>Date</th><th>Status</th><th>Relief caregiver</th></tr></thead>
            <tbody>{d.relief.map((r: any) => <tr key={r.day_no}><td>{r.day_no}</td><td>{day(r.day_date)}</td><td><Pill s={r.status === "done" ? "clear" : r.status === "covered" ? "accepted" : r.status === "cancelled" ? "cancelled" : "pending"}>{r.status}</Pill></td><td>{r.caregiver ?? ""}</td></tr>)}</tbody></Table></Box>}</div>}
        {tab === "help" && <div className="grid gap-5">
          <Box title="Help requests">{!d.tickets.length ? <Empty>None</Empty> : d.tickets.map((t: any) => <Link key={t.id} href={`/ops/help/${t.id}`} className="flex gap-2 border-b border-line py-2 text-sm last:border-0"><b>{t.code}</b>{t.category}<Pill s={t.status} /></Link>)}</Box>
          <Box title="Incidents" right={can("incidents") && <NewIncident bookingId={id} onDone={load} />}>{!d.incidents.length ? <Empty>None</Empty> : d.incidents.map((i: any) => <Link key={i.id} href={`/ops/incidents/${i.id}`} className="flex gap-2 border-b border-line py-2 text-sm last:border-0"><Pill s={i.severity} /><b>{i.code}</b>{i.summary}<Pill s={i.status} /></Link>)}</Box>
        </div>}
      </div>
      <div className="grid content-start gap-5">
        {can("bookings") && live && <Box title="Step in">
          <div className="grid gap-2">
            {b.status === "offered" && <ReasonAction label="Give more time to answer" reasonLabel="Why" fields={(v, set) => <label className="grid gap-1 text-sm font-semibold">Extra minutes<select className="input-sm" value={v.minutes ?? 60} onChange={(e) => set("minutes", Number(e.target.value))}>{[30, 60, 120, 240].map((x) => <option key={x} value={x}>{x}</option>)}</select></label>}
              run={(v) => act({ action: "extend_offer", minutes: v.minutes ?? 60 }, "Answer time extended")} />}
            {["offered", "proposal", "accepted", "enroute"].includes(b.status) && <ReasonAction label="Move to another caregiver" confirm="Same price. The new caregiver gets the request and must accept. The family is told."
              fields={(v, set) => <label className="grid gap-1 text-sm font-semibold">Caregiver ({d.candidates.length} free, same tier or higher)<select className="input-sm" value={v.caregiverId ?? ""} onChange={(e) => set("caregiverId", e.target.value)}><option value="">Choose</option>
                {d.candidates.map((c: any) => <option key={c.id} value={c.id}>{c.display_name} · Tier {c.tier} · {c.area ?? ""}{c.rating ? ` · ${Number(c.rating).toFixed(1)}★` : ""}</option>)}</select></label>}
              run={(v) => { if (!v.caregiverId) throw new Error("Choose a caregiver"); return act({ action: "reassign", caregiverId: v.caregiverId, reason: v.reason }, "Moved. Waiting for her to accept."); }} />}
            {["offered", "accepted", "enroute", "active"].includes(b.status) && <ReasonAction label="Propose the next caregiver" confirm="Uday picks the next free caregiver of the same tier. The family approves before anyone is sent."
              run={(v) => act({ action: "propose_next", reason: v.reason }, "Proposal sent to the family")} />}
            {["offered", "proposal"].includes(b.status) && <ReasonAction label="Close request, release hold" danger run={(v) => act({ action: "release", reason: v.reason }, "Request closed, hold released")} />}
            <ReasonAction label="Cancel booking" danger confirm="Unused days are refunded. Choose the refund."
              fields={(v, set) => <label className="grid gap-1 text-sm font-semibold">Refund<select className="input-sm" value={v.refund ?? "policy"} onChange={(e) => set("refund", e.target.value)}><option value="policy">By policy (late fee may apply)</option><option value="full">Full: everything not yet used</option></select></label>}
              run={(v) => act({ action: "cancel", refund: v.refund ?? "policy", reason: v.reason }, "Booking cancelled")} />
          </div></Box>}
        {can("money") && <Box title="Goodwill refund"><p className="mb-2 text-sm text-muted">Comes out of Uday's fee, never the caregiver's pay. A credit note is issued.</p>
          <ReasonAction label="Refund an amount" fields={(v, set) => <label className="grid gap-1 text-sm font-semibold">Amount (₹)<input className="input-sm" inputMode="numeric" value={v.rupees ?? ""} onChange={(e) => set("rupees", e.target.value)} /></label>}
            run={(v) => act({ action: "refund", amountPaise: Math.round(Number(v.rupees) * 100), reason: v.reason }, "Refund sent")} /></Box>}
        <Box title="Internal notes"><p className="mb-2 text-xs text-muted">Only the Uday team sees these.</p>
          {d.notes.map((n: any, k: number) => <div key={k} className="border-b border-line py-2 text-sm"><div className="text-xs text-muted">{n.name} · {when(n.created_at)}</div>{n.body}</div>)}
          {can("bookings") && <div className="mt-2 grid gap-2"><textarea className="input-sm min-h-[60px] py-2" aria-label="New note" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-sm justify-self-start" disabled={!note.trim()} onClick={() => act({ action: "note", body: note }, "Note saved").then(() => setNote(""))}>Add note</button></div>}</Box>
        <Box title="People"><div className="grid gap-1 text-sm"><Link className="font-semibold text-indigo-600" href={`/ops/caregivers/${b.caregiver_id}`}>{b.caregiver} (caregiver)</Link>
          <Link className="font-semibold text-indigo-600" href={`/ops/people/${b.payer_id}`}>{b.payer ?? "Payer"} ••{b.payer_last4} (paying)</Link></div></Box>
      </div>
    </div>
  </>);
}
function NewIncident({ bookingId, ticketId, onDone }: { bookingId?: string; ticketId?: string; onDone?: (id: string) => void }) {
  const router = useRouter();
  return <ReasonAction label="Open incident" reasonLabel="What happened" fields={(v, set) => <div className="grid grid-cols-2 gap-2">
    <label className="grid gap-1 text-sm font-semibold">Severity<select className="input-sm" value={v.severity ?? "medium"} onChange={(e) => set("severity", e.target.value)}>{["critical", "high", "medium", "low"].map((x) => <option key={x}>{x}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-semibold">Type<select className="input-sm" value={v.category ?? "conduct"} onChange={(e) => set("category", e.target.value)}>{["safety", "medical", "theft", "abuse", "conduct", "no_show", "data", "payment", "other"].map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</select></label></div>}
    run={async (v) => { const r = await api("/api/ops/incidents", { body: { severity: v.severity ?? "medium", category: v.category ?? "conduct", summary: v.reason, bookingId, ticketId } }); onDone?.(r.id); router.push(`/ops/incidents/${r.id}`); }} />;
}

// ───────── Help desk ─────────
export function Help() {
  const [f, setF] = useState({ status: "open", mine: "", q: "" });
  const { d, err } = useLoad<any[]>(`/api/ops/tickets?status=${f.status}&mine=${f.mine}&q=${encodeURIComponent(f.q)}`, 20000);
  return (<>
    <Head title="Help requests" sub="From families, seniors and caregivers. Urgent ones first, then by when they are due." />
    <div className="mb-4 flex flex-wrap gap-2">
      <Tabs value={f.status} onChange={(s) => setF({ ...f, status: s })} tabs={[["open", "Open"], ["in_progress", "In progress"], ["waiting", "Waiting for reply"], ["resolved", "Resolved"], ["all", "All"]]} />
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!f.mine} onChange={(e) => setF({ ...f, mine: e.target.checked ? "1" : "" })} />Assigned to me</label>
      <input className="input-sm max-w-xs" placeholder="Code or topic" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
    </div>
    {err && <p className="text-red-700">{err}</p>}
    <Box>{!d ? <p>Loading</p> : <Table empty={!d.length && "Nothing here"}>
      <thead><tr><th>Code</th><th>Topic</th><th>From</th><th>Booking</th><th>Status</th><th>Due</th><th>With</th></tr></thead>
      <tbody>{d.map((t) => <tr key={t.id}><td><Link href={`/ops/help/${t.id}`} className="font-bold text-indigo-700">{t.code}</Link></td><td>{t.urgent && <Pill s="high">urgent</Pill>} {t.category}</td><td>{t.person}<div className="text-xs text-muted">{t.role}</div></td>
        <td>{t.booking ?? ""}</td><td><Pill s={t.status} /></td><td className={t.late ? "font-bold text-red-700" : "text-muted"}>{t.status === "resolved" ? day(t.resolved_at) : ago(t.sla_due_at)}</td><td>{t.assignee ?? ""}</td></tr>)}</tbody></Table>}</Box>
  </>);
}
export function TicketDetail({ id }: { id: string }) {
  const { d, err, setD } = useLoad<any>(`/api/ops/tickets/${id}`); const team = useLoad<any[]>("/api/ops/team"); const { can } = useOps();
  const [m, setM] = useState<[boolean, string] | null>(null); const [txt, setTxt] = useState(""); const [mode, setMode] = useState<"note" | "reply">("reply");
  async function act(body: any, ok: string) { setM(null); try { setD(await api(`/api/ops/tickets/${id}`, { body })); setM([true, ok]); } catch (e: any) { setM([false, e.message]); throw e; } }
  if (err) return <p className="text-red-700">{err}</p>; if (!d) return <p>Loading</p>;
  const t = d.ticket; const done = t.status === "resolved";
  return (<>
    <Link href="/ops/help" className="text-sm font-semibold text-indigo-600">← Help requests</Link>
    <Head title={`${t.code}: ${t.category}`} sub={`From ${t.person ?? "user"} (${t.role}) ••${t.phone_last4} · opened ${when(t.created_at)} · due ${when(t.sla_due_at)}`}><Pill s={t.status} />{t.urgent && <Pill s="high">urgent</Pill>}</Head>
    <Msg m={m} />
    <div className="mt-3 grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="grid min-w-0 content-start gap-5">
        <Box title="What they said"><p className="whitespace-pre-wrap text-sm">{t.text || "No message. Category only."}</p>{t.booking && <Link href={`/ops/bookings/${t.booking_id}`} className="mt-2 inline-block text-sm font-semibold text-indigo-600">Booking {t.booking}</Link>}</Box>
        <Box title="Conversation and notes">{!d.notes.length ? <Empty>Nothing yet</Empty> : d.notes.map((n: any) => <div key={n.id} className={`mb-2 rounded-lg p-3 text-sm ${n.to_user ? "bg-indigo-50" : "border border-dashed border-line"}`}>
          <div className="text-xs text-muted">{n.name} · {when(n.created_at)} · {n.to_user ? "sent to them" : "internal note"}</div><p className="whitespace-pre-wrap">{n.body}</p></div>)}
          {can("help") && !done && <div className="mt-3 grid gap-2">
            <div className="flex gap-2"><button className={mode === "reply" ? "btn-sm" : "btn-sm-ghost"} onClick={() => setMode("reply")}>Reply to them</button><button className={mode === "note" ? "btn-sm" : "btn-sm-ghost"} onClick={() => setMode("note")}>Internal note</button></div>
            <textarea className="input-sm min-h-[90px] py-2" aria-label={mode === "reply" ? "Reply" : "Note"} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={mode === "reply" ? "Sent to them by SMS and in the app" : "Only the team sees this"} />
            <button className="btn-sm justify-self-start" disabled={!txt.trim()} onClick={() => act({ action: mode, body: txt }, mode === "reply" ? "Reply sent" : "Note saved").then(() => setTxt(""))}>{mode === "reply" ? "Send reply" : "Save note"}</button></div>}
        </Box>
        {done && <Box title="Resolution"><p className="text-sm">{t.resolution}</p><p className="note mt-1">Resolved {when(t.resolved_at)}</p></Box>}
      </div>
      {can("help") && <div className="grid content-start gap-5"><Box title="Handle">
        <div className="grid gap-2">
          <label className="grid gap-1 text-sm font-semibold">Assigned to<select className="input-sm" value={t.assigned_to ?? ""} onChange={(e) => act({ action: "assign", userId: e.target.value || null }, "Assigned")}><option value="">Nobody</option>{(team.d ?? []).filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          {!done && <label className="grid gap-1 text-sm font-semibold">Status<select className="input-sm" value={t.status} onChange={(e) => act({ action: "status", status: e.target.value }, "Status changed")}><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting">Waiting for their reply</option></select></label>}
          {!done ? <ReasonAction label="Resolve" reasonLabel="What was done (sent to them)" run={(v) => act({ action: "resolve", resolution: v.reason }, "Resolved and they were told")} />
            : <button className="btn-sm-ghost" onClick={() => act({ action: "reopen" }, "Reopened")}>Reopen</button>}
          {d.incident ? <Link className="text-sm font-semibold text-indigo-600" href={`/ops/incidents/${d.incident.id}`}>Incident {d.incident.code}</Link> : can("incidents") && <NewIncident ticketId={id} bookingId={t.booking_id ?? undefined} />}
        </div></Box></div>}
    </div>
  </>);
}

// ───────── Incidents ─────────
export function Incidents() {
  const [s, setS] = useState("open"); const { d, err } = useLoad<any[]>(`/api/ops/incidents?status=${s}`, 30000); const { can } = useOps();
  return (<>
    <Head title="Incidents" sub="Safety, medical, theft, abuse, conduct and no shows. Every SOS opens a critical incident.">{can("incidents") && <NewIncident />}</Head>
    <Tabs value={s} onChange={setS} tabs={[["open", "Open"], ["closed", "Closed"], ["all", "All"]]} />
    {err && <p className="text-red-700">{err}</p>}
    <Box>{!d ? <p>Loading</p> : <Table empty={!d.length && "No incidents"}>
      <thead><tr><th>Code</th><th>Severity</th><th>Type</th><th>Summary</th><th>Caregiver</th><th>Status</th><th>Owner</th><th>Opened</th></tr></thead>
      <tbody>{d.map((i) => <tr key={i.id}><td><Link href={`/ops/incidents/${i.id}`} className="font-bold text-indigo-700">{i.code}</Link></td><td><Pill s={i.severity} /></td><td>{i.category.replace("_", " ")}</td><td className="max-w-[320px]">{i.summary}</td>
        <td>{i.caregiver ?? ""}{i.caregiver_action ? <div className="text-xs text-muted">{i.caregiver_action}</div> : null}</td><td><Pill s={i.status} /></td><td>{i.owner ?? ""}</td><td className="whitespace-nowrap text-muted">{ago(i.opened_at)}</td></tr>)}</tbody></Table>}</Box>
  </>);
}
export function IncidentDetail({ id }: { id: string }) {
  const { d, err, setD } = useLoad<any>(`/api/ops/incidents/${id}`); const team = useLoad<any[]>("/api/ops/team"); const { can, role } = useOps();
  const [m, setM] = useState<[boolean, string] | null>(null); const [txt, setTxt] = useState("");
  async function act(body: any, ok: string) { setM(null); try { setD(await api(`/api/ops/incidents/${id}`, { body })); setM([true, ok]); } catch (e: any) { setM([false, e.message]); throw e; } }
  if (err) return <p className="text-red-700">{err}</p>; if (!d) return <p>Loading</p>;
  const i = d.incident; const closed = i.status === "closed"; const edit = can("incidents");
  return (<>
    <Link href="/ops/incidents" className="text-sm font-semibold text-indigo-600">← Incidents</Link>
    <Head title={`${i.code}`} sub={i.summary}><Pill s={i.severity} /><Pill s={i.status} /></Head>
    <Msg m={m} />
    <div className="mt-3 grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="grid min-w-0 content-start gap-5">
        <Box title="Timeline">{d.events.map((e: any, k: number) => <div key={k} className="grid grid-cols-[110px_1fr] gap-3 border-b border-line/60 py-2 text-sm last:border-0"><span className="text-muted">{when(e.at)}</span>
          <span><span className="mr-2 text-xs font-bold uppercase text-muted">{e.kind}</span>{e.body}{e.name ? <span className="text-muted"> · {e.name}</span> : null}</span></div>)}
          {edit && !closed && <div className="mt-3 grid gap-2"><textarea className="input-sm min-h-[80px] py-2" aria-label="Add to timeline" placeholder="What you found, who you spoke to, what was agreed" value={txt} onChange={(e) => setTxt(e.target.value)} />
            <button className="btn-sm justify-self-start" disabled={!txt.trim()} onClick={() => act({ action: "note", body: txt }, "Added").then(() => setTxt(""))}>Add to timeline</button></div>}</Box>
        {closed && <Box title="Outcome"><p className="text-sm">{i.outcome}</p><p className="note mt-1">Closed {when(i.closed_at)}</p></Box>}
      </div>
      <div className="grid content-start gap-5">
        <Box title="Linked"><div className="grid gap-1 text-sm">
          {i.booking && <Link className="font-semibold text-indigo-600" href={`/ops/bookings/${i.booking_id}`}>Booking {i.booking}</Link>}
          {i.caregiver && <Link className="font-semibold text-indigo-600" href={`/ops/caregivers/${i.caregiver_id}`}>{i.caregiver} (caregiver, now {i.caregiver_status})</Link>}
          {i.recipient && <span>Parent: {i.recipient}</span>}{i.ticket && <Link className="font-semibold text-indigo-600" href={`/ops/help/${i.ticket_id}`}>Help request {i.ticket}</Link>}
          <span>Police: {i.police_reported ? "reported" : "not reported"}</span><span>Caregiver action: {i.caregiver_action ?? "not recorded"}</span></div></Box>
        {edit && <Box title="Handle"><div className="grid gap-2">
          {!closed && <>
            <label className="grid gap-1 text-sm font-semibold">Owner<select className="input-sm" value={i.owner_id ?? ""} onChange={(e) => e.target.value && act({ action: "owner", userId: e.target.value }, "Owner set")}><option value="">Choose</option>{(team.d ?? []).filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-semibold">Severity<select className="input-sm" value={i.severity} onChange={(e) => act({ action: "severity", severity: e.target.value }, "Severity changed")}>{["critical", "high", "medium", "low"].map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-semibold">Status<select className="input-sm" value={i.status} onChange={(e) => act({ action: "status", status: e.target.value }, "Status changed")}><option value="open">Open</option><option value="investigating">Investigating</option><option value="action_taken">Action taken</option></select></label>
            {i.caregiver_id && <ReasonAction label="Caregiver action" fields={(v, set) => <label className="grid gap-1 text-sm font-semibold">Action<select className="input-sm" value={v.a ?? "coaching"} onChange={(e) => set("a", e.target.value)}>
              {["none", "coaching", "warning", "paused", ...(role === "admin" ? ["removed"] : [])].map((x) => <option key={x} value={x}>{x === "paused" ? "paused (no new work)" : x === "removed" ? "removed from Uday" : x}</option>)}</select></label>}
              run={(v) => act({ action: "caregiver", caregiverAction: v.a ?? "coaching", reason: v.reason }, "Caregiver action recorded")} />}
            <ReasonAction label={i.police_reported ? "Police: mark not reported" : "Police: mark reported"} reasonLabel="Reference or note" run={(v) => act({ action: "police", reported: !i.police_reported, reference: v.reason }, "Recorded")} />
            <ReasonAction label="Close incident" reasonLabel="Outcome" run={(v) => act({ action: "close", outcome: v.reason }, "Closed")} />
          </>}
          {closed && <button className="btn-sm-ghost" onClick={() => act({ action: "reopen" }, "Reopened")}>Reopen</button>}
        </div></Box>}
      </div>
    </div>
  </>);
}
