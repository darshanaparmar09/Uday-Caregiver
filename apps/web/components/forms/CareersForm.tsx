"use client";
import { useState } from "react";
import { api } from "../api";
export function CareersForm() {
  const [done, setDone] = useState(false); const [err, setErr] = useState("");
  if (done) return <p className="text-lg"><b className="text-ink">Thank you.</b> Our recruiter will call you within a week.</p>;
  return (
    <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); setErr(""); const f = new FormData(e.currentTarget);
      try { await api("/api/applications", { body: { name: f.get("name"), phone: f.get("phone"), area: f.get("area"), experience: f.get("experience") } }); setDone(true); } catch (x: any) { setErr(x.message); } }}>
      <div className="field"><label htmlFor="cn">Full name</label><input id="cn" name="name" className="input" required autoComplete="name" /></div>
      <div className="field"><label htmlFor="cp">Mobile number</label><input id="cp" name="phone" className="input" required inputMode="tel" autoComplete="tel" /></div>
      <div className="field"><label htmlFor="ca">Area in Pune</label><input id="ca" name="area" className="input" required /></div>
      <div className="field"><label htmlFor="ce">Experience</label><select id="ce" name="experience" className="input"><option>New to care work</option><option>Attendant, 1 to 3 years</option><option>Attendant, 3 years or more</option><option>Registered nurse</option></select></div>
      {err && <p role="alert" className="text-sm text-coral-600">{err}</p>}<button className="btn">Apply</button>
    </form>
  );
}
