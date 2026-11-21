"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "../api";
import { Box, CARE, Empty, Head, Kpi, Msg, Pill, ReasonAction, Table, Tabs, useLoad, when } from "./ui";

const ist = (offset = 0) => new Date(Date.now() + 5.5 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
function monday(d = ist()) { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); }
const shiftWeek = (w: string, n: number) => new Date(new Date(w + "T00:00:00Z").getTime() + n * 7 * 86400e3).toISOString().slice(0, 10);

/** Care insights: tomorrow's risks, care flags, spoken requests and the weekly quality report. */
export function Insights() {
  const [tab, setTab] = useState("risks");
  return (<div>
    <Head title="Care insights" sub="Rules and records first. Where AI is used it only flags and summarises; a person decides." />
    <Tabs value={tab} onChange={setTab} tabs={[["risks", "Tomorrow's risks"], ["flags", "Care flags"], ["voice", "Spoken requests"], ["quality", "Weekly quality"]]} />
    {tab === "risks" && <Risks />}{tab === "flags" && <Flags />}{tab === "voice" && <Voice />}{tab === "quality" && <Quality />}
  </div>);
}

function Risks() {
  const [date, setDate] = useState(ist(1)); const { d, err } = useLoad<any>(`/api/ops/insights?view=risks&date=${date}`);
  return (<div className="grid gap-4">
    <div className="flex flex-wrap items-center gap-2"><label className="text-sm font-semibold">Day <input type="date" className="input-sm ml-1" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <button className="btn-sm-ghost" onClick={() => setDate(ist(0))}>Today</button><button className="btn-sm-ghost" onClick={() => setDate(ist(1))}>Tomorrow</button></div>
    {err && <Msg m={[false, err]} />}
    {d && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><Kpi label="Shifts that day" value={d.shifts} /><Kpi label="At risk" value={d.atRisk.length} tone={d.atRisk.length ? "alert" : "ok"} />
      <Kpi label="High risk" value={d.atRisk.filter((r: any) => r.level === "high").length} tone={d.atRisk.some((r: any) => r.level === "high") ? "alert" : undefined} /></div>}
    {d && !d.atRisk.length && <Empty>No shift that day shows a known risk.</Empty>}
    {d?.atRisk.map((r: any) => (
      <Box key={r.bookingId} title={<span>{r.senior} · {r.locality} · {CARE[r.careType]} {r.time} · day {r.day}</span>} right={<span className="flex items-center gap-2"><Pill s={r.level === "high" ? "urgent" : "waiting"}>{r.level === "high" ? "High risk" : "Watch"}</Pill><Link className="text-sm font-semibold text-indigo-600" href={`/ops/bookings/${r.bookingId}`}>{r.code}</Link></span>}>
        <p className="text-sm"><b>{r.reasons.some((x: any) => x.text === "No caregiver has accepted yet") ? "Offered to" : "Caregiver"}:</b> {r.caregiver ?? "none yet"}</p>
        <ul className="mt-2 grid gap-1 text-sm">{r.reasons.map((x: any) => <li key={x.text} className={x.level === "high" ? "font-semibold text-red-700" : ""}>• {x.text}</li>)}</ul>
        <div className="mt-3 border-t border-line pt-3"><b className="text-sm">Standby: free that day</b>
          {r.standby.length ? <ul className="mt-1 grid gap-1 text-sm">{r.standby.map((c: any) => <li key={c.id}>{c.name} (Tier {c.tier}, ★ {Number(c.rating).toFixed(1)}): {c.reasons.join(" · ")}</li>)}</ul> : <p className="text-sm text-muted">No free caregiver found. Widen the area or tier.</p>}
          <p className="mt-1 text-xs text-muted">Ring the standby first, then reassign from the booking page.</p></div>
      </Box>))}
  </div>);
}

