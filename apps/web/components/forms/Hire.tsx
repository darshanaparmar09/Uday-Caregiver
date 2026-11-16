"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fees as coreFees, CARE_NEEDS, CARE_NEED_GROUPS, careNeed, homeCommitments } from "@uday/core";
import { RateCare } from "./RateCare";
import { api, inr, TYPE, DUR, TIER } from "../api";

type CG = { id: string; display_name: string; initials: string; tier: number; care_types: string[]; languages: string[]; skills: string[]; area: string; experience_years: number; rating: number; rating_count: number; rate_day_paise: number; rate_night_paise: number; rate_live_paise: number; police_verified: boolean; id_verified: boolean };
const RATE = { day: "rate_day_paise", night: "rate_night_paise", live: "rate_live_paise" } as const;
const TIMES: Record<string, [string, string][]> = { day: [["07:00", "7 AM to 3 PM"], ["09:00", "9 AM to 5 PM"], ["10:00", "10 AM to 6 PM"]], night: [["20:00", "8 PM to 8 AM"]], live: [["09:00", "Starts 9 AM"]] };
const COLORS = ["#4B3AA8", "#E07B00", "#1F7A6D"];

function fees(rate: number, days: number) { const f = coreFees(rate, days); return { care: f.carePaise, pf: f.platformPaise, gst: f.gstPaise, total: f.totalPaise }; }

function Seg<T extends string | number>({ label, value, set, opts }: { label: string; value: T; set: (v: T) => void; opts: [T, string, string?][] }) {
  return (<div><div className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">{label}</div>
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap">{opts.map(([v, t, s]) => (
      <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => set(v)}
        className={`min-h-[48px] shrink-0 rounded-xl border px-4 py-2 text-left text-[15px] font-semibold transition ${value === v ? "border-orange-400 bg-orange-50 text-ink" : "border-line bg-white text-body hover:border-indigo-500"}`}>
        {t}{s && <span className="block text-xs font-normal text-muted">{s}</span>}</button>))}</div></div>);
}

export function Hire() {
  const router = useRouter();
  const [type, setType] = useState<"day" | "night" | "live">("day"); const [days, setDays] = useState(1); const [tier, setTier] = useState(0);
  const [list, setList] = useState<CG[] | null>(null); const [err, setErr] = useState("");
  const [pick, setPick] = useState<CG | null>(null);
  const [need, setNeed] = useState<string | null>(null); const [needNote, setNeedNote] = useState("");
  function chooseNeed(id: string) { setNeed(id); const n = careNeed(id); if (n && n.tier > 1) setTier(n.tier); else setTier(0); }
  const needSkills = need ? careNeed(need)?.skills ?? [] : [];
  const score = (c: CG) => c.skills.filter((s) => needSkills.includes(s)).length;
  useEffect(() => { setList(null); api<CG[]>(`/api/caregivers?type=${type}${tier ? `&tier=${tier}` : ""}`).then(setList).catch((e) => setErr(e.message)); }, [type, tier]);
  return (
    <div>
      <div className="card mb-5">
        <div className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">Step 1 · What care is needed?</div>
        <div className="grid gap-4">{CARE_NEED_GROUPS.map((g) => (
          <div key={g}><div className="mb-2 text-sm font-semibold text-ink">{g}</div>
            <div className="flex flex-wrap gap-2">{CARE_NEEDS.filter((n) => n.group === g).map((n) => (
              <button key={n.id} type="button" aria-pressed={need === n.id} onClick={() => chooseNeed(n.id)}
                className={`min-h-[48px] rounded-xl border px-4 text-[15px] font-semibold transition ${need === n.id ? "border-orange-400 bg-orange-50 text-ink" : "border-line bg-white hover:border-indigo-500"}`}>{n.label}</button>))}</div></div>))}</div>
        {need === "other" && <input className="input mt-3" placeholder="Tell us briefly what care is needed" value={needNote} onChange={(e) => setNeedNote(e.target.value)} maxLength={200} />}
        {need && careNeed(need)!.tier > 1 && <p className="note mt-3">Suggested: {TIER[careNeed(need)!.tier]} or higher for this need. You can change the tier below.</p>}
      </div>
      {need && <>
      <div className="card grid gap-5">
        <div className="text-xs font-bold uppercase tracking-widest text-muted">Step 2 · When and how long</div>
        <Seg label="Type of care" value={type} set={setType} opts={[["day", "Day shift", "8 hours"], ["night", "Night shift", "8 PM to 8 AM"], ["live", "24 hour live in", "Stays in the home"]]} />
        <Seg label="How long" value={days} set={setDays} opts={[[1, "One day"], [7, "Weekly"], [30, "Monthly"], [90, "Quarterly"]]} />
        <Seg label="Tier" value={tier} set={setTier} opts={[[0, "All tiers"], [1, "Tier 1 Companion"], [2, "Tier 2 Trained"], [3, "Tier 3 Nurse"]]} />
      </div>
      {err && <p className="mt-4 text-coral-600">{err}</p>}
      <p className="note mt-5">{list ? `${list.length} caregivers for ${TYPE[type].toLowerCase()}, ${DUR[days].toLowerCase()}.` : "Loading caregivers"} Rates are pilot samples until confirmed.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list?.slice().sort((a, b) => score(b) - score(a)).map((c) => { const f = fees(c[RATE[type]], days); return (
          <article key={c.id} className="card flex flex-col gap-3">
            <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full font-display font-bold text-white" style={{ background: COLORS[c.tier - 1] }}>{c.initials}</span>
              <div className="min-w-0"><h3 className="text-lg font-bold">{c.display_name}</h3><p className="text-sm text-muted">{c.rating_count ? `★ ${c.rating.toFixed(1)} (${c.rating_count} ratings)` : "New on Uday, no ratings yet"}{c.experience_years ? ` · ${c.experience_years} yrs` : ""} · {c.area}</p></div></div>
            <div className="flex flex-wrap gap-1.5">{score(c) > 0 && <span className="pill-wait">Good match</span>}<span className="chip">{TIER[c.tier]}</span>{c.police_verified && <span className="pill-ok">✓ Police verified</span>}{c.id_verified && <span className="pill-ok">✓ ID verified</span>}</div>
            <p className="text-sm">{c.skills.join(" · ")} <span className="text-muted">· {c.languages.join(", ")}</span></p>
            <div className="mt-auto flex items-end justify-between border-t border-line pt-3">
              <div><div className="text-xs text-muted">{inr(c[RATE[type]])} a day · {DUR[days]}</div><div className="font-display text-xl font-extrabold text-ink">{inr(f.care)}</div></div>
              <button className="btn" onClick={() => setPick(c)}>Hire</button></div>
          </article>); })}
      </div>
      </>}
      {pick && need && <Checkout c={pick} type={type} days={days} need={need} needNote={needNote} onClose={() => setPick(null)} onDone={(id) => router.push(`/app/bookings/${id}`)} />}
    </div>
  );
}

