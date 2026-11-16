"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PLUS } from "@uday/core";
import { api, inr } from "../api";

const ROLE: Record<string, string> = { owner: "Owner", care_manager: "Care manager", payer: "Payer", viewer: "Can view", local_contact: "Local contact" };
const ROLE_HELP: Record<string, string> = { care_manager: "Books care, edits health details, gets all alerts", payer: "Pays for bookings and gets invoices", viewer: "Sees check ins and care logs", local_contact: "Nearby person called first in an emergency" };
const Msg = ({ ok, err }: { ok: string; err: string }) => <>{ok && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-600">{ok}</p>}{err && <p role="alert" className="rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-600">{err}</p>}</>;
const toBase64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });

/** Family members and invitations, by role. */
export function FamilyMembers({ id }: { id: string }) {
  const [d, setD] = useState<any>(null); const [phone, setPhone] = useState(""); const [name, setName] = useState(""); const [role, setRole] = useState("care_manager"); const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  const load = () => api(`/api/recipients/${id}/members`).then(setD).catch((e) => setErr(e.message)); useEffect(() => { load(); }, [id]);
  async function go(body: any, done: string) { setOk(""); setErr(""); try { await api(`/api/recipients/${id}/members`, { body }); setOk(done); setPhone(""); setName(""); load(); } catch (e: any) { setErr(e.message); } }
  if (!d) return <p>{err || "Loading"}</p>;
  const manage = ["owner", "care_manager"].includes(d.myRole); const roles = d.myRole === "owner" ? ["care_manager", "payer", "viewer", "local_contact"] : ["viewer", "local_contact"];
  return (
    <div className="grid gap-5">
      <Link href="/app" className="text-sm font-semibold text-indigo-600">← My Uday</Link>
      <div><h1 className="text-3xl font-extrabold">Family</h1><p className="mt-1">Everyone who helps care. Each person signs in with their own mobile number.</p></div>
      <Msg ok={ok} err={err} />
      <div className="card"><h2 className="text-lg font-bold">Members</h2>{d.members.map((m: any) => <div key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm">
        <span><b className="text-ink">{m.name ?? "Family member"}{m.me ? " (you)" : ""}</b> · {ROLE[m.role]} · number ending {m.phone_last4}</span>
        {d.myRole === "owner" && m.role !== "owner" && <button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => go({ action: "remove", userId: m.user_id }, "Removed")}>Remove</button>}</div>)}
        {!!d.invites.length && <><h3 className="mt-4 font-bold">Waiting to join</h3>{d.invites.map((i: any) => <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm">
          <span>{i.name ?? "Invited"} · {ROLE[i.role]} · number ending {i.phone_last4}</span><button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => go({ action: "cancel", inviteId: i.id }, "Invite cancelled")}>Cancel</button></div>)}</>}</div>
      {manage && <div className="card grid gap-3"><h2 className="text-lg font-bold">Invite someone</h2>
        <div className="grid gap-3 sm:grid-cols-2"><input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} /><input className="input" inputMode="tel" placeholder="Mobile, with country code if abroad" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="grid gap-2">{roles.map((r) => <label key={r} className={`flex min-h-[48px] cursor-pointer items-start gap-3 rounded-xl border px-4 py-2 ${role === r ? "border-orange-400 bg-orange-50" : "border-line"}`}><input type="radio" className="mt-1" checked={role === r} onChange={() => setRole(r)} /><span><b className="text-ink">{ROLE[r]}</b><span className="block text-sm text-muted">{ROLE_HELP[r]}</span></span></label>)}</div>
        <button className="btn justify-self-start" disabled={!phone} onClick={() => go({ action: "invite", phone, role, name: name || undefined }, "Invitation sent by SMS. They join when they sign in with that number.")}>Send invitation</button></div>}
    </div>);
}

/** Check in through the app, or by an automatic phone call for seniors without a smartphone. */
export function CheckinMode({ id }: { id: string }) {
  const [mode, setMode] = useState("app"); const [phone, setPhone] = useState(""); const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  async function save() { setOk(""); setErr(""); try { await api(`/api/recipients/${id}/checkin-mode`, { body: { mode, phone: phone || undefined } }); setOk(mode === "call" ? "Saved. Uday will call this number at the check in time each day." : "Saved. Check in through the Uday app."); } catch (e: any) { setErr(e.message); } }
  return (
    <div className="card grid gap-3"><h2 className="text-lg font-bold">How your parent checks in</h2>
      {[["app", "Uday app", "Tap the sunrise each morning on a smartphone."], ["call", "Daily phone call", "For a basic phone or landline. Uday calls at the check in time: press 1 if well, 2 for help."]].map(([v, t, d]) =>
        <label key={v} className={`flex min-h-[48px] cursor-pointer items-start gap-3 rounded-xl border px-4 py-2 ${mode === v ? "border-orange-400 bg-orange-50" : "border-line"}`}><input type="radio" className="mt-1" checked={mode === v} onChange={() => setMode(v)} /><span><b className="text-ink">{t}</b><span className="block text-sm text-muted">{d}</span></span></label>)}
      {mode === "call" && <input className="input" inputMode="tel" placeholder="Number to call, for example 020 2553 1234" value={phone} onChange={(e) => setPhone(e.target.value)} />}
      <Msg ok={ok} err={err} /><button className="btn justify-self-start" onClick={save}>Save</button>
      <p className="note">Phone calls need the calling provider to be connected before launch.</p></div>);
}

