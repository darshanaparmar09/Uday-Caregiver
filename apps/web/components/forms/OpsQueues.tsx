"use client";
import { useEffect, useState } from "react";
import { api } from "../api";
const UDAY_STAGES: [number, string][] = [[2, "Screening"], [6, "References"], [7, "Police"], [8, "Certificates"], [9, "Fitness"], [10, "Academy assessment"], [13, "Insurance and kit"], [14, "Shadow shift"]];
// Pilot ops queues: convert applications, clear onboarding stages (results only), decide leave, run payouts.
export function OpsQueues() {
  const [d, setD] = useState<any>(null); const [msg, setMsg] = useState("");
  const load = () => api("/api/ops/queues").then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  async function go(p: string, body: any, done: string) { try { const r = await api(p, { body }); setMsg(done + (r?.paid !== undefined ? ` (${r.paid} paid)` : "")); load(); } catch (e: any) { setMsg(e.message); } }
  if (!d) return null;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-extrabold">Caregiver queues</h2>
        <button className="btn" onClick={() => go("/api/ops/payouts", {}, "Payout run complete")}>Run weekly payouts</button></div>
      {msg && <p role="status" className="rounded-lg bg-indigo-50 px-3 py-2 text-sm">{msg}</p>}
      <div className="card overflow-x-auto"><h3 className="mb-3 font-bold">New applications ({d.applications.length})</h3>
        {d.applications.map((a: any) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm"><span><b className="text-ink">{a.name}</b> · {a.area} · {a.experience}</span>
          <span className="flex gap-2">{[1, 2, 3].map((t) => <button key={t} className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => go(`/api/ops/applications/${a.id}`, { tier: t }, `${a.name} moved to onboarding as Tier ${t}`)}>Start Tier {t}</button>)}</span></div>)}</div>
      <div className="card overflow-x-auto"><h3 className="mb-3 font-bold">Onboarding ({d.onboarding.length})</h3>
        {d.onboarding.map((c: any) => <div key={c.id} className="border-t border-line py-3 text-sm"><b className="text-ink">{c.display_name}</b> · Tier {c.tier} · {c.status}
          <div className="mt-2 flex flex-wrap gap-2">{UDAY_STAGES.map(([n, t]) => { const s = c.stages?.[n] ?? "pending"; return (
            <button key={n} onClick={() => go(`/api/ops/caregivers/${c.id}/stage`, { stage: n, status: s === "clear" ? "pending" : "clear" }, `${t} updated`)}
              className={`min-h-[40px] rounded-lg border px-3 ${s === "clear" ? "border-teal-500 bg-teal-50 text-teal-600" : s === "submitted" ? "border-orange-400 bg-orange-50" : "border-line"}`}>{s === "clear" ? "✓ " : ""}{t}{s === "submitted" ? " · to check" : ""}</button>); })}</div>
          <p className="note mt-1">Police verification: record the provider's result only. Never upload the report.</p></div>)}</div>
      <div className="card"><h3 className="mb-3 font-bold">Care facilities to review ({d.facilities?.length ?? 0})</h3>
        {d.facilities?.map((f: any) => <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm"><span><b className="text-ink">{f.name}</b> · {f.locality} · licence {f.licence_no ?? "missing"} · {f.plan}</span>
          <span className="flex gap-2"><button className="btn min-h-[40px] px-3 text-sm" onClick={() => go(`/api/ops/facilities/${f.id}`, { status: "live", licenceVerified: true }, `${f.name} is live`)}>Licence checked, go live</button>
            <button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => go(`/api/ops/facilities/${f.id}`, { status: "suspended" }, `${f.name} paused`)}>Pause</button></span></div>)}
        <p className="note mt-1">Check the licence with the issuing authority before going live.</p></div>
      <div className="card"><h3 className="mb-3 font-bold">Leave requests ({d.leave.length})</h3>
        {d.leave.map((l: any) => <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm"><span><b className="text-ink">{l.display_name}</b> · {l.from_day} to {l.to_day} · {l.reason}</span>
          <span className="flex gap-2"><button className="btn min-h-[40px] px-3 text-sm" onClick={() => go(`/api/ops/leave/${l.id}`, { approve: true }, "Leave approved")}>Approve</button><button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => go(`/api/ops/leave/${l.id}`, { approve: false }, "Leave declined")}>Decline</button></span></div>)}</div>
    </div>
  );
}