function Checkout({ c, type, days, need, needNote, onClose, onDone }: { c: CG; type: "day" | "night" | "live"; days: number; need: string; needNote: string; onClose: () => void; onDone: (id: string) => void }) {
  const commitments = homeCommitments(type); const [agreed, setAgreed] = useState<string[]>([]); const [rateFirst, setRateFirst] = useState<string | null>(null);
  const [me, setMe] = useState<any>(undefined); const [recips, setRecips] = useState<any[]>([]);
  const tomorrow = useMemo(() => { const d = new Date(Date.now() + 86400e3); return d.toISOString().slice(0, 10); }, []);
  const [rid, setRid] = useState(""); const [date, setDate] = useState(tomorrow); const [time, setTime] = useState(TIMES[type][type === "day" ? 1 : 0][0]);
  const [method, setMethod] = useState("UPI"); const [note, setNote] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const f = fees(c[RATE[type]], days);
  useEffect(() => { api("/api/me").then(async (m) => { setMe(m); if (m.user.role === "family") { const r = await api<any[]>("/api/recipients"); setRecips(r); if (r[0]) setRid(r[0].id); } }).catch(() => setMe(null)); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", k); document.body.style.overflow = "hidden"; return () => { removeEventListener("keydown", k); document.body.style.overflow = ""; }; }, [onClose]);
  async function send() { setErr(""); setBusy(true);
    try { const b = await api<{ id: string }>("/api/bookings", { body: { recipientId: rid, caregiverId: c.id, careType: type, days, startDate: date, startTime: time, method, note: note || undefined, careNeed: need, careNeedNote: needNote || undefined, homeCommitments: agreed } }); onDone(b.id); }
    catch (x: any) { if (x.data?.needsRating) setRateFirst(x.data.needsRating); else setErr(x.message); setBusy(false); } }
  async function submit(e: React.FormEvent) { e.preventDefault(); if (agreed.length < commitments.length) { setErr("Please confirm everything the caregiver needs at home."); return; } send(); }
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-indigo-950/60 sm:items-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Request ${c.display_name}`} className="max-h-[94vh] w-full overflow-auto rounded-t-3xl bg-white p-5 sm:max-w-lg sm:rounded-3xl sm:p-7" style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line sm:hidden" />
        <div className="flex items-start justify-between"><div><div className="eyebrow">Request a caregiver</div><h2 className="mt-1 text-2xl font-extrabold">{c.display_name}</h2><p className="text-sm text-muted">{TIER[c.tier]} · {TYPE[type]} · {DUR[days]} · {careNeed(need)?.label}</p></div>
          <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl border border-line" aria-label="Close">✕</button></div>
        {me === undefined ? <p className="mt-6">Loading</p> : !me ? (
          <div className="mt-6"><p>Sign in or register to send a request. It takes a minute.</p><a href="/signin?next=/hire" className="btn mt-4 w-full">Sign in / Register</a></div>
        ) : me.user.role !== "family" ? <p className="mt-6">Requests are made from a family account.</p> : !recips.length ? (
          <div className="mt-6"><p>First, tell us about the person who needs care.</p><a href="/app/onboarding" className="btn mt-4 w-full">Add your parent</a></div>
        ) : (
          <form onSubmit={submit} className="mt-5 grid gap-4">
            <div className="field"><label htmlFor="rp">Care for</label><select id="rp" className="input" value={rid} onChange={(e) => setRid(e.target.value)}>{recips.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.locality}</option>)}</select></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field"><label htmlFor="dt">Start date</label><input id="dt" type="date" className="input" min={tomorrow} value={date} onChange={(e) => setDate(e.target.value)} required /></div>
              <div className="field"><label htmlFor="tm">Hours</label><select id="tm" className="input" value={time} onChange={(e) => setTime(e.target.value)}>{TIMES[type].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div></div>
            <div className="field"><label htmlFor="nt">Anything the caregiver should know</label><textarea id="nt" className="input min-h-[80px] py-3" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></div>
            <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-semibold text-ink">Pay with</legend>
              {["UPI", "Card", "Net banking"].map((m) => <label key={m} className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-4 ${method === m ? "border-orange-400 bg-orange-50" : "border-line"}`}><input type="radio" name="pm" value={m} checked={method === m} onChange={() => setMethod(m)} />{m === "Card" ? "Debit or credit card, Indian or international" : m}</label>)}</fieldset>
            <dl className="rounded-2xl bg-indigo-50/70 p-4 text-sm">
              {[[`Care fee · ${inr(c[RATE[type]])} × ${days}`, f.care], ["Uday platform fee", f.pf], ["GST on platform fee", f.gst]].map(([t, v]) => <div key={t as string} className="flex justify-between py-1"><dt>{t}</dt><dd className="font-semibold text-ink">{inr(v as number)}</dd></div>)}
              <div className="mt-1 flex justify-between border-t border-line pt-2"><dt className="font-semibold text-ink">Held now, charged on acceptance</dt><dd className="font-display text-xl font-extrabold text-ink">{inr(f.total)}</dd></div></dl>
            <fieldset className="grid gap-2 rounded-2xl border border-line p-4"><legend className="px-1 text-sm font-semibold text-ink">What you will provide at home</legend>
              <p className="note">Caregivers work best, and stay longer, when these are in place.{type === "live" ? " Live in care needs all of them." : ""}</p>
              {commitments.map((h) => <label key={h.id} className="flex min-h-[44px] items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5" checked={agreed.includes(h.id)} onChange={(e) => setAgreed(e.target.checked ? [...agreed, h.id] : agreed.filter((x) => x !== h.id))} />{h.label}</label>)}
              <button type="button" className="justify-self-start text-sm font-semibold text-indigo-600" onClick={() => setAgreed(commitments.map((h) => h.id))}>Confirm all</button>
            </fieldset>
            {rateFirst && <div className="rounded-2xl border-2 border-orange-400 bg-orange-50 p-4"><p className="mb-2 font-semibold text-ink">Before booking {c.display_name.split(" ")[0]} again, please rate their last care.</p>
              <RateCare compact bookingId={rateFirst} name={c.display_name.split(" ")[0]} onDone={() => { setRateFirst(null); send(); }} /></div>}
            <p className="note">Free to cancel up to 4 hours before a shift, then 20% of one day of care. If {c.display_name.split(" ")[0]} cannot take it, Uday proposes a same tier caregiver for your approval.</p>
            {err && <p role="alert" className="rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-600">{err}</p>}
            <button className="btn w-full" disabled={busy || !rid}>{busy ? "Sending request" : `Hold ${inr(f.total)} and send request`}</button>
          </form>)}
      </div>
    </div>
  );
}