/** Prescriptions and reports, stored encrypted. */
export function Documents({ id }: { id: string }) {
  const [list, setList] = useState<any[]>([]); const [kind, setKind] = useState("prescription"); const [title, setTitle] = useState(""); const [date, setDate] = useState(""); const [file, setFile] = useState<File | null>(null);
  const [ok, setOk] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => api<any[]>(`/api/recipients/${id}/documents`).then(setList).catch(() => {}); useEffect(() => { load(); }, [id]);
  async function upload() { if (!file) return; setBusy(true); setOk(""); setErr("");
    try { await api(`/api/recipients/${id}/documents`, { body: { kind, title: title || file.name, docDate: date || undefined, base64: await toBase64(file), mime: file.type } }); setOk("Uploaded and stored encrypted."); setTitle(""); setFile(null); load(); } catch (e: any) { setErr(e.message); } setBusy(false); }
  return (
    <section className="card grid gap-3"><h2 className="text-xl font-bold">Prescriptions and reports</h2><p className="note">Photos or PDFs up to 5 MB. Stored encrypted. Only the owner and care manager can open them.</p>
      {list.map((d) => <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm">
        <span><b className="text-ink">{d.title}</b> · {d.kind}{d.doc_date ? ` · ${String(d.doc_date).slice(0, 10)}` : ""}</span>
        <span className="flex gap-2"><a className="btn-ghost min-h-[40px] px-3 text-sm" href={`/api/recipients/${id}/documents/${d.id}`} target="_blank" rel="noreferrer">Open</a>
          <button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => api(`/api/recipients/${id}/documents/${d.id}`, { method: "DELETE" }).then(load)}>Delete</button></span></div>)}
      <div className="grid gap-3 sm:grid-cols-3"><select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{[["prescription", "Prescription"], ["report", "Lab report"], ["discharge", "Discharge summary"], ["scan", "Scan or X ray"], ["other", "Other"]].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} /><input className="input" type="date" aria-label="Date on the document" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <Msg ok={ok} err={err} /><button className="btn justify-self-start" disabled={!file || busy} onClick={upload}>{busy ? "Uploading" : "Upload"}</button></section>);
}

/** Account: optional ID check and Uday Plus. */
export function Account() {
  const [me, setMe] = useState<any>(null); const [plus, setPlus] = useState<any>(null); const [aadhaar, setAadhaar] = useState(""); const [consent, setConsent] = useState(false); const [otp, setOtp] = useState(""); const [needOtp, setNeedOtp] = useState(false); const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  const load = () => { api("/api/me").then(setMe).catch(() => {}); api("/api/plus").then(setPlus).catch(() => {}); }; useEffect(load, []);
  async function go(p: Promise<any>, done: string) { setOk(""); setErr(""); try { await p; setOk(done); load(); } catch (e: any) { setErr(e.message); } }
  if (!me) return <p>Loading</p>;
  return (
    <div className="grid gap-6">
      <Link href="/app" className="text-sm font-semibold text-indigo-600">← My Uday</Link>
      <h1 className="text-3xl font-extrabold">My account</h1><Msg ok={ok} err={err} />
      <div className="card"><h2 className="text-lg font-bold">{me.user.name}</h2><p className="text-sm text-muted">{me.user.city}{me.user.country ? `, ${me.user.country}` : ""} · {me.user.email ?? "no email for invoices yet"}</p></div>
      <div className="card grid gap-3"><h2 className="text-lg font-bold">ID check (optional)</h2>
        {me.user.kyc_status === "clear" ? <p className="font-semibold text-teal-600">✓ Verified with Aadhaar ending {me.user.aadhaar_last4}. Caregivers see "Family ID verified" on your requests.</p> : <>
          <p className="text-sm">Optional. Caregivers feel safer accepting requests from verified families. Your Aadhaar number goes to our licensed KYC partner; Uday keeps only the result and the last four digits.</p>
          <input className="input" inputMode="numeric" placeholder="12 digit Aadhaar number" value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} maxLength={14} />
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I agree to Uday checking my identity through its KYC partner for this purpose only.</label>
          {me.user.kyc_status === "pending" && !needOtp ? <p className="text-sm font-semibold text-amber-700">Submitted. The Uday team will confirm your ID within two working days.</p> : null}
          {needOtp ? <><p className="text-sm">A code was sent to the mobile number linked to your Aadhaar.</p>
            <input className="input" inputMode="numeric" placeholder="6 digit code" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} />
            <button className="btn justify-self-start" disabled={otp.length !== 6} onClick={() => go(api("/api/profile/kyc", { body: { otp } }).then(() => setNeedOtp(false)), "ID check complete.")}>Confirm code</button></>
          : <button className="btn justify-self-start" disabled={!consent || aadhaar.replace(/\D/g, "").length !== 12} onClick={() => go(api("/api/profile/kyc", { body: { aadhaar, consent } }).then((r: any) => setNeedOtp(!!r.needsOtp)), "Started.")}>Verify</button>}</>}</div>
      {plus && <div className={`card grid gap-3 ${plus.member ? "border-teal-500" : ""}`}><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-bold">{PLUS.name}</h2><b className="font-display text-2xl text-ink">{inr(PLUS.pricePaise)}<span className="text-sm font-normal text-muted"> a month</span></b></div>
        <ul className="list-disc pl-5 text-sm">{PLUS.benefits.map((b) => <li key={b}>{b}</li>)}</ul>
        {plus.member ? <><p className="font-semibold text-teal-600">✓ You are a member{plus.membership?.current_period_end ? `, renews ${new Date(plus.membership.current_period_end).toLocaleDateString("en-IN")}` : ""}.</p>
          {plus.membership?.status === "active" && <button className="btn-ghost justify-self-start" onClick={() => go(api("/api/plus", { body: { action: "leave" } }), "Cancelled. Benefits continue until the end of the month.")}>Cancel membership</button>}</>
          : <button className="btn justify-self-start" onClick={() => go(api("/api/plus", { body: { action: "join" } }), "Welcome to Uday Plus.")}>Join Uday Plus</button>}
        <p className="note">Price and benefits are pilot assumptions.</p></div>}
      <PartnerServices />
    </div>);
}

