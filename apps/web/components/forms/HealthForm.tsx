"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "../api";

type Med = { name: string; dose: string; times: string; givenBy: "self" | "family" | "caregiver" };
type All = { name: string; reaction?: string; severity?: "mild" | "moderate" | "severe" };

export function HealthForm({ id }: { id: string }) {
  const isNew = useSearchParams().get("new") === "1";
  const [nka, setNka] = useState<boolean | null>(null);
  const [allergies, setAllergies] = useState<All[]>([]); const [meds, setMeds] = useState<Med[]>([]); const [conditions, setConditions] = useState("");
  const [doctor, setDoctor] = useState({ name: "", speciality: "", phone: "", clinic: "" }); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/api/recipients/${id}/health`).then((h) => { if (!h) return; setNka(h.noKnownAllergies); setAllergies(h.allergies); setMeds(h.medicines); setConditions(h.conditions.join("\n")); if (h.doctors[0]) setDoctor({ ...doctor, ...h.doctors[0] }); }).catch(() => {}); }, [id]);
  async function save(e: React.FormEvent) { e.preventDefault(); setBusy(true); setMsg("");
    try { await api(`/api/recipients/${id}/health`, { method: "PUT", body: { noKnownAllergies: nka, allergies: allergies.filter((a) => a.name), medicines: meds.filter((m) => m.name), conditions: conditions.split("\n").map((s) => s.trim()).filter(Boolean), doctors: doctor.name ? [doctor] : [] } }); setMsg("Saved. Encrypted and visible only to people you allow."); }
    catch (x: any) { setMsg(x.message); } finally { setBusy(false); } }
  return (
    <div>
      <Link href="/app" className="text-sm font-semibold text-indigo-600">← My Uday</Link>
      {isNew && <div className="mt-4 rounded-2xl bg-teal-50 p-4 text-teal-600"><b>Profile saved.</b> You can book a caregiver now. Health details below are optional.</div>}
      <div className="eyebrow mt-6">Optional</div><h1 className="mt-1 text-3xl font-extrabold">Health details</h1>
      <p className="mt-2 max-w-2xl">Help caregivers care safely. Everything here is encrypted with its own key, and a caregiver sees only what you allowed, only while booked. Skip anything you prefer not to share.</p>
      <form onSubmit={save} className="card mt-6 grid gap-6">
        <fieldset className="grid gap-2"><legend className="mb-1 font-bold text-ink">Allergies</legend>
          <div className="flex flex-wrap gap-2">{[[true, "No known allergies"], [false, "Has allergies"], [null, "Prefer not to say now"]].map(([v, t]) => (
            <button key={String(t)} type="button" aria-pressed={nka === v} onClick={() => { setNka(v as boolean | null); if (v === false && !allergies.length) setAllergies([{ name: "" }]); }} className={`min-h-[48px] rounded-xl border px-4 text-sm font-semibold ${nka === v ? "border-orange-400 bg-orange-50" : "border-line"}`}>{t as string}</button>))}</div>
          {nka === false && allergies.map((a, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input className="input" placeholder="Allergy, for example penicillin" value={a.name} onChange={(e) => setAllergies(allergies.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /><input className="input" placeholder="Reaction" value={a.reaction ?? ""} onChange={(e) => setAllergies(allergies.map((x, j) => j === i ? { ...x, reaction: e.target.value } : x))} />
            <select className="input" value={a.severity ?? ""} onChange={(e) => setAllergies(allergies.map((x, j) => j === i ? { ...x, severity: (e.target.value || undefined) as All["severity"] } : x))}><option value="">Severity</option><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option></select></div>)}
          {nka === false && <button type="button" className="justify-self-start text-sm font-semibold text-indigo-600" onClick={() => setAllergies([...allergies, { name: "" }])}>+ Add allergy</button>}</fieldset>
        <fieldset className="grid gap-2"><legend className="mb-1 font-bold text-ink">Medicines</legend>
          {meds.map((m, i) => <div key={i} className="grid gap-2 sm:grid-cols-4"><input className="input" placeholder="Medicine" value={m.name} onChange={(e) => setMeds(meds.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /><input className="input" placeholder="Dose" value={m.dose} onChange={(e) => setMeds(meds.map((x, j) => j === i ? { ...x, dose: e.target.value } : x))} />
            <input className="input" placeholder="Times, for example 8 AM, 8 PM" value={m.times} onChange={(e) => setMeds(meds.map((x, j) => j === i ? { ...x, times: e.target.value } : x))} />
            <select className="input" value={m.givenBy} onChange={(e) => setMeds(meds.map((x, j) => j === i ? { ...x, givenBy: e.target.value as Med["givenBy"] } : x))}><option value="self">Takes it themselves</option><option value="family">Family gives it</option><option value="caregiver">Caregiver gives it</option></select></div>)}
          <button type="button" className="justify-self-start text-sm font-semibold text-indigo-600" onClick={() => setMeds([...meds, { name: "", dose: "", times: "", givenBy: "self" }])}>+ Add medicine</button></fieldset>
        <div className="field"><label htmlFor="cn">Conditions (one per line)</label><textarea id="cn" className="input min-h-[90px] py-3" value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="As told by the family or doctor" /></div>
        <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-1 font-bold text-ink">Family doctor</legend>
          <input className="input" placeholder="Name" value={doctor.name} onChange={(e) => setDoctor({ ...doctor, name: e.target.value })} /><input className="input" placeholder="Speciality" value={doctor.speciality} onChange={(e) => setDoctor({ ...doctor, speciality: e.target.value })} />
          <input className="input" placeholder="Phone" value={doctor.phone} onChange={(e) => setDoctor({ ...doctor, phone: e.target.value })} /><input className="input" placeholder="Clinic" value={doctor.clinic} onChange={(e) => setDoctor({ ...doctor, clinic: e.target.value })} /></fieldset>
        <p className="note">Prescription and report uploads arrive with secure document storage (see the deployment guide).</p>
        {msg && <p role="status" className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-ink">{msg}</p>}
        <div className="flex flex-wrap gap-3"><button className="btn" disabled={busy}>Save health details</button><Link href="/hire" className="btn-ghost">Skip and hire a caregiver</Link></div>
      </form>
    </div>
  );
}
