"use client";
import { useEffect, useState } from "react";
import { api } from "../api";

/**
 * Urgent alerts about a parent: SOS, asked for help, missed check in. Stays on screen until someone in the family
 * taps "I am responding". Until then Uday keeps escalating to the emergency contacts and its own team.
 */
export function AlertBanner() {
  const [list, setList] = useState<any[]>([]); const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const load = () => api<any[]>("/api/alerts").then(setList).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);
  async function act(id: string, body: any) { setBusy(id); setErr(""); try { await api(`/api/alerts/${id}`, { body }); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(""); } }
  if (!list.length) return null;
  return (
    <div className="grid gap-3" role="alert" aria-live="assertive">{list.map((a) => a.status === "open" ? (
      <div key={a.id} className="grid gap-3 rounded-xl2 border-2 border-red-500 bg-red-50 p-4">
        <div><b className="text-lg text-red-800">{a.name} {a.what}</b><div className="text-sm text-red-900">{new Date(a.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}. Call them now. If you cannot reach them and fear danger, call 112 (India).</div></div>
        {a.mine ? <p className="text-sm">You raised this. Another family member or the Uday team needs to respond.</p>
          : <div className="flex flex-wrap gap-2"><button className="btn" disabled={busy === a.id} onClick={() => act(a.id, { action: "ack" })}>I am responding</button></div>}
        <p className="text-xs text-red-900">Until someone responds, Uday keeps alerting the emergency contacts and its own team{a.level ? ` (round ${a.level + 1})` : ""}.</p>
      </div>) : (
      <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-teal-500 bg-teal-50 p-4 text-sm">
        <span><b>{a.name} {a.what}.</b> {a.acknowledgedBy ?? "Someone"} is responding.</span>
        <button className="btn-ghost min-h-[40px]" disabled={busy === a.id} onClick={() => act(a.id, { action: "resolve", note: "Family confirmed all is well" })}>All is well now</button>
      </div>))}
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>);
}
