"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../api";

const NEEDS = [["bathing", "Bathing"], ["toileting", "Toileting"], ["dressing", "Dressing"], ["eating", "Eating"], ["walking", "Walking"], ["transfers", "Getting in and out of bed"], ["memory", "Memory support"], ["night", "Night supervision"], ["falls", "Has fallen in the last year"]] as const;
const STEPS = ["About you", "Your parent", "Home", "Emergency", "Consent"];
type EC = { name: string; relation: string; phone: string; city: string; isLocal: boolean };

export function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [me, setMe] = useState({ name: "", email: "", country: "India", city: "", timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Asia/Kolkata", language: "en" });
  const [p, setP] = useState({ name: "", dob: "", gender: "", languages: "Marathi, Hindi", hasPhone: true, phone: "", hospital: "", diet: "", caregiverGender: "No preference" });
  const [home, setHome] = useState({ address: "", locality: "", accessNotes: "" });
  const [needs, setNeeds] = useState<Record<string, boolean>>({});
  const [ec, setEc] = useState<EC[]>([{ name: "", relation: "", phone: "", city: "", isLocal: true }, { name: "", relation: "", phone: "", city: "", isLocal: false }]);
  const [consent, setConsent] = useState({ onBehalf: true, allergies: true, medicines: true, conditions: false, agree: false });
  useEffect(() => { api("/api/me").then((m) => setMe((s) => ({ ...s, name: m.user.name ?? "", email: m.user.email ?? "", country: m.user.country ?? s.country, city: m.user.city ?? "" }))).catch(() => {}); }, []);

  async function next(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (step === 0) { setBusy(true); try { await api("/api/profile", { method: "PUT", body: me }); setStep(1); } catch (x: any) { setErr(x.message); } finally { setBusy(false); } return; }
    if (step < 4) { setStep(step + 1); return; }
    if (!consent.agree) { setErr("Please confirm consent to continue."); return; }
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/recipients", { body: {
        name: p.name, dob: p.dob || undefined, gender: p.gender || undefined, languages: p.languages.split(",").map((s) => s.trim()).filter(Boolean),
        hasPhone: p.hasPhone, phone: p.hasPhone ? p.phone : undefined, address: home.address, locality: home.locality, accessNotes: home.accessNotes || undefined,
        hospital: p.hospital, careNeeds: needs, preferences: { diet: p.diet, caregiverGender: p.caregiverGender },
        emergencyContacts: ec, consent: { onBehalf: consent.onBehalf, shareWithCaregiver: { allergies: consent.allergies, medicines: consent.medicines, conditions: consent.conditions } } } });
      router.push(`/app/health/${r.id}?new=1`);
    } catch (x: any) { setErr(x.message + (x.fields ? " (" + Object.keys(x.fields).join(", ") + ")" : "")); setBusy(false); }
  }
  const F = (id: string, label: string, el: React.ReactNode, hint?: string) => <div className="field"><label htmlFor={id}>{label}</label>{el}{hint && <span className="note">{hint}</span>}</div>;

  return (
    <div>
      <div className="eyebrow">Set up care · step {step + 1} of 5</div>
      <h1 className="mt-1 text-3xl font-extrabold">{STEPS[step]}</h1>
      <ol className="mt-4 flex gap-1.5" aria-hidden>{STEPS.map((s, i) => <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-orange-400" : "bg-line"}`} />)}</ol>
      <form onSubmit={next} className="card mt-6 grid gap-4">
        {step === 0 && <>
          {F("n", "Your name", <input id="n" className="input" required value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} autoComplete="name" />)}
          {F("em", "Email (for invoices)", <input id="em" type="email" className="input" value={me.email} onChange={(e) => setMe({ ...me, email: e.target.value })} autoComplete="email" />)}
          <div className="grid gap-4 sm:grid-cols-2">
            {F("co", "Country you live in", <input id="co" className="input" required value={me.country} onChange={(e) => setMe({ ...me, country: e.target.value })} autoComplete="country-name" />)}
            {F("ci", "City", <input id="ci" className="input" required value={me.city} onChange={(e) => setMe({ ...me, city: e.target.value })} autoComplete="address-level2" />)}</div>
          {F("tz", "Time zone", <input id="tz" className="input" value={me.timezone} onChange={(e) => setMe({ ...me, timezone: e.target.value })} />, "Alerts reach you at sensible hours here. Safety alerts always come through.")}
          {F("lg", "Language", <select id="lg" className="input" value={me.language} onChange={(e) => setMe({ ...me, language: e.target.value })}><option value="en">English</option><option value="hi">Hindi</option><option value="mr">Marathi</option></select>)}
        </>}
        {step === 1 && <>
          {F("pn", "Their name", <input id="pn" className="input" required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />)}
          <div className="grid gap-4 sm:grid-cols-2">
            {F("db", "Date of birth (optional)", <input id="db" type="date" className="input" value={p.dob} onChange={(e) => setP({ ...p, dob: e.target.value })} />)}
            {F("gd", "Gender (optional)", <select id="gd" className="input" value={p.gender} onChange={(e) => setP({ ...p, gender: e.target.value })}><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option></select>)}</div>
          {F("ln", "Languages they speak", <input id="ln" className="input" value={p.languages} onChange={(e) => setP({ ...p, languages: e.target.value })} />, "Separate with commas.")}
          <label className="flex min-h-[48px] items-center gap-3"><input type="checkbox" checked={p.hasPhone} onChange={(e) => setP({ ...p, hasPhone: e.target.checked })} className="h-5 w-5" /> They have their own mobile phone</label>
          {p.hasPhone && F("pp", "Their mobile number", <input id="pp" className="input" inputMode="tel" required value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} />, "They sign in to the Uday app with this number for the daily check in.")}
          <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-semibold text-ink">Help they need day to day</legend>
            <div className="grid gap-2 sm:grid-cols-2">{NEEDS.map(([k, t]) => <label key={k} className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-3 ${needs[k] ? "border-orange-400 bg-orange-50" : "border-line"}`}><input type="checkbox" checked={!!needs[k]} onChange={(e) => setNeeds({ ...needs, [k]: e.target.checked })} />{t}</label>)}</div></fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            {F("dt", "Diet (optional)", <input id="dt" className="input" placeholder="For example vegetarian, Jain" value={p.diet} onChange={(e) => setP({ ...p, diet: e.target.value })} />)}
            {F("cg", "Caregiver preference", <select id="cg" className="input" value={p.caregiverGender} onChange={(e) => setP({ ...p, caregiverGender: e.target.value })}><option>No preference</option><option>Female caregiver</option><option>Male caregiver</option></select>)}</div>
        </>}
        {step === 2 && <>
          {F("ad", "Full home address", <textarea id="ad" className="input min-h-[90px] py-3" required value={home.address} onChange={(e) => setHome({ ...home, address: e.target.value })} autoComplete="street-address" />, "The caregiver sees this only after accepting your request.")}
          {F("lc", "Locality", <input id="lc" className="input" required placeholder="For example Kothrud" value={home.locality} onChange={(e) => setHome({ ...home, locality: e.target.value })} />, "Shown to caregivers before they accept.")}
          {F("ac", "Getting in (optional)", <textarea id="ac" className="input min-h-[80px] py-3" placeholder="Gate, floor, lift, society entry" value={home.accessNotes} onChange={(e) => setHome({ ...home, accessNotes: e.target.value })} />, "Encrypted. Released to the caregiver only when they start travelling.")}
          {F("hs", "Preferred hospital", <input id="hs" className="input" required value={p.hospital} onChange={(e) => setP({ ...p, hospital: e.target.value })} />)}
        </>}
        {step === 3 && <>
          <p>At least two contacts. One should live near your parent and be able to reach the home within about an hour.</p>
          {ec.map((c, i) => (
            <fieldset key={i} className="grid gap-3 rounded-2xl border border-line p-4"><legend className="px-1 text-sm font-semibold text-ink">Contact {i + 1}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {F(`e${i}n`, "Name", <input id={`e${i}n`} className="input" required value={c.name} onChange={(e) => setEc(ec.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />)}
                {F(`e${i}r`, "Relation", <input id={`e${i}r`} className="input" required value={c.relation} onChange={(e) => setEc(ec.map((x, j) => j === i ? { ...x, relation: e.target.value } : x))} />)}
                {F(`e${i}p`, "Phone", <input id={`e${i}p`} className="input" inputMode="tel" required value={c.phone} onChange={(e) => setEc(ec.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))} />)}
                {F(`e${i}c`, "City", <input id={`e${i}c`} className="input" required value={c.city} onChange={(e) => setEc(ec.map((x, j) => j === i ? { ...x, city: e.target.value } : x))} />)}</div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.isLocal} onChange={(e) => setEc(ec.map((x, j) => j === i ? { ...x, isLocal: e.target.checked } : x))} /> Can reach the home quickly</label>
            </fieldset>))}
          <button type="button" className="btn-ghost" onClick={() => setEc([...ec, { name: "", relation: "", phone: "", city: "", isLocal: false }])}>Add another contact</button>
        </>}
        {step === 4 && <>
          <p>Health details are optional. If you add them later, choose what an accepted caregiver may see during the booking.</p>
          {([["allergies", "Allergies"], ["medicines", "Medicines and timings"], ["conditions", "Conditions"]] as const).map(([k, t]) => (
            <label key={k} className="flex min-h-[48px] items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={consent[k]} onChange={(e) => setConsent({ ...consent, [k]: e.target.checked })} />Share {t.toLowerCase()} with the booked caregiver</label>))}
          <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-semibold text-ink">Who is giving consent</legend>
            <label className="flex min-h-[44px] items-center gap-3"><input type="radio" checked={!consent.onBehalf} onChange={() => setConsent({ ...consent, onBehalf: false })} />My parent has agreed to this themselves</label>
            <label className="flex min-h-[44px] items-center gap-3"><input type="radio" checked={consent.onBehalf} onChange={() => setConsent({ ...consent, onBehalf: true })} />I am giving consent on their behalf as an authorised family member</label></fieldset>
          <label className="flex items-start gap-3 rounded-xl bg-indigo-50 p-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5" checked={consent.agree} onChange={(e) => setConsent({ ...consent, agree: e.target.checked })} />I agree to the terms and privacy policy, and to Uday storing this information encrypted in India to arrange care.</label>
        </>}
        {err && <p role="alert" className="rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-600">{err}</p>}
        <div className="flex gap-3 pt-2">{step > 0 && <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}<button className="btn flex-1" disabled={busy}>{step === 4 ? (busy ? "Saving" : "Save and continue") : "Continue"}</button></div>
      </form>
    </div>
  );
}
