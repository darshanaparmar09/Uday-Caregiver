"use client";
import { useEffect, useRef, useState } from "react";
import { payOnGateway } from "../checkout";
import { api, inr } from "../api";

/**
 * Caregiver on the way: live position on a map while she travels.
 * Map tiles come from OpenStreetMap for the pilot; production needs a tile provider plan (OSM's public tiles are not for heavy use).
 */
export function LiveMap({ id, name }: { id: string; name: string }) {
  const [d, setD] = useState<any>(null); const el = useRef<HTMLDivElement>(null); const map = useRef<any>(null); const marker = useRef<any>(null);
  useEffect(() => { const load = () => api(`/api/bookings/${id}/location`).then(setD).catch(() => {}); load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [id]);
  useEffect(() => {
    if (!d?.location || !el.current) return;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!document.getElementById("leaflet-css")) { const l = document.createElement("link"); l.id = "leaflet-css"; l.rel = "stylesheet"; l.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(l); }
      const pos: [number, number] = [d.location.lat, d.location.lng];
      if (!map.current) {
        map.current = L.map(el.current!, { zoomControl: true, attributionControl: true }).setView(pos, 14);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map.current);
        if (d.home) L.circleMarker([d.home.lat, d.home.lng], { radius: 9, color: "#1F7A6D", fillOpacity: 0.9 }).addTo(map.current).bindTooltip("Home");
        marker.current = L.circleMarker(pos, { radius: 11, color: "#F5891F", fillOpacity: 0.95 }).addTo(map.current).bindTooltip(name);
        if (d.home) map.current.fitBounds([pos, [d.home.lat, d.home.lng]], { padding: [40, 40] });
      } else marker.current.setLatLng(pos);
    })();
  }, [d, name]);
  if (!d?.sharing) return null;
  return (
    <div className="card"><div className="eyebrow text-teal-600">{name} is on the way</div>
      {d.location ? <><p className="mt-1">{d.km != null ? `About ${d.km} km away, around ${d.etaMin} minutes. ` : ""}Updated {new Date(d.location.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}.</p>
        <div ref={el} className="mt-3 h-64 w-full overflow-hidden rounded-xl" role="img" aria-label={`Map showing ${name} and the home`} />
        <a className="mt-2 inline-block text-sm font-semibold text-indigo-600" href={`https://www.google.com/maps?q=${d.location.lat},${d.location.lng}`} target="_blank" rel="noreferrer">Open in Google Maps</a></>
        : <p className="mt-1">Location will appear once her phone shares it.</p>}
    </div>);
}

