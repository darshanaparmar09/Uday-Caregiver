"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { READING_KINDS, READING_RANGE, type ReadingKind } from "@uday/core";
import { api } from "../api";

const SRC: Record<string, string> = { caregiver: "Caregiver", family: "Family", device: "Device" };
const MAIN: ReadingKind[] = ["bp_sys", "pulse", "spo2", "glucose", "temp_c", "weight_kg", "steps", "sleep_hours"];

function Spark({ pts }: { pts: { v: number; s: string }[] }) {
  if (pts.length < 2) return null;
  const vs = pts.map((p) => p.v); const lo = Math.min(...vs), hi = Math.max(...vs), r = hi - lo || 1;
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * 200, 46 - ((p.v - lo) / r) * 40] as const);
  return <svg viewBox="0 0 200 50" className="mt-2 h-12 w-full" aria-hidden><polyline fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-500" points={xy.map((p) => p.join(",")).join(" ")} />
    {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.5" className={pts[i].s === "device" ? "fill-teal-500" : pts[i].s === "family" ? "fill-orange-400" : "fill-indigo-600"} />)}</svg>;
}

/** All readings for one senior: caregiver logs, family entries and connected devices, labelled by source. */
export function Readings({ id }: { id: string }) {
  const [rows, setRows] = useState<any[]>([]); const [devs, setDevs] = useState<any[]>([]); const [kind, setKind] = useState<ReadingKind>("bp_sys");
  const [v, setV] = useState(""); const [v2, setV2] = useState(""); const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [hint, setHint] = useState<Record<string, string>>({});
  const load = () => { api<any[]>(`/api/recipients/${id}/readings`).then(setRows).catch((e) => setErr(e.message)); api<any[]>(`/api/recipients/${id}/devices`).then(setDevs).catch(() => {}); };
  useEffect(load, [id]);
  const by = useMemo(() => { const m: Record<string, any[]> = {}; rows.forEach((r) => (m[r.kind] ??= []).push(r)); return m; }, [rows]);
  async function add() { setErr(""); setMsg("");
    const items = [{ kind, value: Number(v) }]; if (kind === "bp_sys" && v2) items.push({ kind: "bp_dia", value: Number(v2) });
    try { await api(`/api/recipients/${id}/readings`, { body: { readings: items } }); setV(""); setV2(""); setMsg("Reading saved"); load(); } catch (e: any) { setErr(e.message); } }
  async function conn(d: string, off: boolean) { try { const r: any = await api(`/api/recipients/${id}/devices`, { body: { device: d, disconnect: off } }); setHint({ ...hint, [d]: r.next ?? "" }); load(); } catch (e: any) { setErr(e.message); } }
  const [lo, hi] = READING_RANGE[kind];
  return (
    <div className="grid gap-6">
      <Link href="/app" className="text-sm font-semibold text-indigo-600">← Dashboard</Link>
      <div><h1 className="text-3xl font-extrabold">Readings</h1><p className="mt-1">Last 30 days, from the caregiver's shift log, your own entries and connected devices.</p>
        <p className="mt-2 flex flex-wrap gap-3 text-sm"><span><i className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-600" /> Caregiver</span><span><i className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400" /> Family</span><span><i className="inline-block h-2.5 w-2.5 rounded-full bg-teal-500" /> Device</span></p></div>
      {msg && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-600">{msg}</p>}
      {err && <p role="alert" className="rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-600">{err}</p>}
      <div className="grid gap-4 sm:grid-cols-2">{MAIN.map((k) => { const list = by[k] ?? []; const last = list[list.length - 1]; const dia = k === "bp_sys" ? (by.bp_dia ?? []).at(-1) : null; return (
        <div key={k} className="card"><div className="flex items-baseline justify-between"><h2 className="font-bold">{READING_KINDS[k][0]}</h2><span className="text-sm text-muted">{list.length} reading{list.length === 1 ? "" : "s"}</span></div>
          {last ? <><p className="font-display text-3xl font-extrabold text-ink">{last.value}{dia ? `/${dia.value}` : ""} <span className="text-base font-normal text-muted">{READING_KINDS[k][1]}</span></p>
            <p className="text-sm text-muted">{SRC[last.source]}{last.device ? ` · ${devs.find((d) => d.id === last.device)?.name ?? last.device}` : ""} · {new Date(last.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
            <Spark pts={list.map((r) => ({ v: r.value, s: r.source }))} /></> : <p className="mt-2 text-muted">No readings yet</p>}</div>); })}</div>

      <div className="card grid gap-3"><h2 className="text-xl font-bold">Add a reading</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <select className="input" aria-label="Reading" value={kind} onChange={(e) => setKind(e.target.value as ReadingKind)}>{(Object.keys(READING_KINDS) as ReadingKind[]).filter((k) => k !== "bp_dia").map((k) => <option key={k} value={k}>{k === "bp_sys" ? "Blood pressure" : READING_KINDS[k][0]}</option>)}</select>
          <input className="input" type="number" inputMode="decimal" aria-label="Value" placeholder={kind === "bp_sys" ? "Upper, e.g. 128" : `${READING_KINDS[kind][1]} (${lo} to ${hi})`} value={v} onChange={(e) => setV(e.target.value)} />
          {kind === "bp_sys" ? <input className="input" type="number" aria-label="Lower" placeholder="Lower, e.g. 82" value={v2} onChange={(e) => setV2(e.target.value)} /> : <span />}
          <button className="btn" disabled={!v} onClick={add}>Save</button></div></div>

      <div className="card grid gap-3"><div><h2 className="text-xl font-bold">Wearables and home devices</h2><p className="note">Most watches sync through Apple Health or Health Connect on your parent's phone with the Uday app installed. Readings then appear here automatically.</p></div>
        {devs.map((d) => <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <div className="min-w-0"><b className="text-ink">{d.name}</b> {d.verify && <span className="pill-wait">Support being confirmed</span>}<p className="text-sm text-muted">{d.path} · reads {d.reads.map((k: ReadingKind) => READING_KINDS[k][0].toLowerCase()).join(", ")}</p>
            {d.status !== "not_connected" && d.status !== "disconnected" && <p className="text-sm">{d.status === "connected" ? `✓ Connected${d.lastSyncAt ? `, last sync ${new Date(d.lastSyncAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}` : ""}` : "Waiting for the first sync"}</p>}
            {hint[d.id] && <p className="mt-1 rounded-lg bg-indigo-50 px-3 py-2 text-sm">{hint[d.id]}</p>}</div>
          {["connected", "pending"].includes(d.status) ? <button className="btn-ghost min-h-[44px] px-4 text-sm" onClick={() => conn(d.id, true)}>Disconnect</button> : <button className="btn min-h-[44px] px-4 text-sm" onClick={() => conn(d.id, false)}>Connect</button>}</div>)}</div>
    </div>
  );
}