/** Community moderation, safety reports, callback requests and events. */
export function OpsCommunity() {
  const [d, setD] = useState<any>(null); const [msg, setMsg] = useState("");
  const [ev, setEv] = useState({ title: "", place: "", startsAt: "", capacity: "", groupId: "" });
  const load = () => api("/api/ops/community").then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  async function go(body: any, done: string) { try { await api("/api/ops/community", { body }); setMsg(done); load(); } catch (e: any) { setMsg(e.message); } }
  if (!d) return null;
  return (
    <div className="grid gap-6">
      <h2 className="text-2xl font-extrabold">Seniors: safety and community</h2>
      {msg && <p role="status" className="rounded-lg bg-indigo-50 px-3 py-2 text-sm">{msg}</p>}
      <div className="card"><h3 className="mb-3 font-bold">Safety reports ({d.safety.length})</h3>
        {d.safety.map((s: any) => <div key={s.code} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm"><span><b className="text-ink">{s.code}</b> · {s.name} · {s.kind} · {s.category} · {s.happened ?? ""}{s.amount_paise ? ` · ₹${(s.amount_paise / 100).toLocaleString("en-IN")}` : ""}</span>
          <button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => go({ action: "close", kind: "safety", id: s.code }, `${s.code} closed`)}>Called and closed</button></div>)}
        <p className="note mt-1">Call the senior, help them file with 1930 or the police, and inform the family.</p></div>
      <div className="card"><h3 className="mb-3 font-bold">Call back requests ({d.callbacks.length})</h3>
        {d.callbacks.map((c: any) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm"><span><b className="text-ink">{c.name}</b> · {c.locality} · {{ talk: "Wants to talk", doctor: "Doctor call", lonely: "Feeling lonely" }[c.reason as string]} · {new Date(c.created_at).toLocaleString("en-IN")}</span>
          <button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => go({ action: "close", kind: "callback", id: c.id }, "Marked as called")}>Called</button></div>)}</div>
      <div className="card"><h3 className="mb-3 font-bold">Reported posts ({d.reported.length})</h3>
        {d.reported.map((p: any) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm"><span><b className="text-ink">{p.group_name}</b> · {p.reports} report{p.reports > 1 ? "s" : ""} · {p.status} · "{p.body}"</span>
          <span className="flex gap-2"><button className="btn min-h-[40px] px-3 text-sm" onClick={() => go({ action: "post", id: p.id, status: "live" }, "Post restored")}>Restore</button><button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => go({ action: "post", id: p.id, status: "hidden" }, "Post hidden")}>Hide</button></span></div>)}
        <p className="note mt-1">Two reports hide a post automatically until reviewed.</p></div>
      <div className="card grid gap-3"><h3 className="font-bold">Create a community event</h3>
        <div className="grid gap-3 sm:grid-cols-2"><input className="input" placeholder="Title, e.g. Morning walk" value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} /><input className="input" placeholder="Place" value={ev.place} onChange={(e) => setEv({ ...ev, place: e.target.value })} />
          <input className="input" type="datetime-local" value={ev.startsAt} onChange={(e) => setEv({ ...ev, startsAt: e.target.value })} /><input className="input" type="number" placeholder="Places (optional)" value={ev.capacity} onChange={(e) => setEv({ ...ev, capacity: e.target.value })} />
          <select className="input" value={ev.groupId} onChange={(e) => setEv({ ...ev, groupId: e.target.value })}><option value="">No group</option>{d.groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
        <button className="btn justify-self-start" disabled={!ev.title || !ev.place || !ev.startsAt} onClick={() => go({ action: "event", title: ev.title, place: ev.place, startsAt: new Date(ev.startsAt).toISOString(), capacity: ev.capacity ? Number(ev.capacity) : undefined, groupId: ev.groupId || undefined }, "Event published")}>Publish event</button></div>
    </div>
  );
}