/** Messages and a masked call between the family and the caregiver. */
export function Chat({ id, name }: { id: string; name: string }) {
  const [d, setD] = useState<any>(null); const [text, setText] = useState(""); const [err, setErr] = useState(""); const [call, setCall] = useState("");
  const load = () => api(`/api/bookings/${id}/messages`).then(setD).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [id]);
  async function send() { setErr(""); try { await api(`/api/bookings/${id}/messages`, { body: { body: text } }); setText(""); load(); } catch (e: any) { setErr(e.message); } }
  async function ring() { setErr(""); try { const r: any = await api(`/api/bookings/${id}/call`, { body: {} }); setCall(r.status === "simulated" ? "Test mode: the call would ring your phone now, then connect you." : "Your phone will ring now. Answer to be connected."); } catch (e: any) { setErr(e.message); } }
  if (!d?.open) return null;
  return (
    <div className="card grid gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Messages with {name}</h2><button className="btn-ghost" onClick={ring}>Call {name} through Uday</button></div>
      <p className="note">Your numbers stay private. Phone numbers and links are not allowed in messages.</p>
      {call && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-600">{call}</p>}
      <div className="grid max-h-72 gap-2 overflow-auto">{!d.messages.length && <p className="text-sm text-muted">No messages yet.</p>}
        {d.messages.map((m: any) => <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "justify-self-end bg-indigo-900 text-white" : "justify-self-start bg-indigo-50 text-ink"}`}>
          <div>{m.body}</div><div className={`mt-0.5 text-[11px] ${m.mine ? "text-indigo-200" : "text-muted"}`}>{m.mine ? "You" : m.name} · {new Date(m.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</div></div>)}</div>
      <div className="flex gap-2"><input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={`Message ${name}`} onKeyDown={(e) => e.key === "Enter" && text && send()} /><button className="btn shrink-0" disabled={!text} onClick={send}>Send</button></div>
      {err && <p role="alert" className="text-sm text-coral-600">{err}</p>}</div>);
}

/** Weekly payments: auto pay on or off, and paying a week by hand when needed. */
export function WeeklyPayments({ id, cycles, onChange }: { id: string; cycles: any[]; onChange: () => void }) {
  const [ap, setAp] = useState<any>(null); const [busy, setBusy] = useState(""); const [msg, setMsg] = useState<[boolean, string] | null>(null); const [method, setMethod] = useState("upi");
  const load = () => api(`/api/bookings/${id}/autopay`).then(setAp).catch(() => {}); useEffect(() => { load(); }, [id]);
  async function run(k: string, f: () => Promise<any>, ok: string) { setBusy(k); setMsg(null); try { await f(); setMsg([true, ok]); load(); onChange(); } catch (e: any) { setMsg([false, e.message]); } finally { setBusy(""); } }
  const on = ap?.mandate?.status === "active";
  const LABEL: Record<string, string> = { paid: "Paid", held: "Charging", cancelled: "Cancelled" };
  const next = cycles.find((c: any) => c.status === "failed" || c.status === "due")?.cycle_no; // only the next unpaid week can be paid by hand
  return (
    <div className="card grid gap-3 text-sm"><h2 className="text-lg font-bold">Weekly payments</h2>
      <div className={`grid gap-2 rounded-xl border p-3 ${on ? "border-teal-300 bg-teal-50" : "border-amber-300 bg-amber-50"}`}>
        {on ? <><b className="text-teal-800">✓ Auto pay is on ({ap.mandate.method === "card" ? "card" : "UPI AutoPay"})</b><span>Each week is charged two days before it starts, up to {inr(ap.mandate.max_paise)} a charge. You get a message every time.</span>
            <button className="btn-ghost justify-self-start" disabled={!!busy} onClick={() => run("off", () => api(`/api/bookings/${id}/autopay`, { method: "DELETE" }), "Auto pay switched off.")}>Switch off auto pay</button></>
          : <><b className="text-amber-900">Switch on auto pay so care never pauses</b><span>Approve once in your UPI app or with your card. ₹1 is charged to confirm. You can switch it off any time.</span>
            <div className="flex flex-wrap items-center gap-2">{[["upi", "UPI AutoPay"], ["card", "Card"]].map(([k, l]) => <label key={k} className="flex min-h-[44px] items-center gap-2 rounded-lg border border-line bg-white px-3"><input type="radio" name={`ap-${id}`} checked={method === k} onChange={() => setMethod(k)} />{l}</label>)}
              <button className="btn" disabled={!!busy} onClick={() => run("on", async () => { const r = await api(`/api/bookings/${id}/autopay`, { body: { method } }); if (r.checkout) await payOnGateway(r.checkout); }, "Auto pay is on.")}>{busy === "on" ? "Opening" : "Switch on auto pay"}</button></div></>}
      </div>
      {cycles.map((c: any) => <div key={c.cycle_no} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5">
        <span>Week {c.cycle_no} · days {c.from_day} to {c.to_day}</span>
        <span className="flex items-center gap-2 text-ink">{inr(c.amount_paise)} · {LABEL[c.status] ?? (c.status === "failed" ? (c.fail_reason === "no_autopay" ? "Waiting for payment" : "Payment failed") : `Due ${new Date(c.due_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`)}
          {c.cycle_no === next && (c.status === "failed" || !on) && <button className="btn min-h-[36px] px-3 text-xs" disabled={!!busy} onClick={() => run("p" + c.cycle_no, async () => { const r = await api(`/api/bookings/${id}/cycles/${c.cycle_no}`, { body: {} }); if (r.checkout) await payOnGateway(r.checkout); }, `Week ${c.cycle_no} paid.`)}>Pay now</button>}</span></div>)}
      {msg && <p role="status" className={`rounded-lg px-3 py-2 ${msg[0] ? "bg-teal-50 text-teal-800" : "bg-red-50 text-red-800"}`}>{msg[1]}</p>}
    </div>);
}
