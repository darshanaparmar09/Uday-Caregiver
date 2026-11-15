"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../api";

export function SignIn() {
  const router = useRouter(); const next = useSearchParams().get("next") || "/app";
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState(""); const [code, setCode] = useState(""); const [name, setName] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [dev, setDev] = useState<string | undefined>();
  async function send(e: React.FormEvent) { e.preventDefault(); setErr(""); setBusy(true);
    try { const r = await api<{ devCode?: string }>("/api/auth/request", { body: { phone } }); setDev(r.devCode); setStep("code"); } catch (x: any) { setErr(x.message); } finally { setBusy(false); } }
  async function verify(e: React.FormEvent) { e.preventDefault(); setErr(""); setBusy(true);
    try { const r = await api<{ user: { role: string } }>("/api/auth/verify", { body: { phone, code, name: name || undefined, client: "web" } });
      router.push(r.user.role === "ops" ? "/ops" : next); router.refresh(); } catch (x: any) { setErr(x.message); setBusy(false); } }
  return (
    <div>
      <div className="eyebrow">Customer account</div>
      <h1 className="mt-2 text-3xl font-extrabold">Sign in or register</h1>
      <p className="mt-2">One account for your parents' care, payments, check ins and shift logs.</p>
      {step === "phone" ? (
        <form onSubmit={send} className="mt-6 grid gap-4">
          <div className="field"><label htmlFor="ph">Mobile number</label><input id="ph" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="98xxxxxxxx or +1 415 555 0100" required /></div>
          <p className="note">Outside India? Include your country code. We send a one time code by SMS.</p>
          <button className="btn" disabled={busy}>{busy ? "Sending" : "Send code"}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-6 grid gap-4">
          <div className="field"><label htmlFor="cd">6 digit code sent to {phone}</label><input id="cd" className="input tracking-[.4em]" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required /></div>
          {dev && <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-ink">Development mode: your code is <b>{dev}</b>.</p>}
          <div className="field"><label htmlFor="nm">Your name (first time only)</label><input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
          <button className="btn" disabled={busy}>{busy ? "Checking" : "Continue"}</button>
          <button type="button" className="text-sm font-semibold text-indigo-600" onClick={() => setStep("phone")}>Use a different number</button>
        </form>
      )}
      {err && <p role="alert" className="mt-4 rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-600">{err}</p>}
      <p className="note mt-6">By continuing you agree to the terms and privacy policy.</p>
    </div>
  );
}
