"use client";
import { useEffect, useState } from "react";
import { api, STATUS, TYPE } from "../api";
// Minimum operations console for the pilot. The full console (dispatch overrides, verification queue, refunds) is scoped in the Platform Specification.
export function OpsBoard() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { const l = () => api("/api/ops/overview").then(setD).catch(() => {}); l(); const t = setInterval(l, 10000); return () => clearInterval(t); }, []);
  if (!d) return <p>Loading</p>;
  return (
    <div className="grid gap-6">
      <div><div className="eyebrow">Operations</div><h1 className="mt-1 text-3xl font-extrabold">Live board</h1></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{d.byStatus.map((s: any) => <div key={s.status} className="card"><div className="text-xs uppercase tracking-wider text-muted">{STATUS[s.status]?.[1] ?? s.status}</div><div className="font-display text-3xl font-extrabold text-ink">{s.n}</div></div>)}</div>
      {!!d.sos.length && <div className="card border-coral-500 bg-coral-50"><h2 className="font-bold text-coral-600">Open SOS ({d.sos.length})</h2>{d.sos.map((s: any) => <div key={s.id} className="text-sm">{s.role} · {new Date(s.at).toLocaleString("en-IN")}</div>)}</div>}
      <div className="card overflow-x-auto"><h2 className="mb-3 font-bold">Active bookings</h2><table className="w-full min-w-[640px] text-left text-sm"><thead className="text-muted"><tr><th className="py-2">Code</th><th>Status</th><th>Caregiver</th><th>Care</th><th>Locality</th><th>Offer expires</th></tr></thead>
        <tbody>{d.live.map((b: any) => <tr key={b.code} className="border-t border-line"><td className="py-2 font-semibold text-ink">{b.code}</td><td><span className={STATUS[b.status][0]}>{STATUS[b.status][1]}</span></td><td>{b.caregiver}</td><td>{TYPE[b.care_type]} · {b.days_done}/{b.days}</td><td>{b.locality}</td><td>{b.offer_expires_at ? new Date(b.offer_expires_at).toLocaleTimeString("en-IN") : ""}</td></tr>)}</tbody></table></div>
      <div className="card overflow-x-auto"><h2 className="mb-3 font-bold">Open help requests</h2><table className="w-full min-w-[520px] text-left text-sm"><thead className="text-muted"><tr><th className="py-2">Code</th><th>Category</th><th>Urgent</th><th>Due</th></tr></thead>
        <tbody>{d.tickets.map((t: any) => <tr key={t.code} className="border-t border-line"><td className="py-2 font-semibold text-ink">{t.code}</td><td>{t.category}</td><td>{t.urgent ? "Yes" : ""}</td><td>{new Date(t.sla_due_at).toLocaleTimeString("en-IN")}</td></tr>)}</tbody></table></div>
      <div className="card overflow-x-auto"><h2 className="mb-3 font-bold">Caregivers</h2><table className="w-full min-w-[520px] text-left text-sm"><thead className="text-muted"><tr><th className="py-2">Name</th><th>Tier</th><th>Status</th><th>Online</th><th>Checks (results only)</th></tr></thead>
        <tbody>{d.caregivers.map((c: any) => <tr key={c.display_name} className="border-t border-line"><td className="py-2 font-semibold text-ink">{c.display_name}</td><td>{c.tier}</td><td>{c.status}</td><td>{c.online ? "Yes" : "No"}</td><td className="text-xs">{(c.checks ?? []).join(", ")}</td></tr>)}</tbody></table></div>
    </div>
  );
}