/** Care operations: relief cover for day offs, late caregivers, failed weekly payments, photos to check, intro calls to connect. */
export function OpsCare() {
  const [d, setD] = useState<any>(null); const [msg, setMsg] = useState("");
  const load = () => api("/api/ops/care").then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  async function go(body: any, done: string) { try { await api("/api/ops/care", { body }); setMsg(done); load(); } catch (e: any) { setMsg(e.message); } }
  if (!d) return null;
  const Row = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm">{children}</div>;
  return (
    <div className="grid gap-6">
      <h2 className="text-2xl font-extrabold">Care operations</h2>
      {msg && <p role="status" className="rounded-lg bg-indigo-50 px-3 py-2 text-sm">{msg}</p>}
      <div className="card"><h3 className="mb-3 font-bold">Caregivers not arrived ({d.late.length})</h3>
        {d.late.map((l: any) => <Row key={l.code}><span><b className="text-ink">{l.display_name}</b> for {l.recipient_name} · {l.code} · {new Date(l.created_at).toLocaleTimeString("en-IN")}</span><span className="pill-wait">Urgent</span></Row>)}
        <p className="note mt-1">Call the caregiver. If she cannot come, the family can ask for a replacement from the booking.</p></div>
      <div className="card"><h3 className="mb-3 font-bold">Day off cover in the next 7 days ({d.relief.length})</h3>
        {d.relief.map((r: any) => <Row key={r.id}><span><b className="text-ink">{new Date(r.day + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</b> · {r.recipient_name}, {r.locality} · {r.main_name}'s day off · {r.relief_name ? `${r.relief_name} (${r.status})` : r.status}</span>
          <button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => go({ action: "cover", id: r.id }, "Regular caregiver covers this day")}>Regular caregiver covers</button></Row>)}
        <p className="note mt-1">If nobody accepts, the regular caregiver stays that day. Decide her extra day allowance.</p></div>
      <div className="card"><h3 className="mb-3 font-bold">Weekly payments failed ({d.billing.length})</h3>
        {d.billing.map((b: any) => <Row key={b.booking_id + b.cycle_no}><span><b className="text-ink">{b.code}</b> · {b.recipient_name} · week {b.cycle_no} · ₹{Math.round(b.amount_paise / 100).toLocaleString("en-IN")} · {b.attempts} attempts</span></Row>)}
        <p className="note mt-1">Retries every 24 hours. Call the family; care continues while you sort it out.</p></div>
      <div className="card"><h3 className="mb-3 font-bold">Photos to check ({d.photos.length})</h3>
        {d.photos.map((p: any) => <Row key={p.id}><span className="flex items-center gap-3"><img src={`/api/caregivers/${p.id}/photo`} alt="" className="h-12 w-12 rounded-full object-cover" /><b className="text-ink">{p.display_name}</b></span>
          <span className="flex gap-2"><button className="btn min-h-[40px] px-3 text-sm" onClick={() => go({ action: "photo", caregiverId: p.id, verified: true }, "Photo verified")}>Matches ID</button><button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => go({ action: "photo", caregiverId: p.id, verified: false }, "Photo rejected")}>Reject</button></span></Row>)}</div>
      <div className="card"><h3 className="mb-3 font-bold">Intro calls ({d.introCalls.length})</h3>
        {d.introCalls.map((i: any) => <Row key={i.id}><span><b className="text-ink">{i.display_name}</b> with {i.recipient_name}'s family · {new Date(i.chosen).toLocaleString("en-IN")}{i.room_url ? "" : " · connect by phone"}</span>
          <button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => go({ action: "intro_done", id: i.id }, "Marked done")}>Done</button></Row>)}</div>
    </div>
  );
}

/** Family side: partner leads (insurance, tablet), coupons, Uday Plus members. */
export function OpsFamily() {
  const [d, setD] = useState<any>(null); const [msg, setMsg] = useState(""); const [code, setCode] = useState(""); const [pct, setPct] = useState("20"); const [uses, setUses] = useState("");
  const load = () => api("/api/ops/family").then(setD).catch(() => {}); useEffect(() => { load(); }, []);
  async function go(body: any, done: string) { try { await api("/api/ops/family", { body }); setMsg(done); load(); } catch (e: any) { setMsg(e.message); } }
  if (!d) return null;
  return (
    <div className="grid gap-6"><h2 className="text-2xl font-extrabold">Families: leads, coupons, Uday Plus</h2>{msg && <p role="status" className="rounded-lg bg-indigo-50 px-3 py-2 text-sm">{msg}</p>}
      <div className="card"><h3 className="mb-3 font-bold">Partner leads ({d.leads.length})</h3>{d.leads.map((l: any) => <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm">
        <span><b className="text-ink">{l.kind}</b> · {l.name ?? "Family"}, {l.locality ?? ""}{l.note ? ` · "${l.note}"` : ""}</span><button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => go({ action: "lead_done", id: l.id }, "Lead closed")}>Done</button></div>)}
        <p className="note mt-1">Assign and send leads to partners in <a className="font-semibold text-indigo-600" href="/ops/settings#partners">Settings, Partners</a>.</p></div>
      <div className="card grid gap-3"><h3 className="font-bold">Coupons · Uday Plus members: {d.members}</h3>
        {d.coupons.map((c: any) => <div key={c.code} className="text-sm">{c.code} · {c.fee_discount_bps / 100}% off the Uday fee · used {c.used}{c.max_uses ? ` of ${c.max_uses}` : ""}{c.valid_until ? ` · until ${String(c.valid_until).slice(0, 10)}` : ""}</div>)}
        <div className="grid gap-2 sm:grid-cols-4"><input className="input" placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /><input className="input" type="number" aria-label="Percent off the fee" value={pct} onChange={(e) => setPct(e.target.value)} />
          <input className="input" type="number" placeholder="Max uses" value={uses} onChange={(e) => setUses(e.target.value)} /><button className="btn" disabled={!code} onClick={() => go({ action: "coupon", code, feeDiscountBps: Number(pct) * 100, maxUses: uses ? Number(uses) : undefined }, "Coupon created")}>Create</button></div>
        <p className="note">Coupons lower only the Uday platform fee. Caregiver pay never changes.</p></div></div>);
}
