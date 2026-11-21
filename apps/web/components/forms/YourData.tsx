"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../api";

/**
 * "Your data" on My account: download everything Uday holds, choose what caregivers may see, sign out of every
 * device, and delete the account. Each action states exactly what it does; nothing is called done until the server says so.
 */
export function YourData() {
  const router = useRouter();
  const [recips, setRecips] = useState<any[]>([]); const [consent, setConsent] = useState<Record<string, any>>({});
  const [del, setDel] = useState<{ canDelete: boolean; blockers: string[] } | null>(null); const [open, setOpen] = useState(false); const [text, setText] = useState("");
  const [ok, setOk] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState("");
  useEffect(() => { api<any[]>("/api/recipients").then(async (r) => { setRecips(r); const c: Record<string, any> = {};
    for (const x of r) c[x.id] = await api(`/api/recipients/${x.id}/consent`).catch(() => null); setConsent(c); }).catch(() => {}); }, []);
  useEffect(() => { if (open) api<any>("/api/me/delete").then(setDel).catch((e) => setErr(e.message)); }, [open]);
  async function run(key: string, f: () => Promise<any>, done: string) { setBusy(key); setOk(""); setErr(""); try { await f(); setOk(done); } catch (e: any) { setErr(e.message); } finally { setBusy(""); } }
  async function download() {
    const data = await api("/api/me/export");
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `uday-my-data-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
  }
  async function share(id: string, key: string, v: boolean) {
    const cur = consent[id]?.shareWithCaregiver ?? {}; const next = { ...cur, [key]: v };
    const r = await api(`/api/recipients/${id}/consent`, { method: "PUT", body: { shareWithCaregiver: next } }); setConsent((c) => ({ ...c, [id]: r }));
  }
  return (
    <div className="card grid gap-4"><h2 className="text-lg font-bold">Your data</h2>
      {ok && <p className="font-semibold text-teal-600">{ok}</p>}{err && <p className="font-semibold text-coral-600">{err}</p>}
      <div className="grid gap-2"><h3 className="font-semibold">Download my data</h3><p className="text-sm">Your account, parents you manage, bookings, invoices, messages and check ins, as one file.</p>
        <button className="btn-ghost justify-self-start" disabled={busy === "dl"} onClick={() => run("dl", download, "Downloaded.")}>Download</button></div>
      {recips.filter((r) => consent[r.id]).map((r) => (
        <div key={r.id} className="grid gap-2 border-t border-line pt-3"><h3 className="font-semibold">What caregivers may see about {r.name}</h3>
          <p className="text-sm">Only during a booked shift. Changes apply at once. Every view is logged.</p>
          {([["allergies", "Allergies"], ["medicines", "Medicines"], ["conditions", "Health conditions"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={!!consent[r.id]?.shareWithCaregiver?.[k]}
              onChange={(e) => run("c" + r.id, () => share(r.id, k, e.target.checked), "Saved.")} />{l}</label>))}
        </div>))}
      {recips.map((r) => <AiHelp key={"ai" + r.id} rid={r.id} name={r.name} />)}
      <div className="grid gap-2 border-t border-line pt-3"><h3 className="font-semibold">Sign out everywhere</h3><p className="text-sm">Ends every session on every phone and browser, including this one.</p>
        <button className="btn-ghost justify-self-start" disabled={busy === "so"} onClick={() => run("so", async () => { await api("/api/me/sessions", { method: "DELETE" }); router.push("/signin"); }, "Signed out everywhere.")}>Sign out everywhere</button></div>
      <div className="grid gap-2 border-t border-line pt-3"><h3 className="font-semibold">Delete my account</h3>
        {!open ? <button className="btn-ghost justify-self-start" onClick={() => setOpen(true)}>Delete my account</button> : <>
          <p className="text-sm">This erases your name, phone number, health details, documents, messages and posts. It cannot be undone.</p>
          <p className="text-sm text-muted">Kept without your name, because the law requires it: payment records and tax invoices.</p>
          {del && !del.canDelete ? del.blockers.map((b) => <p key={b} className="text-sm font-semibold text-coral-600">{b}</p>) : <>
            <input className="input" placeholder="Type DELETE to confirm" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn justify-self-start bg-coral-600" disabled={text.trim().toUpperCase() !== "DELETE" || busy === "del"}
              onClick={() => run("del", async () => { await api("/api/me/delete", { body: { confirm: "DELETE" } }); router.push("/delete-account?done=1"); }, "Account deleted.")}>Delete my account for good</button></>}
          <button className="btn-ghost justify-self-start" onClick={() => { setOpen(false); setText(""); }}>Keep my account</button></>}
      </div>
    </div>);
}

/** AI help for one parent: off by default. With it on, Claude writes daily updates, checks notes and reads documents. */
function AiHelp({ rid, name }: { rid: string; name: string }) {
  const [a, setA] = useState<any>(null); const [err, setErr] = useState("");
  useEffect(() => { api(`/api/recipients/${rid}/ai-help`).then(setA).catch(() => {}); }, [rid]);
  if (!a) return null;
  return (<div className="grid gap-2 border-t border-line pt-3"><h3 className="font-semibold">AI help for {name}: {a.on ? "on" : "off"}</h3>
    {a.about.map((t: string) => <p key={t} className="text-sm">{t}</p>)}
    {!a.connected && <p className="note">AI is not connected for Uday yet, so fixed rules and templates are used either way.</p>}
    {err && <p className="text-sm font-semibold text-coral-600">{err}</p>}
    <button className="btn-ghost justify-self-start" onClick={() => api(`/api/recipients/${rid}/ai-help`, { method: "PUT", body: { on: !a.on } }).then((r: any) => setA({ ...a, on: r.on })).catch((e) => setErr(e.message))}>{a.on ? "Turn AI help off" : "Turn AI help on"}</button>
  </div>);
}