function Flags() {
  const [status, setStatus] = useState<"open" | "reviewed">("open"); const { d, err, load } = useLoad<any[]>(`/api/ops/insights?view=flags&status=${status}`);
  return (<div className="grid gap-3">
    <p className="text-sm text-muted">Things in caregivers' records that a person should look at. A flag is not an emergency and not a diagnosis. Call the family when in doubt.</p>
    <Tabs value={status} onChange={(v) => setStatus(v as any)} tabs={[["open", "To review"], ["reviewed", "Reviewed"]]} />
    {err && <Msg m={[false, err]} />}
    <Table empty={d && !d.length ? (status === "open" ? "Nothing to review." : "None yet.") : false}>
      <thead><tr><th>When</th><th>Senior</th><th>What</th><th>Detail</th><th>Found by</th><th></th></tr></thead>
      <tbody>{d?.map((f) => <tr key={f.id}><td className="whitespace-nowrap">{when(f.at)}</td><td>{f.senior}<div className="text-xs text-muted">{f.locality} · {f.caregiver}</div></td>
        <td><Pill s="waiting">{f.what}</Pill></td><td className="max-w-md">{f.detail}{f.note && <div className="mt-1 text-xs text-muted">Reviewed: {f.note}</div>}</td><td>{f.source === "ai" ? "AI" : "Rules"}</td>
        <td>{status === "open" && <ReasonAction label="Mark reviewed" reasonLabel="What you did (recorded)" run={(v) => api("/api/ops/insights", { body: { action: "review_flag", id: f.id, note: v.reason } }).then(load)} />}
          {f.bookingId && <Link className="block text-sm font-semibold text-indigo-600" href={`/ops/bookings/${f.bookingId}`}>{f.code}</Link>}</td></tr>)}</tbody>
    </Table>
  </div>);
}

function Voice() {
  const { d, err, load } = useLoad<any[]>("/api/ops/insights?view=voice", 30000);
  const set = (id: string, status: string) => api("/api/ops/insights", { body: { action: "voice", id, status } }).then(load);
  return (<div className="grid gap-3">
    <p className="text-sm text-muted">What seniors said to Speak to Uday. Urgent requests also raise an alert on the Today page. Listening is recorded in the audit log.</p>
    {err && <Msg m={[false, err]} />}{d && !d.length && <Empty>No open spoken requests.</Empty>}
    {d?.map((v) => <Box key={v.id} title={<span>{v.name ?? "Senior"} · {v.locality} · {v.what}</span>} right={<span className="flex items-center gap-2"><Pill s={v.category === "urgent" ? "urgent" : v.status}>{v.category === "urgent" ? "Urgent" : v.status}</Pill><span className="text-sm text-muted">{when(v.at)}</span></span>}>
      {v.heard ? <p className="text-ink">"{v.heard}"</p> : <p className="text-muted">No transcript. Listen below.</p>}
      {v.summary && <p className="mt-1 text-sm text-muted">AI summary: {v.summary}</p>}
      <audio className="mt-2 w-full" controls preload="none" src={`/api/ops/voice/${v.id}/audio`} />
      <div className="mt-2 flex gap-2"><button className="btn-sm" onClick={() => set(v.id, "done")}>Handled</button><button className="btn-sm-ghost" onClick={() => set(v.id, "seen")}>Seen</button><button className="btn-sm-ghost" onClick={() => set(v.id, "dismissed")}>Dismiss</button></div>
    </Box>)}
  </div>);
}

