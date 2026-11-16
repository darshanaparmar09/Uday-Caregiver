"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "../api";
import { useOps } from "./Shell";
import { Box, CARE, Empty, Head, Kpi, Msg, Pill, ReasonAction, Table, Tabs, ago, day, rs, useLoad, when } from "./ui";
import { OpsQueues } from "../forms/OpsQueues";

const STAGE: Record<number, string> = { 1: "Application", 2: "Screening call", 3: "App opened", 4: "Profile", 5: "Identity", 6: "References", 7: "Police check", 8: "Certificates", 9: "Fitness", 10: "Academy", 11: "Contract", 12: "Bank", 13: "Insurance and kit", 14: "Shadow shift", 15: "Active" };

export function Caregivers() {
  const [tab, setTab] = useState(() => { try { return location.hash === "#queues" ? "queues" : "all"; } catch { return "all"; } });
  const [f, setF] = useState({ status: "", tier: "", q: "" });
  const { d, err } = useLoad<any[]>(tab === "all" ? `/api/ops/caregivers?${new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any)}` : null);
  return (<>
    <Head title="Caregivers" sub="Directory, onboarding, leave and payouts." />
    <Tabs value={tab} onChange={setTab} tabs={[["all", "Directory"], ["queues", "Applications, onboarding, leave, facilities"]]} />
    {tab === "queues" ? <OpsQueues /> : <>
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <select aria-label="Status" className="input-sm" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">All statuses</option>{["active", "verifying", "paused", "exited", "applied"].map((s) => <option key={s}>{s}</option>)}</select>
        <select aria-label="Tier" className="input-sm" value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })}><option value="">All tiers</option><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option></select>
        <input className="input-sm sm:col-span-2" placeholder="Name or area" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
      </div>
      {err && <p className="text-red-700">{err}</p>}
      <Box>{!d ? <p>Loading</p> : <Table empty={!d.length && "No caregivers match"}>
        <thead><tr><th>Name</th><th>Tier</th><th>Status</th><th>Care</th><th>Area</th><th>Rating</th><th>Now</th></tr></thead>
        <tbody>{d.map((c) => <tr key={c.id}><td><Link href={`/ops/caregivers/${c.id}`} className="font-bold text-indigo-700">{c.display_name}</Link>{c.photo_status === "pending" ? <div className="text-xs text-orange-700">photo to check</div> : null}</td><td>{c.tier}</td>
          <td><Pill s={c.status} />{c.online ? <span className="ml-1 text-xs font-bold text-teal-700">● online</span> : null}</td><td>{(c.care_types ?? []).map((t: string) => CARE[t]).join(", ")}</td><td>{c.area}</td>
          <td>{c.rating ? `${Number(c.rating).toFixed(1)} (${c.rating_count})` : ""}</td><td>{c.live_bookings ? `${c.live_bookings} booking${c.live_bookings > 1 ? "s" : ""}` : ""}{c.open_incidents ? <div><Pill s="high">{c.open_incidents} incident</Pill></div> : null}</td></tr>)}</tbody></Table>}</Box>
    </>}
  </>);
}

