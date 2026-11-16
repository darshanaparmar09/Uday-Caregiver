"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, inr, TYPE, DUR, TIER, STATUS } from "../api";

const STEPS = ["Requested", "Accepted", "On the way", "Arrived", "Care", "Done"];
const IDX: Record<string, number> = { offered: 0, proposal: 0, accepted: 1, enroute: 2, arrived: 3, active: 4, completed: 5, closed: 5 };
const TAGS = ["On time", "Kind and patient", "Followed the care profile", "Clean and tidy", "Good communication"];

function countdown(iso?: string) { if (!iso) return ""; const s = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`; }

export function BookingView({ id }: { id: string }) {
  const [b, setB] = useState<any>(null); const [err, setErr] = useState(""); const [panel, setPanel] = useState<string | null>(null);
  const [quote, setQuote] = useState<any>(null); const [busy, setBusy] = useState(false); const [, tick] = useState(0);
  const [stars, setStars] = useState(0); const [tags, setTags] = useState<string[]>([]); const [date, setDate] = useState(""); const [cat, setCat] = useState("Caregiver is late or did not arrive"); const [txt, setTxt] = useState("");
  const load = useCallback(() => api(`/api/bookings/${id}`).then(setB).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); const a = setInterval(load, 5000); const t = setInterval(() => tick((n) => n + 1), 1000); return () => { clearInterval(a); clearInterval(t); }; }, [load]);
  async function act(body: any) { setBusy(true); setErr(""); try { await api(`/api/bookings/${id}/action`, { body }); setPanel(null); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  async function open(p: string) { setPanel(panel === p ? null : p); if (p === "cancel" || p === "resch") setQuote(await api(`/api/bookings/${id}/quote`).catch(() => null)); if (p === "resch") setDate(b.startDate); }

  if (!b) return <p>{err || "Loading"}</p>;
  const s = STATUS[b.status]; const first = b.caregiver.name.split(" ")[0]; const i = IDX[b.status];
  return (
    <div className="grid gap-5">
      <Link href="/app" className="text-sm font-semibold text-indigo-600">← My Uday</Link>
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-indigo-900 font-display font-bold text-orange-400">{b.caregiver.initials}</span>
            <div><h1 className="text-2xl font-extrabold">{b.caregiver.name}</h1><p className="text-sm text-muted">{TIER[b.tier]} · {b.code}</p></div></div>
          <span className={s[0]}>{s[1]}</span></div>
        {i !== undefined && <div className="mt-5"><div className="flex gap-1">{STEPS.map((_, k) => <div key={k} className={`h-1.5 flex-1 rounded-full ${k <= i ? "bg-teal-500" : "bg-line"}`} />)}</div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted">{STEPS.map((t) => <span key={t}>{t}</span>)}</div></div>}
        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-muted">Care</dt><dd className="text-ink">{TYPE[b.careType]}</dd>
          <dt className="text-muted">Plan</dt><dd className="text-ink">{DUR[b.days]}{b.days > 1 ? ` · day ${Math.min(b.daysDone + 1, b.days)} of ${b.days}` : ""}</dd>
          <dt className="text-muted">Starts</dt><dd className="text-ink">{b.startDate} · {String(b.startTime).slice(0, 5)}</dd>
          <dt className="text-muted">For</dt><dd className="text-ink">{b.recipient.name}, {b.recipient.locality}</dd></dl>
      </div>

      {b.status === "offered" && <div className="card border-orange-400 bg-orange-50"><div className="eyebrow">Waiting for {first} to accept</div><div className="mt-1 font-display text-4xl font-extrabold tabular-nums text-ink">{countdown(b.offerExpiresAt)}</div>
        <p className="mt-2">{inr(b.fees.totalPaise)} is held, not charged. If {first} declines or does not answer, Uday finds the next caregiver of the same tier and asks you first.</p></div>}
      {b.status === "proposal" && b.proposal && <div className="card border-orange-400 bg-orange-50"><div className="eyebrow">Your approval needed</div>
        <p className="mt-2">{b.events.filter((e: any) => e.to_status === "proposal").slice(-1)[0]?.message}</p>
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-white p-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-indigo-900 text-sm font-bold text-orange-400">{b.proposal.initials}</span>
          <div><b className="text-ink">{b.proposal.display_name}</b><div className="text-sm text-muted">{TIER[b.proposal.tier]} · ★ {b.proposal.rating} · {b.proposal.experience_years} yrs · {b.proposal.area}</div><div className="text-sm">{b.proposal.skills.join(", ")}</div></div></div>
        <div className="mt-4 flex flex-wrap gap-3"><button className="btn" disabled={busy} onClick={() => act({ action: "approve" })}>Send request to {b.proposal.display_name.split(" ")[0]}</button><button className="btn-ghost" disabled={busy} onClick={() => act({ action: "reject" })}>No, cancel and release hold</button></div></div>}
      {b.status === "accepted" && <div className="card border-teal-500 bg-teal-50"><div className="eyebrow text-teal-600">Confirmed</div><p className="mt-2">{first} is booked{b.daysDone ? " for the next shift" : ""}. {inr(b.fees.totalPaise)} captured. The caregiver is paid one completed shift at a time.</p></div>}
      {b.status === "enroute" && <div className="card border-teal-500 bg-teal-50"><div className="eyebrow text-teal-600">On the way</div><p className="mt-2">{first} has started travelling.</p></div>}
      {b.status === "arrived" && <div className="card border-teal-500 bg-teal-50"><div className="eyebrow text-teal-600">Arrived · location checked</div><p className="mt-2">Share this start code with {first} only when they are at the door.</p><div className="mt-2 font-display text-5xl font-extrabold tracking-[.3em] text-ink">{b.startCode}</div></div>}
      {b.status === "active" && <div className="card border-teal-500 bg-teal-50"><div className="eyebrow text-teal-600">Care in progress</div><p className="mt-2">At the end of the shift, give this end code.</p><div className="mt-2 font-display text-5xl font-extrabold tracking-[.3em] text-ink">{b.endCode}</div></div>}
      {(b.status === "cancelled" || b.status === "released") && <div className="card"><div className="eyebrow text-muted">{s[1]}</div><p className="mt-2">{b.events.slice(-1)[0]?.message}</p>{b.refundPaise != null && <p className="mt-2 font-semibold text-ink">Refund {inr(b.refundPaise)}{b.cancelFeePaise ? ` · fee ${inr(b.cancelFeePaise)}` : ""}. Back to your payment method in 5 to 7 working days (gateway dependent).</p>}</div>}

      {!!b.logs?.length && <div className="card"><h2 className="text-lg font-bold">Shift log</h2><div className="mt-3 grid gap-3">{b.logs.slice().reverse().map((l: any, k: number) => (
        <div key={k} className="border-l-4 border-teal-500 pl-3 text-sm"><b className="text-ink">Day {l.day} · {new Date(l.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</b><div>{[l.checklist && `${Object.keys(l.checklist).length} care tasks done`, l.meal && "Meal given", l.meds && "Medicines given", `Mood: ${l.mood}`].filter(Boolean).join(" · ")}</div>
        {l.vitals && <div>{[l.vitals.bpSys && `BP ${l.vitals.bpSys}/${l.vitals.bpDia}`, l.vitals.pulse && `Pulse ${l.vitals.pulse}`, l.vitals.tempC && `Temp ${l.vitals.tempC}°C`, l.vitals.pain != null && `Pain ${l.vitals.pain}/10`, l.vitals.appetite && `Appetite ${l.vitals.appetite}`, l.vitals.skinConcern && "Skin concern noted"].filter(Boolean).join(" · ")}</div>}
        {l.flags?.length ? <div className="mt-1 rounded-lg bg-coral-50 px-2 py-1 font-semibold text-coral-600">Outside usual range: {l.flags.join(", ")}. Uday has been alerted.</div> : null}
        {l.note && <div className="text-muted">{l.note}</div>}</div>))}</div></div>}

      <div className="flex flex-wrap gap-2">
        {["offered", "proposal", "accepted", "enroute"].includes(b.status) && <button className="btn-ghost" onClick={() => open("cancel")}>Cancel booking</button>}
        {b.status === "accepted" && !b.daysDone && <button className="btn-ghost" onClick={() => open("resch")}>Reschedule</button>}
        {b.status === "completed" && <button className="btn" onClick={() => setPanel("rate")}>Rate the care</button>}
        {!["offered", "proposal", "released"].includes(b.status) && <button className="btn-ghost" onClick={() => setPanel(panel === "invoice" ? null : "invoice")}>Invoice</button>}
        <button className="btn-ghost" onClick={() => setPanel(panel === "help" ? null : "help")}>Get help</button>
      </div>

      {panel === "cancel" && quote && <div className="card grid gap-2"><h2 className="text-lg font-bold">Cancel this booking?</h2>
        <div className="flex justify-between text-sm"><span>Cancellation fee</span><b className="text-ink">{inr(quote.feePaise)}</b></div><div className="flex justify-between text-sm"><span>Refund</span><b className="text-ink">{inr(quote.refundPaise)}</b></div>
        <p className="note">{quote.reason === "late" ? "Less than 4 hours before the next shift, so 20% of one day of care applies." : quote.reason === "free_window" ? "More than 4 hours before the next shift, so cancelling is free." : "Not confirmed yet, so the full hold is released."} Unused days are always refunded.</p>
        <div className="flex gap-2"><button className="inline-flex min-h-[48px] items-center rounded-xl border border-coral-500 px-5 font-semibold text-coral-600" disabled={busy} onClick={() => act({ action: "cancel" })}>Yes, cancel</button><button className="btn-ghost" onClick={() => setPanel(null)}>Keep booking</button></div></div>}
      {panel === "resch" && <div className="card grid gap-3"><h2 className="text-lg font-bold">Move the start date</h2><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        <p className="note">{quote?.feePaise ? `Inside 4 hours of the shift, so a ${inr(quote.feePaise)} fee applies.` : "Free to reschedule."}</p><button className="btn" disabled={busy} onClick={() => act({ action: "reschedule", startDate: date })}>Confirm new date</button></div>}
      {panel === "rate" && <div className="card grid gap-3"><h2 className="text-lg font-bold">Rate {first}</h2>
        <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n} stars`} onClick={() => setStars(n)} className={`h-12 w-12 text-3xl ${n <= stars ? "text-orange-400" : "text-line"}`}>★</button>)}</div>
        <div className="flex flex-wrap gap-2">{TAGS.map((t) => <button key={t} type="button" aria-pressed={tags.includes(t)} onClick={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])} className={`min-h-[40px] rounded-full border px-3 text-sm ${tags.includes(t) ? "border-orange-400 bg-orange-50" : "border-line"}`}>{t}</button>)}</div>
        {stars > 0 && stars <= 3 && <p className="note">A rating of 3 or below opens a help request so the care manager calls you.</p>}
        <button className="btn" disabled={!stars || busy} onClick={() => act({ action: "rate", stars, tags })}>Submit rating</button></div>}
      {panel === "invoice" && <div className="card grid gap-1 text-sm"><h2 className="mb-2 text-lg font-bold">Invoice {b.code.replace("UDY", "INV")}</h2>
        {[[`Care fee · ${inr(b.fees.ratePaise)} × ${b.days}`, b.fees.carePaise], ["Uday platform fee", b.fees.platformPaise], ["GST on platform fee", b.fees.gstPaise]].map(([t, v]) => <div key={t} className="flex justify-between"><span>{t}</span><b className="text-ink">{inr(v)}</b></div>)}
        <div className="mt-1 flex justify-between border-t border-line pt-2"><span className="font-semibold text-ink">Total</span><b className="font-display text-lg text-ink">{inr(b.fees.totalPaise)}</b></div>
        <p className="note mt-2">GST invoice PDF is emailed once the GSTIN is registered.</p></div>}
      {panel === "help" && <div className="card grid gap-3"><h2 className="text-lg font-bold">Get help with this booking</h2>
        <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>{["Caregiver is late or did not arrive", "Safety concern", "Care quality", "Caregiver conduct", "Payment or refund", "Change the care plan", "Something else"].map((c) => <option key={c}>{c}</option>)}</select>
        <textarea className="input min-h-[90px] py-3" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Tell us more" />
        <p className="note"><b className="text-coral-600">If anyone is in danger, call 112 first.</b> Safety and no show requests go to the care manager on duty.</p>
        <button className="btn" disabled={busy} onClick={() => act({ action: "ticket", category: cat, text: txt })}>Send to Uday</button></div>}
      {!!b.tickets?.length && <div className="card text-sm"><h2 className="mb-2 text-lg font-bold">Your help requests</h2>{b.tickets.map((t: any) => <div key={t.code} className="py-1"><b className="text-ink">{t.code}</b> · {t.category} · {t.status} · first response by {new Date(t.sla_due_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</div>)}</div>}
      {err && <p role="alert" className="rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-600">{err}</p>}
      <details className="card"><summary className="min-h-[44px] cursor-pointer font-semibold text-ink">Booking activity ({b.events.length})</summary>
        <ul className="mt-3 grid gap-2 text-sm">{b.events.slice().reverse().map((e: any, k: number) => <li key={k} className="flex gap-3"><time className="w-20 shrink-0 text-muted">{new Date(e.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</time><span>{e.message}</span></li>)}</ul></details>
    </div>
  );
}