/** Invitations waiting for this family member. */
export function InviteBanner() {
  const [list, setList] = useState<any[]>([]);
  const load = () => api<any[]>("/api/invites").then(setList).catch(() => {}); useEffect(() => { load(); }, []);
  if (!list.length) return null;
  return <>{list.map((i) => <div key={i.id} className="card flex flex-wrap items-center justify-between gap-3 border-orange-400 bg-orange-50">
    <span>{i.inviter ?? "A family member"} invited you to help care for <b className="text-ink">{i.senior}</b> ({i.locality}) as {ROLE[i.role].toLowerCase()}.</span>
    <span className="flex gap-2"><button className="btn" onClick={() => api(`/api/invites/${i.id}`, { body: { accept: true } }).then(() => location.reload())}>Join</button><button className="btn-ghost" onClick={() => api(`/api/invites/${i.id}`, { body: { accept: false } }).then(load)}>Decline</button></span></div>)}</>;
}

/** Partner services for families: doctor on call, health insurance, the Uday tablet. */
export function PartnerServices() {
  const [list, setList] = useState<any[]>([]); const [consent, setConsent] = useState<Record<string, boolean>>({}); const [done, setDone] = useState<Record<string, string>>({}); const [err, setErr] = useState("");
  useEffect(() => { api("/api/leads").then(setList).catch(() => {}); }, []);
  const KIND: [string, string, string][] = [["telehealth", "Doctor on call", "A doctor calls your parent back, usually the same day."], ["insurance", "Health insurance for seniors", "An adviser explains senior health cover and helps you apply."], ["tablet", "Uday tablet at home", "An always on screen for check ins, video calls with family and reminders."]];
  async function ask(kind: string) { setErr(""); try { const r = await api("/api/leads", { body: { kind, consent: !!consent[kind] } }); setDone({ ...done, [kind]: r.partner ? `Request sent. ${consent[kind] ? r.partner + " will call you." : "The Uday team will call you."}` : "Request sent. The Uday team will call you." }); } catch (e: any) { setErr(e.message); } }
  return (
    <div className="card grid gap-4"><h2 className="text-lg font-bold">More help from Uday partners</h2>{err && <p className="text-sm text-red-700">{err}</p>}
      {KIND.map(([k, t, d]) => { const ps = list.filter((p) => p.kind === k); return (
        <div key={k} className="grid gap-2 border-t border-line pt-3"><h3 className="font-bold">{t}</h3><p className="text-sm text-muted">{d}</p>
          {ps.map((p) => <p key={p.id} className="text-sm"><b className="text-ink">{p.name}</b>{p.offer ? ` · ${p.offer}` : ""}{p.price_note ? ` · ${p.price_note}` : ""}{p.website ? <> · <a className="font-semibold text-indigo-600" href={p.website} target="_blank" rel="noreferrer">website</a></> : null}</p>)}
          {done[k] ? <p className="text-sm font-semibold text-teal-700">{done[k]}</p> : <>
            {ps.length > 0 && <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={!!consent[k]} onChange={(e) => setConsent({ ...consent, [k]: e.target.checked })} />Uday may share my name and phone number with this partner so they can call me.</label>}
            <button className="btn-ghost justify-self-start" onClick={() => ask(k)}>Request a call</button></>}
        </div>); })}
      <p className="note">Partners are independent businesses. Uday does not sell insurance or give medical advice.</p>
    </div>);
}