export function CaregiverDetail({ id }: { id: string }) {
  const { d, err, setD } = useLoad<any>(`/api/ops/caregivers/${id}`); const { can, role } = useOps(); const [m, setM] = useState<[boolean, string] | null>(null);
  async function act(body: any, ok: string) { setM(null); try { setD(await api(`/api/ops/caregivers/${id}`, { body })); setM([true, ok]); } catch (e: any) { setM([false, e.message]); throw e; } }
  async function stage(s: number, status: string) { setM(null); try { await api(`/api/ops/caregivers/${id}/stage`, { body: { stage: s, status } }); setD(await api(`/api/ops/caregivers/${id}`)); setM([true, "Stage updated"]); } catch (e: any) { setM([false, e.message]); } }
  if (err) return <p className="text-red-700">{err}</p>; if (!d) return <p>Loading</p>;
  const c = d.caregiver; const st = Object.fromEntries(d.stages.map((s: any) => [s.stage, s]));
  return (<>
    <Link href="/ops/caregivers" className="text-sm font-semibold text-indigo-600">← Caregivers</Link>
    <Head title={c.display_name} sub={`Tier ${c.tier} · ${c.area ?? ""} · ••${c.phone_last4 ?? ""} · joined ${day(c.joined ?? c.created_at)}`}><Pill s={c.status} /></Head>
    <Msg m={m} />
    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi label="Rating" value={c.rating ? Number(c.rating).toFixed(1) : "None"} sub={`${c.rating_count ?? 0} ratings`} />
      <Kpi label="Earned" value={rs(d.earnings?.earned)} sub={`paid out ${rs(d.earnings?.paid_out)}`} />
      <Kpi label="Balance to pay" value={rs(d.earnings?.balance)} sub={c.bank_last4 ? `bank ••${c.bank_last4}` : "no bank yet"} />
      <Kpi label="Rates" value={<span className="text-lg">{rs(c.rate_day_paise)} / {rs(c.rate_night_paise)} / {rs(c.rate_live_paise)}</span>} sub="day / night / live in" />
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="grid min-w-0 content-start gap-5">
        <Box title="Onboarding (results only)"><div className="grid gap-1.5 sm:grid-cols-2">{Object.entries(STAGE).map(([n, l]) => { const s = st[Number(n)]; const opsStage = [2, 6, 7, 8, 9, 10, 13, 14].includes(Number(n));
          return <div key={n} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5 text-sm"><span>{n}. {l}</span><span className="flex items-center gap-1">{s ? <Pill s={s.status} /> : <Pill s="due">to do</Pill>}
            {can("people") && opsStage && s?.status !== "clear" && <button className="text-xs font-semibold text-indigo-600" onClick={() => stage(Number(n), "clear")}>Clear</button>}</span></div>; })}</div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">{d.checks.map((v: any) => <span key={v.kind} className="chip">{v.kind}: {v.result}{v.expires_at ? `, until ${day(v.expires_at)}` : ""}</span>)}</div></Box>
        <Box title="Bookings"><Table empty={!d.bookings.length && "No bookings yet"}><thead><tr><th>Code</th><th>Status</th><th>Care</th><th>Starts</th><th>Area</th></tr></thead>
          <tbody>{d.bookings.map((b: any) => <tr key={b.id}><td><Link className="font-bold text-indigo-700" href={`/ops/bookings/${b.id}`}>{b.code}</Link></td><td><Pill s={b.status} /></td><td>{CARE[b.care_type]} · {b.days_done}/{b.days}</td><td>{day(b.start_date)}</td><td>{b.locality}</td></tr>)}</tbody></Table></Box>
        <Box title="Recent ratings">{!d.ratings.length ? <Empty>No ratings yet</Empty> : d.ratings.map((r: any, k: number) => <div key={k} className="border-b border-line py-2 text-sm last:border-0"><b>{r.overall ?? ""}★</b> {(r.tags ?? []).join(", ")}{r.public_text ? <p className="text-muted">"{r.public_text}"</p> : null}<div className="text-xs text-muted">{day(r.created_at)}</div></div>)}</Box>
      </div>
      <div className="grid content-start gap-5">
        <Box title="Incidents">{!d.incidents.length ? <Empty>None</Empty> : d.incidents.map((i: any) => <Link key={i.id} href={`/ops/incidents/${i.id}`} className="flex flex-wrap gap-2 border-b border-line py-2 text-sm last:border-0"><Pill s={i.severity} /><b>{i.code}</b><Pill s={i.status} /><span className="w-full text-muted">{i.summary}</span></Link>)}</Box>
        {can("people") && <Box title="Change"><div className="grid gap-2">
          {c.status === "active" && <ReasonAction label="Pause (no new work)" danger confirm="Waiting and confirmed requests move to another caregiver; families approve the substitute." run={(v) => act({ action: "status", status: "paused", reason: v.reason }, "Paused")} />}
          {c.status === "paused" && <ReasonAction label="Make active again" run={(v) => act({ action: "status", status: "active", reason: v.reason }, "Active")} />}
          {role === "admin" && c.status !== "exited" && <ReasonAction label="Remove from Uday" danger confirm="She can no longer sign in to take work. Her earnings are still paid." run={(v) => act({ action: "status", status: "exited", reason: v.reason }, "Removed")} />}
          {role === "admin" && <ReasonAction label="Change tier" fields={(v, set) => <><label className="grid gap-1 text-sm font-semibold">Tier<select className="input-sm" value={v.tier ?? c.tier} onChange={(e) => set("tier", Number(e.target.value))}>{[1, 2, 3].map((t) => <option key={t} value={t}>Tier {t}</option>)}</select></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.applyRates ?? true} onChange={(e) => set("applyRates", e.target.checked)} />Move her to the standard rates for that tier</label></>}
            run={(v) => act({ action: "tier", tier: v.tier ?? c.tier, applyRates: v.applyRates ?? true, reason: v.reason }, "Tier changed")} />}
          {role === "admin" && <ReasonAction label="Set her own rates" fields={(v, set) => <div className="grid grid-cols-3 gap-2">{([["day", c.rate_day_paise], ["night", c.rate_night_paise], ["live", c.rate_live_paise]] as [string, number][]).map(([k, p]) =>
            <label key={k} className="grid gap-1 text-xs font-semibold">{CARE[k]} ₹<input className="input-sm" inputMode="numeric" value={v[k] ?? String(p / 100)} onChange={(e) => set(k, e.target.value)} /></label>)}</div>}
            run={(v) => act({ action: "rates", dayPaise: Math.round(Number(v.day ?? c.rate_day_paise / 100) * 100), nightPaise: Math.round(Number(v.night ?? c.rate_night_paise / 100) * 100), livePaise: Math.round(Number(v.live ?? c.rate_live_paise / 100) * 100), reason: v.reason }, "Rates saved")} />}
          <div className="text-sm font-semibold text-ink">Care she offers</div>
          <div className="flex flex-wrap gap-2">{["day", "night", "live"].map((t) => { const on = (c.care_types ?? []).includes(t); return <button key={t} className={on ? "btn-sm" : "btn-sm-ghost"}
            onClick={() => { const next = on ? c.care_types.filter((x: string) => x !== t) : [...(c.care_types ?? []), t]; if (next.length) act({ action: "care_types", careTypes: next }, "Saved"); }}>{on ? "✓ " : ""}{CARE[t]}</button>; })}</div>
        </div></Box>}
        <Box title="Leave">{!d.leave.length ? <Empty>None</Empty> : d.leave.map((l: any, k: number) => <div key={k} className="text-sm">{day(l.from_day)} to {day(l.to_day)} · <Pill s={l.status === "approved" ? "clear" : l.status === "rejected" ? "not_clear" : "pending"}>{l.status}</Pill></div>)}</Box>
      </div>
    </div>
  </>);
}

