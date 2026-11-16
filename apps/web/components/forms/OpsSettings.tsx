"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";

const TABS = [["business", "Business and GST"], ["Messages", "SMS and WhatsApp"], ["Calls", "Calls"], ["Payments", "Payments"], ["Identity", "Aadhaar check"], ["Video", "Video"], ["AI", "AI companion"], ["partners", "Partners"]] as const;
const STATUS: Record<string, [string, string]> = { connected: ["bg-teal-50 text-teal-700 border-teal-300", "Connected"], error: ["bg-red-50 text-red-700 border-red-300", "Problem"], not_connected: ["bg-slate-50 text-slate-600 border-slate-300", "Not connected"] };

/** Operations, Settings: connect outside services, set business details for invoices, upload partners. */
export function OpsSettings() {
  const [tab, setTab] = useState<string>("business"); const [d, setD] = useState<any>(null); const [err, setErr] = useState("");
  const load = () => api("/api/ops/settings").then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); try { const t = location.hash.slice(1); if (t) setTab(decodeURIComponent(t)); } catch {} }, []);
  const pick = (t: string) => { setTab(t); try { history.replaceState(null, "", "#" + encodeURIComponent(t)); } catch {} };
  if (err) return <p className="text-red-700">{err}</p>;
  if (!d) return <p>Loading</p>;
  const groups = d.integrations.filter((x: any) => x.group === tab);
  const dot = (g: string) => { const xs = d.integrations.filter((x: any) => x.group === g && x.key !== "routing"); return xs.some((x: any) => x.status === "connected") ? "bg-teal-500" : xs.some((x: any) => x.status === "error") ? "bg-red-500" : "bg-slate-300"; };
  return (
    <div className="grid gap-6">
      <div><h1 className="text-3xl font-extrabold">Settings</h1><p className="text-muted">Connect the services Uday uses. Keys are stored encrypted and never shown again in full. Every change is recorded.</p></div>
      <nav className="flex flex-wrap gap-2" aria-label="Settings sections">{TABS.map(([k, l]) => (
        <button key={k} onClick={() => pick(k)} aria-current={tab === k} className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-sm font-semibold ${tab === k ? "border-indigo-600 bg-indigo-600 text-white" : "border-line bg-white"}`}>
          {k !== "business" && k !== "partners" && <span className={`h-2.5 w-2.5 rounded-full ${dot(k)}`} aria-hidden />}{l}</button>))}</nav>
      {tab === "business" && <Business b={d.business} onSaved={load} />}
      {tab === "partners" && <Partners />}
      {groups.map((s: any) => <Connection key={s.key} s={s} onSaved={load} />)}
      {tab === "Payments" && <p className="note">After connecting Razorpay, set the webhook in the Razorpay dashboard to <code>/api/payments/webhook</code> on your domain with the events payment.authorized, payment.captured and payment.failed, using the same webhook secret. Auto pay follows Razorpay's recurring payments API; confirm mandate limits and the ₹1 authorisation with Razorpay before going live.</p>}
      {tab === "Identity" && <p className="note">Manual mode works today: people submit their Aadhaar number, and the Uday team marks the check clear after seeing the original. API mode needs a partner such as Digio, IDfy or Signzy; match the paths to their documentation, then run one real check.</p>}
    </div>);
}

function Connection({ s, onSaved }: { s: any; onSaved: () => void }) {
  const [v, setV] = useState<Record<string, string>>(s.values); const [on, setOn] = useState<boolean>(s.enabled); const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(""); const [msg, setMsg] = useState<[boolean, string] | null>(null);
  useEffect(() => { setV(s.values); setOn(s.enabled); }, [s]);
  async function save() { setBusy("save"); setMsg(null); try { await api(`/api/ops/settings/integrations/${s.key}`, { method: "PUT", body: { enabled: on, values: v } }); setMsg([true, on ? "Saved and switched on. Now test it." : "Saved. Switch it on when ready."]); onSaved(); } catch (e: any) { setMsg([false, e.message]); } finally { setBusy(""); } }
  async function test() { setBusy("test"); setMsg(null); try { const r = await api(`/api/ops/settings/integrations/${s.key}/test`, { body: { phone: phone || undefined } }); setMsg([r.ok, r.detail]); onSaved(); } catch (e: any) { setMsg([false, e.message]); } finally { setBusy(""); } }
  const [cls, label] = STATUS[s.status] ?? STATUS.not_connected; const canTest = !["routing"].includes(s.key);
  return (
    <section className="card grid gap-4" aria-labelledby={`h-${s.key}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h2 id={`h-${s.key}`} className="text-lg font-bold">{s.name}</h2><p className="text-sm text-muted">{s.what}</p>
          {s.signup && <a href={s.signup} target="_blank" rel="noreferrer" className="text-sm font-semibold text-indigo-600">Open {new URL(s.signup).hostname.replace("www.", "")} ↗</a>}</div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${cls}`}>{label}{s.fromEnv ? " (from server settings)" : ""}</span></div>
      <div className="grid gap-3 sm:grid-cols-2">{s.fields.map((f: any) => (
        <div key={f.k} className="field min-w-0"><label htmlFor={`${s.key}-${f.k}`}>{f.label}{f.required ? " *" : ""}</label>
          {f.options ? <select id={`${s.key}-${f.k}`} className="input" value={v[f.k] ?? ""} onChange={(e) => setV({ ...v, [f.k]: e.target.value })}><option value="">Choose</option>{f.options.map((o: string) => <option key={o} value={o}>{o}</option>)}</select>
            : f.k === "contentSids" ? <textarea id={`${s.key}-${f.k}`} className="input min-h-[80px] py-2 font-mono text-xs" value={v[f.k] ?? ""} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} />
            : <input id={`${s.key}-${f.k}`} className="input font-mono text-sm" type={f.secret ? "password" : "text"} autoComplete="off" spellCheck={false} placeholder={f.secret && v[f.k] ? "Saved. Type to replace" : ""}
                value={f.secret && v[f.k]?.startsWith("••••") ? "" : v[f.k] ?? ""} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} />}
          {f.secret && v[f.k]?.startsWith("••••") && <p className="note">Saved key ending {v[f.k].slice(-4)}. Leave empty to keep it.</p>}
          {f.help && <p className="note">{f.help}</p>}</div>))}</div>
      <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" className="h-5 w-5" checked={on} onChange={(e) => setOn(e.target.checked)} />Switch on (use this service)</label>
      <div className="flex flex-wrap items-end gap-3">
        <button className="btn" disabled={!!busy} onClick={save}>{busy === "save" ? "Saving" : "Save"}</button>
        {canTest && <><div className="field"><label htmlFor={`${s.key}-ph`}>Your phone for a test (optional)</label><input id={`${s.key}-ph`} className="input" inputMode="tel" placeholder="98220 00000" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <button className="btn-ghost" disabled={!!busy} onClick={test}>{busy === "test" ? "Testing" : "Test connection"}</button></>}</div>
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg[0] ? "bg-teal-50 text-teal-800" : "bg-red-50 text-red-800"}`}>{msg[1]}</p>}
      {!msg && s.lastError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Last test: {s.lastError}</p>}
      {s.lastTestAt && <p className="note">Last tested {new Date(s.lastTestAt).toLocaleString("en-IN")}</p>}
    </section>);
}

