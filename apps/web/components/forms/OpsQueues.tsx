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
      <div className="card"><h3 className="mb-3 font-bold">Leave requests ({d.leave.length})</h3>
        {d.leave.map((l: any) => <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm"><span><b className="text-ink">{l.display_name}</b> · {l.from_day} to {l.to_day} · {l.reason}</span>
          <span className="flex gap-2"><button className="btn min-h-[40px] px-3 text-sm" onClick={() => go(`/api/ops/leave/${l.id}`, { approve: true }, "Leave approved")}>Approve</button><button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => go(`/api/ops/leave/${l.id}`, { approve: false }, "Leave declined")}>Decline</button></span></div>)}</div>
    </div>
  );
}