export function People() {
  const [q, setQ] = useState(""); const { d, err } = useLoad<any[]>(`/api/ops/people?q=${encodeURIComponent(q)}`);
  return (<>
    <Head title="Families and seniors" sub="Search by name, city or the parent's name. Use the top search box for a phone number." />
    <input className="input-sm mb-4 max-w-md" placeholder="Name, city or parent" value={q} onChange={(e) => setQ(e.target.value)} />
    {err && <p className="text-red-700">{err}</p>}
    <Box>{!d ? <p>Loading</p> : <Table empty={!d.length && "Nobody matches"}>
      <thead><tr><th>Name</th><th>Type</th><th>Parents</th><th>Where</th><th>Bookings</th><th>Joined</th></tr></thead>
      <tbody>{d.map((p) => <tr key={p.id}><td><Link href={`/ops/people/${p.id}`} className="font-bold text-indigo-700">{p.name ?? "No name"}</Link> <span className="text-xs text-muted">••{p.phone_last4}</span>{p.plus ? <span className="chip ml-1">Plus</span> : null}{p.kyc_status === "clear" ? <span className="chip ml-1">ID ✓</span> : null}</td>
        <td>{p.role}</td><td>{p.parents ?? ""}</td><td>{[p.city, p.country].filter(Boolean).join(", ")}</td><td>{p.bookings}</td><td>{day(p.created_at)}</td></tr>)}</tbody></Table>}</Box>
  </>);
}
export function PersonDetail({ id }: { id: string }) {
  const { d, err } = useLoad<any>(`/api/ops/people/${id}`); const { can } = useOps(); const [m, setM] = useState<[boolean, string] | null>(null);
  if (err) return <p className="text-red-700">{err}</p>; if (!d) return <p>Loading</p>;
  const p = d.person;
  return (<>
    <Link href="/ops/people" className="text-sm font-semibold text-indigo-600">← Families and seniors</Link>
    <Head title={p.name ?? "No name"} sub={`${p.role} · ••${p.phone_last4} · ${[p.city, p.country].filter(Boolean).join(", ")} · joined ${day(p.created_at)}${p.email ? " · " + p.email : ""}`}>{p.kyc_status && <Pill s={p.kyc_status}>ID {p.kyc_status.replace("_", " ")}</Pill>}</Head>
    <Msg m={m} />
    <div className="mt-3 grid gap-5 xl:grid-cols-2">
      <Box title="Parents">{!d.recipients.length ? <Empty>No parents linked</Empty> : d.recipients.map((r: any) => <div key={r.id} className="border-b border-line py-2 text-sm last:border-0">
        <b className="text-ink">{r.name}</b> · {r.locality} {r.family_role ? <span className="chip">{r.family_role}</span> : null}
        <div className="text-muted">Check in by {String(r.checkin_by).slice(0, 5)} via {r.checkin_mode === "call" ? "phone call" : r.has_phone ? "app" : "no phone"} · last {r.last_checkin ? ago(r.last_checkin) : "never"} · {r.checkins_7d} in 7 days</div></div>)}</Box>
      <Box title="Family on Uday">{!d.family.length ? <Empty>Only this person</Empty> : d.family.map((f: any) => <Link key={f.id} href={`/ops/people/${f.id}`} className="block text-sm font-semibold text-indigo-600">{f.name} ({f.role}) ••{f.phone_last4}</Link>)}</Box>
      <Box title="Bookings"><Table empty={!d.bookings.length && "None"}><thead><tr><th>Code</th><th>Status</th><th>Caregiver</th><th>Care</th><th>Starts</th><th>Value</th></tr></thead>
        <tbody>{d.bookings.map((b: any) => <tr key={b.id}><td><Link className="font-bold text-indigo-700" href={`/ops/bookings/${b.id}`}>{b.code}</Link></td><td><Pill s={b.status} /></td><td>{b.display_name}</td><td>{CARE[b.care_type]} · {b.days}d</td><td>{day(b.start_date)}</td><td>{rs(b.total_paise)}</td></tr>)}</tbody></Table></Box>
      <Box title="Help requests" right={can("help") && <ReasonAction label="Open for them" reasonLabel="What they asked (phone call, email)" fields={(v, set) => <label className="grid gap-1 text-sm font-semibold">Topic<input className="input-sm" value={v.cat ?? ""} onChange={(e) => set("cat", e.target.value)} placeholder="Billing question" /></label>}
        run={(v) => api("/api/ops/tickets", { body: { userId: id, category: v.cat || "Phone call", text: v.reason } }).then((r) => { setM([true, `Opened ${r.code}`]); location.href = `/ops/help/${r.id}`; })} />}>
        {!d.tickets.length ? <Empty>None</Empty> : d.tickets.map((t: any) => <Link key={t.id} href={`/ops/help/${t.id}`} className="flex gap-2 border-b border-line py-2 text-sm last:border-0"><b>{t.code}</b>{t.category}<Pill s={t.status} /><span className="text-muted">{day(t.created_at)}</span></Link>)}</Box>
      {(!!d.sos.length || !!d.leads.length) && <Box title="SOS and partner requests">{d.sos.map((s: any) => <div key={s.id} className="text-sm">SOS {when(s.at)} · {s.resolved_at ? "handled" : <b className="text-red-700">open</b>}</div>)}
        {d.leads.map((l: any, k: number) => <div key={k} className="text-sm">{l.kind} request · {l.status} · {day(l.created_at)}</div>)}</Box>}
    </div>
  </>);
}
