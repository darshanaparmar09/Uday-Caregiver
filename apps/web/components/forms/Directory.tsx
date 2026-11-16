"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FACILITY_TYPES } from "@uday/core";
import { api, inr } from "../api";

export function Directory() {
  const [type, setType] = useState(""); const [q, setQ] = useState(""); const [max, setMax] = useState(""); const [dementia, setDementia] = useState(false); const [pets, setPets] = useState(false);
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => { const t = setTimeout(() => { const p = new URLSearchParams(); if (type) p.set("type", type); if (q) p.set("q", q); if (max) p.set("max", max); if (dementia) p.set("dementia", "1"); if (pets) p.set("pets", "1");
    api<any[]>("/api/facilities?" + p).then(setList).catch(() => setList([])); }, 250); return () => clearTimeout(t); }, [type, q, max, dementia, pets]);
  return (
    <div>
      <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <select className="input" aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{Object.entries(FACILITY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input className="input" aria-label="Search" placeholder="Name or area" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" aria-label="Budget" value={max} onChange={(e) => setMax(e.target.value)}><option value="">Any budget</option>{[40000, 60000, 80000, 100000].map((m) => <option key={m} value={m}>Up to ₹{m.toLocaleString("en-IN")} a month</option>)}</select>
        <label className="flex min-h-[48px] items-center gap-2"><input type="checkbox" checked={dementia} onChange={(e) => setDementia(e.target.checked)} /> Dementia unit</label>
        <label className="flex min-h-[48px] items-center gap-2"><input type="checkbox" checked={pets} onChange={(e) => setPets(e.target.checked)} /> Pets allowed</label>
      </div>
      <p className="note mt-4">{list ? `${list.length} facilities` : "Loading"}. Listings are paid by facilities; reviews come only from families who visited.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {list?.map((f) => (
          <Link key={f.id} href={`/facilities/${f.id}`} className="card flex flex-col gap-2 transition hover:border-indigo-500">
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-lg font-bold">{f.name}</h3>{f.plan === "featured" && <span className="pill-wait">Featured</span>}{f.sample && <span className="pill-no">Sample listing</span>}</div>
            <p className="text-sm text-muted">{f.types.map((t: string) => (FACILITY_TYPES as any)[t]).join(" · ")} · {f.locality}, {f.city}</p>
            <p className="text-sm">{f.monthly_from_paise ? `${inr(f.monthly_from_paise)} to ${inr(f.monthly_to_paise ?? f.monthly_from_paise)} a month` : "Ask for prices"}</p>
            <div className="flex flex-wrap gap-1.5">{f.rating?.n ? <span className="chip">★ {f.rating.avg} · {f.rating.n} review{f.rating.n > 1 ? "s" : ""}</span> : <span className="chip">No reviews yet</span>}
              {f.dementia_unit && <span className="pill-ok">Dementia unit</span>}{f.pets_allowed && <span className="pill-ok">Pets</span>}{f.licence_verified && <span className="pill-ok">✓ Licence checked</span>}</div>
          </Link>))}
      </div>
    </div>
  );
}