function Business({ b, onSaved }: { b: any; onSaved: () => void }) {
  const [f, setF] = useState<any>(b); const [msg, setMsg] = useState<[boolean, string] | null>(null); const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  async function save() { setBusy(true); setMsg(null); try { const r = await api("/api/ops/settings/business", { method: "PUT", body: { ...f, gstRatePct: Number(f.gstRatePct), gstin: f.gstin.toUpperCase().replace(/\s/g, ""), invoicePrefix: f.invoicePrefix.toUpperCase() } }); setF(r); setMsg([true, "Saved. New invoices use these details."]); onSaved(); } catch (e: any) { setMsg([false, e.message]); } finally { setBusy(false); } }
  const fld = (k: string, label: string, help?: string, props: any = {}) => <div className="field min-w-0"><label htmlFor={`b-${k}`}>{label}</label><input id={`b-${k}`} className="input" value={f[k] ?? ""} onChange={set(k)} {...props} />{help && <p className="note">{help}</p>}</div>;
  return (
    <section className="card grid gap-4">
      <div><h2 className="text-lg font-bold">Business details</h2><p className="text-sm text-muted">Printed on every invoice. The GSTIN is checked for format and its check character; the PAN is read from it.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fld("brandName", "Business name (brand)", "What families see, for example Uday")}
        {fld("legalName", "Legal name", "As registered, for example Uday Care Services Private Limited")}
        {fld("gstin", "GSTIN", f.pan ? `PAN from GSTIN: ${f.pan}` : "15 characters. Leave empty until registered; invoices show DRAFT", { maxLength: 15, className: "input font-mono uppercase" })}
        <div className="field"><label htmlFor="b-state">State of registration</label><select id="b-state" className="input" value={f.stateCode} onChange={set("stateCode")}>{Object.entries(b.states).map(([c, n]: any) => <option key={c} value={c}>{n} ({c})</option>)}</select></div>
        <div className="sm:col-span-2">{fld("address", "Registered address")}</div>
        {fld("city", "City")}{fld("pincode", "PIN code", "", { inputMode: "numeric", maxLength: 6 })}
        {fld("sacCode", "SAC code for the platform fee", "998599 is a placeholder. Your CA confirms the right code")}
        {fld("gstRatePct", "GST rate on the platform fee (%)", "18 is an assumption. Changes apply to new bookings", { type: "number", min: 0, max: 28, step: 0.5 })}
        {fld("invoicePrefix", "Invoice number prefix", "Letters and numbers, for example INV", { maxLength: 8 })}
        {fld("supportPhone", "Support phone on invoices")}{fld("supportEmail", "Support email on invoices", "", { type: "email" })}
      </div>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5" checked={!!f.caReviewed} onChange={set("caReviewed")} />A chartered accountant has reviewed the invoice format, SAC code and tax split. Until this is ticked, invoices are marked DRAFT.</label>
      <div className="flex flex-wrap gap-3"><button className="btn" disabled={busy} onClick={save}>{busy ? "Saving" : "Save business details"}</button></div>
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg[0] ? "bg-teal-50 text-teal-800" : "bg-red-50 text-red-800"}`}>{msg[1]}</p>}
    </section>);
}

function Partners() {
  const [d, setD] = useState<any>(null); const [res, setRes] = useState<any>(null); const [msg, setMsg] = useState<[boolean, string] | null>(null); const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null); const [fname, setFname] = useState("");
  const load = () => api("/api/ops/partners").then(setD).catch(() => {}); useEffect(() => { load(); }, []);
  async function upload(dry: boolean) {
    const f = file.current?.files?.[0]; if (!f) { setMsg([false, "Choose the Excel file first"]); return; }
    setBusy(true); setMsg(null); const fd = new FormData(); fd.append("file", f);
    try { const r = await fetch(`/api/ops/partners/import${dry ? "?dryRun=1" : ""}`, { method: "POST", body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setRes(j); setMsg([true, dry ? `Checked: ${j.added} new, ${j.updated} to update${j.problems.length ? `, ${j.problems.length} rows need fixing` : ""}. Nothing saved yet.` : `Imported: ${j.added} added, ${j.updated} updated.`]); if (!dry) load(); }
    catch (e: any) { setMsg([false, e.message]); } finally { setBusy(false); } }
  async function lead(id: string, body: any, done: string) { try { await api(`/api/ops/leads/${id}`, { body }); setMsg([true, done]); load(); } catch (e: any) { setMsg([false, e.message]); } }
  if (!d) return <p>Loading</p>;
  return (<>
    <section className="card grid gap-4">
      <div><h2 className="text-lg font-bold">Upload partners from Excel</h2><p className="text-sm text-muted">Telehealth doctors, insurers and tablet suppliers. Download the template, fill one row per partner, then check and import. Rows with the same type and name update the existing partner.</p></div>
      <div className="flex flex-wrap items-center gap-3">
        <a className="btn-ghost" href="/api/ops/partners/template">Download template (.xlsx)</a>
        <label className="btn-ghost cursor-pointer"><input ref={file} type="file" accept=".xlsx" className="sr-only" onChange={(e) => { setFname(e.target.files?.[0]?.name ?? ""); setRes(null); setMsg(null); }} />Choose file</label>
        {fname && <span className="text-sm">{fname}</span>}
        <button className="btn-ghost" disabled={busy || !fname} onClick={() => upload(true)}>Check file</button>
        <button className="btn" disabled={busy || !fname || !res?.dryRun} onClick={() => upload(false)}>Import</button></div>
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg[0] ? "bg-teal-50 text-teal-800" : "bg-red-50 text-red-800"}`}>{msg[1]}</p>}
      {res?.problems?.length > 0 && <ul className="list-disc pl-5 text-sm text-red-800">{res.problems.map((p: string) => <li key={p}>{p}</li>)}</ul>}
      {res?.preview?.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-muted"><th className="py-1 pr-3">Row</th><th className="pr-3">Type</th><th className="pr-3">Name</th><th className="pr-3">City</th><th className="pr-3">Offer</th><th>Active</th></tr></thead>
        <tbody>{res.preview.map((r: any) => <tr key={r.row} className="border-t border-line"><td className="py-1 pr-3">{r.row}</td><td className="pr-3">{r.kind}</td><td className="pr-3 font-semibold">{r.name}</td><td className="pr-3">{r.city}</td><td className="pr-3">{r.offer}</td><td>{r.active ? "yes" : "no"}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="card grid gap-3"><h2 className="text-lg font-bold">Partners ({d.partners.length})</h2>
      {!d.partners.length && <p className="text-sm text-muted">None yet. Upload the sheet above.</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><tbody>{d.partners.map((p: any) => (
        <tr key={p.id} className="border-t border-line align-top"><td className="py-2 pr-3"><span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-bold">{p.kind}</span></td>
          <td className="pr-3"><b>{p.name}</b><div className="text-muted">{p.offer}</div></td><td className="pr-3">{p.city}<div className="text-muted">{p.contact_name}</div></td>
          <td className="pr-3">{p.leads} leads{p.share_leads ? "" : <div className="text-muted">leads not sent</div>}</td>
          <td><button className="btn-ghost min-h-[36px] px-3 text-xs" onClick={() => api(`/api/ops/partners/${p.id}`, { method: "PATCH", body: { active: !p.active } }).then(load)}>{p.active ? "Hide" : "Show"}</button></td></tr>))}</tbody></table></div>
    </section>
    <section className="card grid gap-2"><h2 className="text-lg font-bold">Open leads ({d.leads.length})</h2>
      {d.leads.map((l: any) => (
        <div key={l.id} className="grid gap-2 border-t border-line py-2 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-w-0"><b>{l.kind}</b> · {l.name ?? "Family"}{l.locality ? `, ${l.locality}` : ""}{l.note ? ` · "${l.note}"` : ""}
            <div className="text-muted">{l.consent_share ? "Agreed to share details with a partner" : "Did not agree to sharing: call them yourself"}{l.sent_at ? ` · sent ${new Date(l.sent_at).toLocaleDateString("en-IN")}` : ""}</div></div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Partner" className="input min-h-[40px] py-1 text-sm" value={l.partner_id ?? ""} onChange={(e) => lead(l.id, { action: "assign", partnerId: e.target.value || null }, "Partner assigned")}>
              <option value="">No partner</option>{d.partners.filter((p: any) => p.kind === l.kind && p.active).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <button className="btn-ghost min-h-[40px] px-3 text-sm" disabled={!l.partner_id || !l.consent_share} onClick={() => lead(l.id, { action: "send" }, "Sent to partner by SMS")}>Send to partner</button>
            <button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => lead(l.id, { action: "close" }, "Lead closed")}>Done</button></div></div>))}
    </section></>);
}
