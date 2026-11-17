"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FACILITY_TYPES, FACILITY_PLANS, FACILITY_REVIEW_AREAS } from "@uday/core";
import { api, inr } from "../api";

const DIETS = ["Vegetarian", "Non vegetarian", "Jain", "Diabetic", "Soft food"];
const blank = { name: "", types: [] as string[], locality: "", city: "Pune", address: "", description: "", licenceNo: "", beds: "", staffRatio: "", memoryStaffRatio: "", doctorVisits: "",
  monthlyFrom: "", monthlyTo: "", entryFee: "", refundPolicy: "", extraCosts: "", dementiaUnit: false, petsAllowed: false, diets: [] as string[], activities: "", contactPhone: "" };

/** Facility self onboarding: profile, monthly plan, visit requests and reviews. */
export function PartnerPortal() {
  const [me, setMe] = useState<any>(undefined); const [d, setD] = useState<any>(null); const [f, setF] = useState<any>(blank);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => api("/api/partner/facility").then((x: any) => { setD(x); const v = x.facility; if (v) setF({ ...blank, name: v.name, types: v.types, locality: v.locality, city: v.city, address: v.address ?? "", description: v.description ?? "",
    licenceNo: v.licence_no ?? "", beds: v.beds ?? "", staffRatio: v.staff_ratio ?? "", memoryStaffRatio: v.memory_staff_ratio ?? "", doctorVisits: v.doctor_visits ?? "",
    monthlyFrom: v.monthly_from_paise ? v.monthly_from_paise / 100 : "", monthlyTo: v.monthly_to_paise ? v.monthly_to_paise / 100 : "", entryFee: v.entry_fee_paise ? v.entry_fee_paise / 100 : "",
    refundPolicy: v.refund_policy ?? "", extraCosts: v.extra_costs ?? "", dementiaUnit: v.dementia_unit, petsAllowed: v.pets_allowed, diets: v.diets ?? [], activities: (v.activities ?? []).join(", "), contactPhone: v.contact_phone ?? "" }); }).catch((e) => setErr(e.message));
  useEffect(() => { api("/api/me").then((m: any) => { setMe(m); if (["facility", "family"].includes(m?.user?.role)) load(); }).catch(() => setMe(null)); }, []);
  async function go(p: () => Promise<any>, ok: string) { setBusy(true); setErr(""); setMsg(""); try { await p(); setMsg(ok); await load(); } catch (e: any) { setErr(e.message); } setBusy(false); }

  if (me === undefined) return <p>Loading</p>;
  if (!me) return (<div className="card text-center"><h1 className="text-3xl font-extrabold">List your care facility on Uday</h1>
    <p className="mx-auto mt-3 max-w-xl">Families across India use Uday to compare facilities, book visits and read reviews from other families. Create your profile, choose a monthly plan, and start receiving visit requests.</p>
    <div className="mx-auto mt-6 grid max-w-2xl gap-4 sm:grid-cols-2 text-left">{Object.entries(FACILITY_PLANS).map(([k, p]) => <div key={k} className="card"><h3 className="font-bold">{p.name}</h3><p className="font-display text-2xl font-extrabold text-ink">{inr(p.pricePaise)}<span className="text-sm font-normal text-muted"> a month + GST</span></p><ul className="mt-2 list-disc pl-5 text-sm">{p.features.map((x) => <li key={x}>{x}</li>)}</ul></div>)}</div>
    <Link href="/signin?next=/partner" className="btn mt-6">Sign in with your facility's phone number</Link><p className="note mt-3">Use a number that is not your family account.</p></div>);
  if (!["facility", "family"].includes(me.user.role)) return <p>This account cannot list a facility.</p>;

  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const num = (v: any) => (v === "" || v == null ? undefined : Number(v));
  const save = () => go(() => api("/api/partner/facility", { method: "PUT", body: { name: f.name, types: f.types, locality: f.locality, city: f.city, address: f.address || undefined, description: f.description || undefined, licenceNo: f.licenceNo || undefined,
    beds: num(f.beds), staffRatio: f.staffRatio || undefined, memoryStaffRatio: f.memoryStaffRatio || undefined, doctorVisits: f.doctorVisits || undefined, monthlyFrom: num(f.monthlyFrom), monthlyTo: num(f.monthlyTo), entryFee: num(f.entryFee),
    refundPolicy: f.refundPolicy || undefined, extraCosts: f.extraCosts || undefined, dementiaUnit: f.dementiaUnit, petsAllowed: f.petsAllowed, diets: f.diets, activities: f.activities.split(",").map((s: string) => s.trim()).filter(Boolean), contactPhone: f.contactPhone || undefined } }), "Profile saved");
  const fac = d?.facility; const sub = d?.subscription;
  const status = fac ? ({ draft: "Draft. Choose a plan to send it for review.", review: "With Uday for review. We check your licence, then it goes live.", live: "Live. Families can find you.", suspended: "Paused by Uday. Contact us." } as any)[fac.status] : "Not created yet";
  // Plain function, not a component, so inputs keep focus while typing.
  const field = ({ k, label, type = "text", ph }: { k: string; label: string; type?: string; ph?: string }) => <label key={k} className="grid gap-1 text-sm font-semibold text-ink">{label}<input className="input font-normal" type={type} placeholder={ph} value={f[k]} onChange={(e) => set(k, e.target.value)} /></label>;

  return (
    <div className="grid gap-6">
      <div className="card"><h1 className="text-3xl font-extrabold">{fac?.name ?? "Your facility"}</h1><p className="mt-1"><b className="text-ink">Status:</b> {status}</p>
        {sub && <p className="mt-1 text-sm">Plan: {(FACILITY_PLANS as any)[sub.plan].name}, {inr(sub.amount_paise)} a month · {sub.status === "active" ? `renews ${new Date(sub.current_period_end).toLocaleDateString("en-IN")}` : sub.status}</p>}</div>
      {msg && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-600">{msg}</p>}
      {err && <p role="alert" className="rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-600">{err}</p>}

      <div className="card grid gap-4"><h2 className="text-xl font-bold">Profile</h2>
        <div className="grid gap-3 sm:grid-cols-2">{field({ k: "name", label: "Facility name" })}{field({ k: "licenceNo", label: "Licence or registration number" })}</div>
        <fieldset><legend className="mb-2 text-sm font-semibold text-ink">Type of care</legend><div className="flex flex-wrap gap-2">{Object.entries(FACILITY_TYPES).map(([k, v]) => <button key={k} type="button" aria-pressed={f.types.includes(k)} onClick={() => set("types", f.types.includes(k) ? f.types.filter((x: string) => x !== k) : [...f.types, k])}
          className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold ${f.types.includes(k) ? "border-orange-400 bg-orange-50" : "border-line"}`}>{v}</button>)}</div></fieldset>
        <div className="grid gap-3 sm:grid-cols-3">{field({ k: "locality", label: "Area", ph: "Baner" })}{field({ k: "city", label: "City" })}{field({ k: "beds", label: "Beds", type: "number" })}</div>
        {field({ k: "address", label: "Address" })}
        <label className="grid gap-1 text-sm font-semibold text-ink">About your facility<textarea className="input min-h-[90px] py-3 font-normal" value={f.description} onChange={(e) => set("description", e.target.value)} /></label>
        <div className="grid gap-3 sm:grid-cols-3">{field({ k: "staffRatio", label: "Caregivers to residents", ph: "1 to 8" })}{field({ k: "memoryStaffRatio", label: "Memory care ratio", ph: "1 to 5" })}{field({ k: "doctorVisits", label: "Doctor visits", ph: "Twice a week" })}</div>
        <div className="grid gap-3 sm:grid-cols-3">{field({ k: "monthlyFrom", label: "Monthly from (₹)", type: "number" })}{field({ k: "monthlyTo", label: "Monthly to (₹)", type: "number" })}{field({ k: "entryFee", label: "One time fee (₹)", type: "number" })}</div>
        <div className="grid gap-3 sm:grid-cols-2">{field({ k: "refundPolicy", label: "What is refunded if a resident leaves" })}{field({ k: "extraCosts", label: "Extra costs (medicines, therapy)" })}</div>
        <div className="flex flex-wrap gap-4"><label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={f.dementiaUnit} onChange={(e) => set("dementiaUnit", e.target.checked)} /> Dementia unit</label>
          <label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={f.petsAllowed} onChange={(e) => set("petsAllowed", e.target.checked)} /> Pets allowed</label></div>
        <fieldset><legend className="mb-2 text-sm font-semibold text-ink">Diets offered</legend><div className="flex flex-wrap gap-2">{DIETS.map((x) => <button key={x} type="button" aria-pressed={f.diets.includes(x)} onClick={() => set("diets", f.diets.includes(x) ? f.diets.filter((y: string) => y !== x) : [...f.diets, x])}
          className={`min-h-[40px] rounded-full border px-3 text-sm ${f.diets.includes(x) ? "border-orange-400 bg-orange-50" : "border-line"}`}>{x}</button>)}</div></fieldset>
        <div className="grid gap-3 sm:grid-cols-2">{field({ k: "activities", label: "Activities (comma separated)", ph: "Yoga, Bhajans, Garden walks" })}{field({ k: "contactPhone", label: "Phone for Uday (not shown to families)" })}</div>
        <button className="btn justify-self-start" disabled={busy || !f.name || !f.types.length || !f.locality} onClick={save}>Save profile</button>
      </div>

      {fac && <div className="card grid gap-3"><h2 className="text-xl font-bold">Monthly plan</h2><p className="note">Billed monthly, renews automatically. Cancel any time; your listing stays until the paid month ends.</p>
        <div className="grid gap-4 sm:grid-cols-2">{Object.entries(FACILITY_PLANS).map(([k, p]) => { const on = sub?.status === "active" && sub.plan === k; return (
          <div key={k} className={`card ${on ? "border-teal-500" : ""}`}><h3 className="font-bold">{p.name}</h3><p className="font-display text-2xl font-extrabold text-ink">{inr(p.pricePaise)}<span className="text-sm font-normal text-muted"> a month + GST</span></p>
            <ul className="mt-2 list-disc pl-5 text-sm">{p.features.map((x) => <li key={x}>{x}</li>)}</ul>
            {on ? <p className="mt-3 font-semibold text-teal-600">✓ Your plan</p> : <button className="btn mt-3" disabled={busy} onClick={() => go(() => api("/api/partner/facility/subscribe", { body: { plan: k } }), `${p.name} plan started`)}>Choose {p.name}</button>}</div>); })}</div>
        {sub?.status === "active" && <button className="btn-ghost justify-self-start" disabled={busy} onClick={() => go(() => api("/api/partner/facility/cancel", { body: {} }), "Plan cancelled. Listing stays until the paid month ends.")}>Cancel plan</button>}
      </div>}

      {fac && <div className="card"><h2 className="text-xl font-bold">Visit requests ({d.visits.length})</h2>
        {!d.visits.length ? <p className="mt-2 text-muted">No requests yet.</p> : d.visits.map((v: any) => <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 text-sm">
          <span><b className="text-ink">{v.family_name ?? "Family"}</b> · {v.preferred_date} · {v.status}{v.note ? ` · "${v.note}"` : ""}</span>
          <span className="flex gap-2">{v.status === "requested" && <button className="btn min-h-[40px] px-3 text-sm" onClick={() => go(() => api(`/api/partner/visits/${v.id}`, { body: { status: "confirmed" } }), "Visit confirmed")}>Confirm</button>}
            {v.status === "confirmed" && <button className="btn min-h-[40px] px-3 text-sm" onClick={() => go(() => api(`/api/partner/visits/${v.id}`, { body: { status: "completed" } }), "Marked as visited. The family can now review you.")}>Mark visited</button>}
            {["requested", "confirmed"].includes(v.status) && <button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => go(() => api(`/api/partner/visits/${v.id}`, { body: { status: "cancelled" } }), "Visit cancelled")}>Cancel</button>}</span></div>)}</div>}

      {fac && <div className="card"><h2 className="text-xl font-bold">Reviews ({d.reviews.length})</h2>
        {!d.reviews.length ? <p className="mt-2 text-muted">Reviews appear after families visit.</p> : d.reviews.map((r: any, i: number) => <div key={i} className="border-t border-line py-3 text-sm"><b className="text-ink">★ {r.overall}</b> · {FACILITY_REVIEW_AREAS.map(([k, l]) => `${l} ${r.areas[k]}`).join(" · ")}{r.text && <p className="mt-1">{r.text}</p>}</div>)}</div>}
    </div>
  );
}
