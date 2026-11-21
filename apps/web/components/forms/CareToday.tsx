"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../api";

const when = (d: string) => new Date(d).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Today's care updates and what parents said to "Speak to Uday". Shown on the family dashboard. */
export function CareToday() {
  const [ups, setUps] = useState<any[]>([]); const [voice, setVoice] = useState<any[]>([]);
  const load = () => { api<any[]>("/api/updates").then(setUps).catch(() => {}); api<any[]>("/api/voice/requests").then(setVoice).catch(() => {}); };
  useEffect(load, []);
  const open = voice.filter((v) => ["new", "seen"].includes(v.status));
  if (!ups.length && !open.length) return null;
  return (<section className="grid gap-3">
    {open.map((v) => (
      <div key={v.id} className={`card border-l-4 ${v.category === "urgent" ? "border-l-coral-600" : "border-l-orange-400"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{v.name.split(" ")[0]} said to Uday · {v.what}</h3><span className="text-sm text-muted">{when(v.at)}</span></div>
        {v.heard ? <p className="mt-1 text-ink">"{v.heard}"</p> : <p className="mt-1 text-muted">No text yet. Listen to the recording.</p>}
        {v.summary && <p className="note mt-1">Summary by AI: {v.summary}</p>}
        <audio className="mt-2 w-full" controls preload="none" src={`/api/voice/requests/${v.id}/audio`} />
        <div className="mt-2 flex gap-3 text-sm font-semibold"><button className="text-indigo-600" onClick={() => api(`/api/voice/requests/${v.id}`, { body: { status: "done" } }).then(load)}>Mark as handled</button>
          {v.category === "book_caregiver" && <Link className="text-indigo-600" href="/hire">Find a caregiver</Link>}</div>
      </div>))}
    {ups.map((u) => (
      <div key={u.bookingId} className="card border-l-4 border-l-teal-500">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{u.name}: day {u.day} update</h3><span className="text-sm text-muted">{when(u.at)}</span></div>
        <p className="mt-1 text-ink">{u.text}</p>
        <p className="note mt-1">{u.source === "ai" ? "Written by AI from the caregiver's records." : "From the caregiver's records."} Not a medical assessment.</p>
        <Link className="mt-1 inline-block text-sm font-semibold text-indigo-600" href={`/app/bookings/${u.bookingId}`}>See full log</Link>
      </div>))}
  </section>);
}

/** Appointments and follow ups for one parent, with AI suggestions from an uploaded document to confirm. */
export function Appointments({ rid, name }: { rid: string; name: string }) {
  const [list, setList] = useState<any[] | null>(null); const [docs, setDocs] = useState<any[]>([]); const [ai, setAi] = useState<any>(null);
  const [f, setF] = useState({ title: "", at: "", place: "", kind: "doctor" }); const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => { api<any[]>(`/api/recipients/${rid}/appointments`).then(setList).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); api<any[]>(`/api/recipients/${rid}/documents`).then(setDocs).catch(() => {}); api(`/api/recipients/${rid}/ai-help`).then(setAi).catch(() => {}); }, [rid]);
  async function run(fn: () => Promise<any>, ok: string) { setBusy(true); setErr(""); setMsg(""); try { await fn(); setMsg(ok); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  const add = () => run(() => api(`/api/recipients/${rid}/appointments`, { body: { ...f, at: new Date(f.at).toISOString(), place: f.place || undefined } }).then(() => setF({ title: "", at: "", place: "", kind: "doctor" })), "Added. Reminders go a day before and two hours before.");
  return (<div className="card grid gap-3"><h2 className="text-lg font-bold">Appointments for {name}</h2>
    {msg && <p className="font-semibold text-teal-600">{msg}</p>}{err && <p className="font-semibold text-coral-600">{err}</p>}
    {list?.length ? list.map((a) => (
      <div key={a.id} className={`rounded-xl border px-3 py-2 ${a.status === "suggested" ? "border-orange-400 bg-orange-50" : "border-line"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-ink">{a.title}</b><span className="text-sm">{a.at ? when(a.at) : "Date not found"}{a.place ? ` · ${a.place}` : ""}</span></div>
        {a.label && <p className="note">{a.label}</p>}{a.notes && <p className="text-sm text-muted">{a.notes}</p>}
        <div className="mt-1 flex flex-wrap gap-3 text-sm font-semibold text-indigo-600">
          {a.status === "suggested" && <button disabled={busy || !a.at} onClick={() => run(() => api(`/api/recipients/${rid}/appointments/${a.id}`, { body: { action: "confirm" } }), "Confirmed. Reminders are on.")}>Confirm</button>}
          {a.status === "confirmed" && <button disabled={busy} onClick={() => run(() => api(`/api/recipients/${rid}/appointments/${a.id}`, { body: { action: "done" } }), "Marked done.")}>Done</button>}
          <button disabled={busy} onClick={() => run(() => api(`/api/recipients/${rid}/appointments/${a.id}`, { body: { action: "cancel" } }), "Removed.")}>{a.status === "suggested" ? "Not right, remove" : "Cancel"}</button></div>
      </div>)) : <p className="text-sm text-muted">{list ? "No appointments yet." : "Loading"}</p>}
    <div className="grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
      <input className="input" placeholder="What, e.g. Review with Dr Joshi" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <input className="input" type="datetime-local" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} aria-label="Date and time" />
      <input className="input" placeholder="Where (optional)" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} />
      <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Kind">{[["doctor", "Doctor visit"], ["test", "Test"], ["therapy", "Therapy"], ["follow_up", "Follow up"], ["other", "Other"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <button className="btn justify-self-start" disabled={busy || f.title.length < 2 || !f.at} onClick={add}>Add appointment</button>
    </div>
    {docs.length > 0 && <div className="border-t border-line pt-3"><h3 className="font-semibold">Find dates in a document</h3>
      {ai?.on ? <><p className="text-sm">AI reads a prescription or discharge summary and suggests follow ups. You check and confirm each one. Medicines are never read into reminders.</p>
        <div className="mt-2 flex flex-wrap gap-2">{docs.slice(0, 6).map((d) => <button key={d.id} className="btn-ghost min-h-[40px] px-3 text-sm" disabled={busy}
          onClick={() => run(async () => { const r = await api<any>(`/api/recipients/${rid}/appointments/suggest`, { body: { documentId: d.id } }); if (!r.suggestions.length) throw new Error("No future dates found in this document."); }, "Suggestions added above. Please check each one against the document.")}>{d.title}</button>)}</div></>
        : <p className="text-sm text-muted">Turn on AI help for {name} under Your data on My account to use this.</p>}
    </div>}
  </div>);
}
