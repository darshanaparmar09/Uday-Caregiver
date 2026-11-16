"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FACILITY_TYPES, FACILITY_REVIEW_AREAS } from "@uday/core";
import { VISIT_CHECKLIST } from "../facilityGuide";
import { api, inr } from "../api";

export function FacilityView({ id }: { id: string }) {
  const [d, setD] = useState<any>(null); const [me, setMe] = useState<any>(undefined); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [date, setDate] = useState(""); const [note, setNote] = useState(""); const [ans, setAns] = useState<Record<string, string>>({});
  const [areas, setAreas] = useState<Record<string, number>>({}); const [rel, setRel] = useState<"visited" | "resident_family">("visited"); const [text, setText] = useState("");
  const load = () => api(`/api/facilities/${id}`).then((x) => { setD(x); setAns(x.mine?.notes ?? {}); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); api("/api/me").then(setMe).catch(() => setMe(null)); }, [id]);
  async function go(p: Promise<any>, ok: string) { setErr(""); setMsg(""); try { await p; setMsg(ok); load(); } catch (e: any) { setErr(e.message); } }
  if (!d) return <p>{err || "Loading"}</p>;
  const f = d.facility; const fam = me?.user?.role === "family";
  const answer = (k: string, v: string) => { const n = { ...ans, [k]: v }; setAns(n); if (fam) api(`/api/facilities/${id}/notes`, { method: "PUT", body: { answers: n } }).catch(() => {}); };
  return (
    <div className="grid gap-6">
      <Link href="/facilities" className="text-sm font-semibold text-indigo-600">← All facilities</Link>
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-extrabold">{f.name}</h1><p className="mt-1 text-muted">{f.types.map((t: string) => (FACILITY_TYPES as any)[t]).join(" · ")} · {f.locality}, {f.city}</p></div>
          <div className="text-right">{d.facility.rating?.n ? <div className="font-display text-3xl font-extrabold text-ink">★ {f.rating.avg}</div> : null}<div className="text-sm text-muted">{f.rating?.n ? `${f.rating.n} family reviews` : "No reviews yet"}</div></div></div>
        {f.sample && <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm">Sample listing for testing. Not a real facility.</p>}
        {f.description && <p className="mt-4">{f.description}</p>}
        <dl className="mt-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {[["Monthly", f.monthly_from_paise ? `${inr(f.monthly_from_paise)} to ${inr(f.monthly_to_paise ?? f.monthly_from_paise)}` : "Ask"], ["One time fee", f.entry_fee_paise ? inr(f.entry_fee_paise) : "None listed"],
            ["Refunds", f.refund_policy], ["Extra costs", f.extra_costs], ["Staff ratio", f.staff_ratio], ["Memory care ratio", f.memory_staff_ratio], ["Doctor visits", f.doctor_visits], ["Beds", f.beds],
            ["Diets", f.diets?.join(", ")], ["Dementia unit", f.dementia_unit ? "Yes" : "No"], ["Pets", f.pets_allowed ? "Allowed" : "Not allowed"], ["Licence", f.licence_verified ? "Checked by Uday" : "Not yet checked"]]
            .filter(([, v]) => v != null && v !== "").map(([k, v]) => <div key={k as string} className="flex justify-between gap-4 border-b border-line py-1.5"><dt className="text-muted">{k}</dt><dd className="text-right text-ink">{v as string}</dd></div>)}</dl>
        {!!f.activities?.length && <div className="mt-4 flex flex-wrap gap-1.5">{f.activities.map((a: string) => <span key={a} className="chip">{a}</span>)}</div>}
      </div>
      {msg && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-600">{msg}</p>}
      {err && <p role="alert" className="rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-600">{err}</p>}

      <div className="card grid gap-3"><h2 className="text-xl font-bold">Book a visit</h2>
        {!fam ? <p>Sign in with your family account to request a visit. <Link className="font-semibold text-indigo-600" href={`/signin?next=/facilities/${id}`}>Sign in</Link></p>
          : d.mine?.visit && ["requested", "confirmed"].includes(d.mine.visit.status) ? <p>Your visit on {d.mine.visit.preferred_date} is <b className="text-ink">{d.mine.visit.status === "requested" ? "waiting for the facility to confirm" : "confirmed"}</b>.</p>
          : <><div className="grid gap-3 sm:grid-cols-[200px_1fr]"><input type="date" className="input" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} /><input className="input" placeholder="What should they know? (optional)" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <button className="btn justify-self-start" disabled={!date} onClick={() => go(api(`/api/facilities/${id}/visit`, { body: { preferredDate: date, note: note || undefined } }), "Visit requested. The facility will confirm.")}>Request visit</button></>}
      </div>

      <div className="card grid gap-4"><div><h2 className="text-xl font-bold">Visit checklist</h2><p className="note">Take this with you. {fam ? "Answers save to your account, private to you." : "Sign in to save answers."}</p></div>
        {VISIT_CHECKLIST.map((g) => (<div key={g.group}><h3 className="mb-2 font-bold text-ink">{g.group}</h3>
          <div className="grid gap-2">{g.items.map(([k, label]) => { const key = `${g.group}.${k}`; return (
            <div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2"><span className="text-sm">{label}</span>
              <span className="flex gap-1">{[["good", "Good"], ["concern", "Concern"], ["unsure", "Not sure"]].map(([v, t]) => <button key={v} type="button" aria-pressed={ans[key] === v} onClick={() => answer(key, v)}
                className={`min-h-[40px] rounded-lg border px-3 text-sm font-semibold ${ans[key] === v ? (v === "good" ? "border-teal-500 bg-teal-50 text-teal-600" : v === "concern" ? "border-coral-500 bg-coral-50 text-coral-600" : "border-orange-400 bg-orange-50") : "border-line"}`}>{t}</button>)}</span></div>); })}</div></div>))}
      </div>

      {d.mine?.canReview && <div className="card grid gap-3"><h2 className="text-xl font-bold">Rate this facility</h2><p className="note">Only families whose visit was completed can rate. The overall score is the average of five areas.</p>
        <div className="flex gap-2">{[["visited", "We visited"], ["resident_family", "Our parent stayed here"]].map(([v, t]) => <button key={v} type="button" aria-pressed={rel === v} onClick={() => setRel(v as any)} className={`min-h-[44px] rounded-xl border px-4 text-sm font-semibold ${rel === v ? "border-orange-400 bg-orange-50" : "border-line"}`}>{t}</button>)}</div>
        {FACILITY_REVIEW_AREAS.map(([k, label]) => <div key={k} className="flex items-center justify-between border-b border-line pb-2"><span className="font-semibold text-ink">{label}</span><span className="flex">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${label} ${n} of 5`} onClick={() => setAreas({ ...areas, [k]: n })} className={`grid h-11 w-11 place-items-center text-2xl ${n <= (areas[k] ?? 0) ? "text-orange-400" : "text-line"}`}>★</button>)}</span></div>)}
        <textarea className="input min-h-[80px] py-3" placeholder="What should other families know? (shown publicly)" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn justify-self-start" disabled={FACILITY_REVIEW_AREAS.some(([k]) => !areas[k])} onClick={() => go(api(`/api/facilities/${id}/review`, { body: { relation: rel, areas, text: text || undefined } }), "Thank you. Your review is published.")}>Publish review</button></div>}

      <div className="card"><h2 className="text-xl font-bold">Family reviews</h2>
        {!d.reviews.length ? <p className="mt-2 text-muted">No reviews yet. Reviews come only from families whose visit was completed.</p> :
          <div className="mt-3 grid gap-3">{d.reviews.map((r: any, i: number) => <div key={i} className="border-t border-line pt-3"><div className="flex justify-between"><b className="text-ink">★ {r.overall}</b><span className="text-sm text-muted">{r.relation === "visited" ? "Visited" : "Parent stayed here"} · {new Date(r.created_at).toLocaleDateString("en-IN")}</span></div>
            <p className="text-sm text-muted">{FACILITY_REVIEW_AREAS.map(([k, l]) => `${l} ${r.areas[k]}`).join(" · ")}</p>{r.text && <p className="mt-1">{r.text}</p>}</div>)}</div>}
      </div>
    </div>
  );
}