function Quality() {
  const [week, setWeek] = useState(monday()); const { d, err, load } = useLoad<any>(`/api/ops/insights?view=quality&week=${week}`);
  const [m, setM] = useState<[boolean, string] | null>(null); const [busy, setBusy] = useState(false);
  async function themes() { setBusy(true); setM(null); try { const r = await api<any>("/api/ops/insights", { body: { action: "themes", week } }); setM([true, r.source === "ai" ? "Themes grouped by AI from this week's complaints and low reviews." : "Grouped by category (AI not connected or no text)."]); load(); } catch (e: any) { setM([false, e.message]); } finally { setBusy(false); } }
  const watch = d?.caregivers.filter((c: any) => c.watch) ?? [];
  return (<div className="grid gap-4">
    <div className="flex flex-wrap items-center gap-2"><button className="btn-sm-ghost" onClick={() => setWeek(shiftWeek(week, -1))}>← Earlier week</button><b className="text-sm">Week of {new Date(week).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</b>
      {week < monday() && <button className="btn-sm-ghost" onClick={() => setWeek(shiftWeek(week, 1))}>Later week →</button>}</div>
    {err && <Msg m={[false, err]} />}
    {d && <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Kpi label="Caregivers worked" value={d.caregivers.length} /><Kpi label="Need attention" value={watch.length} tone={watch.length ? "alert" : "ok"} />
        <Kpi label="No shows" value={d.caregivers.reduce((s: number, c: any) => s + c.noShows, 0)} /><Kpi label="Complaints" value={d.complaints.reduce((s: number, c: any) => s + c.n, 0)} /></div>
      <Box title="Caregiver reliability" right={<span className="text-xs text-muted">Score out of 100: on time 40, records 20, rating 30, minus 15 per no show</span>}>
        <Table empty={!d.caregivers.length && "No shifts this week."}><thead><tr><th>Caregiver</th><th>Area</th><th>Shifts</th><th>On time</th><th>Records</th><th>No shows</th><th>Complaints</th><th>Rating</th><th>Score</th></tr></thead>
          <tbody>{d.caregivers.map((c: any) => <tr key={c.id} className={c.watch ? "bg-red-50" : ""}><td><Link className="font-semibold text-indigo-600" href={`/ops/caregivers/${c.id}`}>{c.name}</Link> <span className="text-xs text-muted">T{c.tier}</span></td><td>{c.area}</td><td>{c.shifts}</td>
            <td>{c.onTimePct == null ? "-" : c.onTimePct + "%"}</td><td>{c.recordsPct == null ? "-" : c.recordsPct + "%"}</td><td>{c.noShows}</td><td>{c.complaints}</td><td>{c.rating ?? "-"}</td><td><b>{c.score}</b></td></tr>)}</tbody></Table></Box>
      <div className="grid gap-4 lg:grid-cols-2">
        <Box title="By area"><Table empty={!d.areas.length && "No data."}><thead><tr><th>Area</th><th>Shifts</th><th>Late</th><th>No shows</th><th>Complaints</th></tr></thead>
          <tbody>{d.areas.map((a: any) => <tr key={a.area}><td>{a.area}</td><td>{a.shifts}</td><td>{a.late}</td><td>{a.noShows}</td><td>{a.complaints}</td></tr>)}</tbody></Table></Box>
        <Box title="Complaints and low ratings">
          <ul className="grid gap-1 text-sm">{d.complaints.map((c: any) => <li key={c.category}>{c.category}: <b>{c.n}</b></li>)}</ul>
          {!!d.lowRatingTags.length && <p className="mt-2 text-sm"><b>In reviews of 3 stars or less:</b> {d.lowRatingTags.map((t: any) => `${t.tag} (${t.n})`).join(", ")}</p>}
          {!!d.careFlags.length && <p className="mt-2 text-sm"><b>Care flags:</b> {d.careFlags.map((t: any) => `${t.what} (${t.n})`).join(", ")}</p>}
          {!d.complaints.length && !d.lowRatingTags.length && <p className="text-sm text-muted">None this week.</p>}</Box>
      </div>
      <Box title="Recurring themes" right={<button className="btn-sm" disabled={busy} onClick={themes}>{d.themes ? "Rebuild themes" : "Find themes"}</button>}>
        <Msg m={m} />
        {d.themes ? <ul className="grid gap-2 text-sm">{d.themes.items.map((t: any, k: number) => <li key={k}><b>{t.theme}</b> ({t.count}){t.example && <span className="text-muted">: "{t.example}"</span>}</li>)}</ul> : <p className="text-sm text-muted">Group this week's complaint and review texts into themes. {d.aiConnected ? "Uses AI; phone numbers and emails are removed first." : "AI is not connected, so they are grouped by category."}</p>}
        {d.themes && <p className="mt-2 text-xs text-muted">{d.themes.source === "ai" ? "Grouped by AI" : "Grouped by category"} · {when(d.themes.at)}</p>}
      </Box>
    </>}
  </div>);
}
