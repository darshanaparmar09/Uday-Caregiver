"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";

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
