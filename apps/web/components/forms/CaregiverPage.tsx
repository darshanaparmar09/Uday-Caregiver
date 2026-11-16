"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RATING_AREAS } from "@uday/core";
import { api, inr, TIER, TYPE } from "../api";

/** Public caregiver profile: checked photo, verifications, ratings, reviews and the next 30 days. */
export function CaregiverPage({ id }: { id: string }) {
  const [p, setP] = useState<any>(null); const [err, setErr] = useState("");
  useEffect(() => { api(`/api/caregivers/${id}`).then(setP).catch((e) => setErr(e.message)); }, [id]);
  if (!p) return <p>{err || "Loading"}</p>;
  const busy = new Set(p.busyDates); const days = Array.from({ length: 30 }, (_, k) => { const d = new Date(Date.parse(p.calendarFrom + "T00:00:00Z") + k * 864e5); return d.toISOString().slice(0, 10); });
  return (
    <div className="grid gap-5">
      <Link href="/hire" className="text-sm font-semibold text-indigo-600">← Hire a caregiver</Link>
      <div className="card flex flex-wrap items-center gap-4">{p.photo ? <img src={p.photo} alt={`Photo of ${p.display_name}, checked by Uday`} className="h-24 w-24 rounded-full object-cover" /> : <span className="grid h-20 w-20 place-items-center rounded-full bg-indigo-900 text-2xl font-bold text-orange-400">{p.initials}</span>}
        <div className="min-w-0"><h1 className="text-3xl font-extrabold">{p.display_name}</h1><p className="text-muted">{TIER[p.tier]} · {p.area}{p.experience_years ? ` · ${p.experience_years} years` : ""} · {p.completedBookings} bookings completed</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{p.police_verified && <span className="pill-ok">✓ Police verified</span>}{p.id_verified && <span className="pill-ok">✓ ID verified</span>}{p.photo && <span className="pill-ok">✓ Photo checked</span>}</div></div></div>
      <div className="card grid gap-2 text-sm"><p><b className="text-ink">Care:</b> {p.care_types.map((t: string) => TYPE[t]).join(", ")}</p><p><b className="text-ink">Skills:</b> {p.skills.join(", ")}</p><p><b className="text-ink">Languages:</b> {p.languages.join(", ")}</p>
        <p><b className="text-ink">Daily rate:</b> {p.care_types.map((t: string) => `${TYPE[t]} ${inr(p[`rate_${t}_paise`])}`).join(" · ")}</p></div>
      <div className="card"><h2 className="text-lg font-bold">Next 30 days</h2><p className="note">Orange days are already booked or on leave.</p>
        <div className="mt-3 grid grid-cols-7 gap-1.5 text-center text-xs">{days.map((d) => <div key={d} className={`rounded-lg py-2 ${busy.has(d) ? "bg-orange-100 text-orange-700" : "bg-teal-50 text-teal-700"}`}><div className="font-bold">{Number(d.slice(8))}</div><div>{new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" })}</div></div>)}</div></div>
      <div className="card"><h2 className="text-lg font-bold">Ratings and reviews</h2>
        {p.rating_count ? <><p className="mt-1 font-display text-3xl font-extrabold text-ink">★ {p.rating.toFixed(1)} <span className="text-base font-normal text-muted">{p.rating_count} ratings</span></p>
          <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{RATING_AREAS.map(([k, l]) => p.areaAverages[k] != null && <div key={k} className="flex justify-between rounded-lg bg-indigo-50/70 px-3 py-1.5"><span>{l}</span><b className="text-ink">{p.areaAverages[k]}</b></div>)}</div></> : <p className="mt-1 text-muted">New on Uday. No ratings yet.</p>}
        <div className="mt-4 grid gap-3">{p.reviews.map((r: any, k: number) => <div key={k} className="border-t border-line pt-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><b className="text-ink">★ {r.overall}</b><span className="text-muted">{TYPE[r.careType]} · {r.month}{r.familyCity ? ` · family in ${r.familyCity}` : ""}</span></div>{r.text && <p className="mt-1">"{r.text}"</p>}{!!r.tags?.length && <p className="text-muted">{r.tags.join(" · ")}</p>}</div>)}</div></div>
      <Link href="/hire" className="btn justify-self-start">Hire {p.display_name.split(" ")[0]}</Link>
    </div>);
}
