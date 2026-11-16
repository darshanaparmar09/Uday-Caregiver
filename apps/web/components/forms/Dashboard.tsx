"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, inr, TYPE, DUR, STATUS } from "../api";

export function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null); const [recips, setRecips] = useState<any[] | null>(null); const [bookings, setBookings] = useState<any[]>([]);
  const [tab, setTab] = useState<"live" | "past">("live"); const [busy, setBusy] = useState("");
  async function load() { const [m, r, b] = await Promise.all([api("/api/me"), api<any[]>("/api/recipients"), api<any[]>("/api/bookings")]); setMe(m); setRecips(r); setBookings(b); }
  useEffect(() => { load().catch(() => router.push("/signin")); const t = setInterval(() => load().catch(() => {}), 10000); return () => clearInterval(t); }, []);
  async function checkFor(id: string) { setBusy(id); try { await api("/api/checkins", { body: { status: "ok", recipientId: id } }); await load(); } finally { setBusy(""); } }
  async function logout() { await api("/api/auth/logout", { body: {} }); router.push("/"); router.refresh(); }
  if (!recips) return <p>Loading</p>;
  const PAST = ["closed", "cancelled", "released"];
  const shown = bookings.filter((b) => (tab === "past") === PAST.includes(b.status));
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="eyebrow">My Uday</div><h1 className="mt-1 text-3xl font-extrabold">Namaste{me?.user?.name ? `, ${me.user.name.split(" ")[0]}` : ""}</h1></div>
        <div className="flex gap-2"><Link href="/hire" className="btn">Hire a caregiver</Link><button onClick={logout} className="btn-ghost">Sign out</button></div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-bold">Your parents</h2><Link href="/app/onboarding" className="text-sm font-semibold text-indigo-600">+ Add a person</Link></div>
        {!recips.length ? (
          <div className="card text-center"><h3 className="text-lg font-bold">Start with your parent's profile</h3><p className="mx-auto mt-2 max-w-md">Address, languages, care needs and two emergency contacts. It takes about five minutes, and health details are optional.</p><Link href="/app/onboarding" className="btn mt-4">Set up care</Link></div>
        ) : <div className="grid gap-3 sm:grid-cols-2">{recips.map((r) => {
          const today = r.last_checkin && new Date(r.last_checkin.at).toDateString() === new Date().toDateString();
          return (<div key={r.id} className="card">
            <div className="flex items-center justify-between gap-2"><h3 className="text-lg font-bold">{r.name}</h3><span className="text-sm text-muted">{r.locality}</span></div>
            <div className={`mt-3 rounded-xl px-3 py-2 text-sm ${today ? (r.last_checkin.status === "help" ? "bg-coral-50 text-coral-600" : "bg-teal-50 text-teal-600") : "bg-orange-50 text-orange-600"}`}>
              {today ? (r.last_checkin.status === "help" ? "Asked for help today at " : "Checked in today at ") + new Date(r.last_checkin.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : `No check in yet today (expected by ${String(r.checkin_by).slice(0, 5)})`}</div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
              {!r.has_health && <Link className="text-indigo-600" href={`/app/health/${r.id}`}>Add health details (optional)</Link>}
              {r.has_health && <Link className="text-indigo-600" href={`/app/health/${r.id}`}>Health details</Link>}
              <Link className="text-indigo-600" href={`/app/readings/${r.id}`}>Readings and devices</Link>
              {!today && <button className="text-indigo-600" disabled={busy === r.id} onClick={() => checkFor(r.id)}>I spoke to them today</button>}
            </div></div>); })}</div>}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-bold">Bookings</h2>
          <div role="tablist" className="flex rounded-xl bg-indigo-50 p-1 text-sm">{(["live", "past"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-[40px] rounded-lg px-4 font-semibold ${tab === t ? "bg-white text-ink shadow-card" : "text-muted"}`}>{t === "live" ? "Active" : "Past"}</button>)}</div></div>
        {!shown.length ? <div className="card text-muted">{tab === "live" ? "No active bookings." : "No past bookings yet."}</div> :
          <div className="grid gap-3">{shown.map((b) => { const s = STATUS[b.status]; return (
            <Link key={b.id} href={`/app/bookings/${b.id}`} className="card flex flex-wrap items-center justify-between gap-3 transition hover:border-indigo-500">
              <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-indigo-900 font-display text-sm font-bold text-orange-400">{b.initials}</span>
                <div><div className="font-semibold text-ink">{b.caregiver_name} <span className="font-normal text-muted">for {b.recipient_name}</span></div><div className="text-sm text-muted">{TYPE[b.care_type]} · {DUR[b.days]}{b.days > 1 ? ` · day ${Math.min(b.days_done + 1, b.days)} of ${b.days}` : ""} · from {b.start_date}</div></div></div>
              <div className="flex items-center gap-3"><span className="text-sm font-semibold text-ink">{inr(b.total_paise)}</span><span className={s[0]}>{s[1]}</span></div>
            </Link>); })}</div>}
      </section>
    </div>
  );
}
