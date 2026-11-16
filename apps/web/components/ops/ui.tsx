"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

/** Loads JSON from an ops endpoint and reloads on demand. */
export function useLoad<T = any>(url: string | null, every = 0) {
  const [d, setD] = useState<T | null>(null); const [err, setErr] = useState("");
  const load = useCallback(() => { if (!url) return Promise.resolve(); return api<T>(url).then((x) => { setD(x); setErr(""); }).catch((e) => setErr(e.message)); }, [url]);
  useEffect(() => { load(); if (!every) return; const t = setInterval(load, every); return () => clearInterval(t); }, [load, every]);
  return { d, err, load, setD };
}
export const rs = (p: number | string | null | undefined) => "₹" + (Number(p ?? 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
export const rs2 = (p: number | string | null | undefined) => "₹" + (Number(p ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const when = (t?: string | Date | null, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) => (t ? new Date(t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ...opts }) : "");
export const day = (t?: string | Date | null) => (t ? new Date(t).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }) : "");
export function ago(t?: string | Date | null) {
  if (!t) return ""; const m = Math.round((Date.now() - new Date(t).getTime()) / 60000);
  if (m < 0) { const f = -m; return f < 60 ? `in ${f} min` : f < 1440 ? `in ${Math.round(f / 60)} h` : `in ${Math.round(f / 1440)} d`; }
  return m < 1 ? "now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}
const TONE: Record<string, string> = {
  critical: "bg-red-600 text-white", high: "bg-red-100 text-red-800", medium: "bg-orange-100 text-orange-800", low: "bg-slate-100 text-slate-700",
  open: "bg-orange-100 text-orange-800", in_progress: "bg-indigo-100 text-indigo-800", waiting: "bg-slate-100 text-slate-700", resolved: "bg-teal-50 text-teal-700",
  investigating: "bg-indigo-100 text-indigo-800", action_taken: "bg-indigo-100 text-indigo-800", closed: "bg-teal-50 text-teal-700",
  offered: "bg-orange-100 text-orange-800", proposal: "bg-orange-100 text-orange-800", accepted: "bg-teal-50 text-teal-700", enroute: "bg-teal-50 text-teal-700", arrived: "bg-teal-50 text-teal-700",
  active: "bg-teal-50 text-teal-700", completed: "bg-indigo-100 text-indigo-800", cancelled: "bg-slate-100 text-slate-600", released: "bg-slate-100 text-slate-600",
  verifying: "bg-orange-100 text-orange-800", paused: "bg-red-100 text-red-800", exited: "bg-slate-200 text-slate-700", applied: "bg-slate-100 text-slate-700",
  clear: "bg-teal-50 text-teal-700", not_clear: "bg-red-100 text-red-800", pending: "bg-orange-100 text-orange-800", paid: "bg-teal-50 text-teal-700", held: "bg-indigo-100 text-indigo-800",
  due: "bg-slate-100 text-slate-700", failed: "bg-red-100 text-red-800", captured: "bg-teal-50 text-teal-700", partially_refunded: "bg-orange-100 text-orange-800", refunded: "bg-slate-100 text-slate-700",
  admin: "bg-indigo-900 text-white", agent: "bg-indigo-100 text-indigo-800", finance: "bg-teal-50 text-teal-700", viewer: "bg-slate-100 text-slate-700", issued: "bg-teal-50 text-teal-700",
  processing: "bg-orange-100 text-orange-800", queued: "bg-slate-100 text-slate-700", sent: "bg-teal-50 text-teal-700",
};
const LABEL: Record<string, string> = { in_progress: "in progress", action_taken: "action taken", not_clear: "not clear", partially_refunded: "part refunded", enroute: "on the way", offered: "waiting", proposal: "needs approval" };
export function Pill({ s, children }: { s: string; children?: React.ReactNode }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${TONE[s] ?? "bg-slate-100 text-slate-700"}`}>{children ?? LABEL[s] ?? s?.replace(/_/g, " ")}</span>;
}
export function Head({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div className="min-w-0"><h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>{sub && <p className="mt-1 text-sm text-muted">{sub}</p>}</div>{children && <div className="flex flex-wrap gap-2">{children}</div>}</div>;
}
export function Msg({ m }: { m: [boolean, string] | null }) {
  return m ? <p role="status" className={`rounded-lg px-3 py-2 text-sm ${m[0] ? "bg-teal-50 text-teal-800" : "bg-red-50 text-red-800"}`}>{m[1]}</p> : null;
}
export function Box({ title, children, right, className = "" }: { title?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-white ${className}`}>{(title || right) && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3"><h2 className="text-base font-bold">{title}</h2>{right}</div>}<div className="p-4">{children}</div></section>;
}
export function Table({ children, empty }: { children: React.ReactNode; empty?: string | false }) {
  return empty ? <p className="text-sm text-muted">{empty}</p> : <div className="-mx-4 overflow-x-auto px-4"><table className="tbl">{children}</table></div>;
}
export function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "alert" | "ok" }) {
  return <div className={`kpi ${tone === "alert" ? "border-red-300 bg-red-50" : ""}`}><div className="text-xs font-bold uppercase tracking-wider text-muted">{label}</div><div className={`mt-1 font-display text-2xl font-extrabold ${tone === "alert" ? "text-red-700" : "text-ink"}`}>{value}</div>{sub && <div className="text-xs text-muted">{sub}</div>}</div>;
}
export function Tabs({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (v: string) => void }) {
  return <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={`min-h-[36px] rounded-lg px-3 text-sm font-semibold ${value === k ? "bg-indigo-900 text-white" : "text-ink hover:bg-indigo-50"}`}>{l}</button>)}</div>;
}
/** A button that opens a small inline form asking for a reason (and optional fields), then runs the action. */
export function ReasonAction({ label, confirm, danger, disabled, fields, run, reasonLabel = "Reason (recorded)" }: { label: string; confirm?: string; danger?: boolean; disabled?: boolean; reasonLabel?: string;
  fields?: (v: Record<string, any>, set: (k: string, x: any) => void) => React.ReactNode; run: (v: Record<string, any>) => Promise<any> }) {
  const [open, setOpen] = useState(false); const [v, setV] = useState<Record<string, any>>({ reason: "" }); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const set = (k: string, x: any) => setV((o) => ({ ...o, [k]: x }));
  if (!open) return <button className={danger ? "btn-sm-danger" : "btn-sm-ghost"} disabled={disabled} onClick={() => setOpen(true)}>{label}</button>;
  return (
    <div className="grid w-full gap-2 rounded-lg border border-line bg-[#FAF9FE] p-3">
      <b className="text-sm text-ink">{label}</b>{confirm && <p className="text-sm">{confirm}</p>}
      {fields?.(v, set)}
      <label className="grid gap-1 text-sm font-semibold text-ink">{reasonLabel}<textarea className="input-sm min-h-[60px] py-2" value={v.reason} onChange={(e) => set("reason", e.target.value)} /></label>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex gap-2"><button className={danger ? "btn-sm-danger" : "btn-sm"} disabled={busy || v.reason.trim().length < 3} onClick={async () => { setBusy(true); setErr(""); try { await run(v); setOpen(false); setV({ reason: "" }); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }}>{busy ? "Working" : "Confirm"}</button>
        <button className="btn-sm-ghost" onClick={() => { setOpen(false); setErr(""); }}>Cancel</button></div>
    </div>);
}
export function Empty({ children }: { children: React.ReactNode }) { return <p className="py-6 text-center text-sm text-muted">{children}</p>; }
export const CARE: Record<string, string> = { day: "Day", night: "Night", live: "Live in" };
