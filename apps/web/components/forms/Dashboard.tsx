"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, inr, TYPE, DUR, STATUS } from "../api";
import { InviteBanner } from "./FamilyTools";
import { AlertBanner } from "./AlertBanner";
import { CareToday } from "./CareToday";

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
        <div className="flex gap-2"><Link href="/hire" className="btn">Hire a caregiver</Link><Link href="/app/account" className="btn-ghost">My account</Link><button onClick={logout} className="btn-ghost">Sign out</button></div>
      </div>

      <AlertBanner />
      <CareToday />
      <InviteBanner />
      <Intros />
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-bold">Your parents</h2><Link href="/app/onboarding" className="text-sm font-semibold text-indigo-600">+ Add a person</Link></div>
        {!recips.length ? (
          <div className="card text-center"><h3 className="text-lg font-bold">Start with your parent's profile</h3><p className="mx-auto mt-2 max-w-md">Address, languages, care needs and two emergency contacts. It takes about five minutes, and health details are optional.</p><Link href="/app/onboarding" className="btn mt-4">Set up care</Link></div>
        ) : <div className="grid gap-3 sm:grid-cols-2">{recips.map((r) => {
          const today = r.last_checkin && new Date(r.last_checkin.at).toDateString() === new Date().toDateString();
          return (<div key={r.id} className="card">
            <div className="flex items-center justify-between gap-2"><h3 className="text-lg font-bold">{r.name}</h3><span className="text-sm text-muted">{r.locality}</span></div>
            <div className={`mt-3 rounded-xl px-3 py-2 text-sm ${today ? (["help", "medical"].includes(r.last_checkin.status) ? "bg-coral-50 text-coral-600" : r.last_checkin.status === "lonely" ? "bg-orange-50 text-orange-600" : "bg-teal-50 text-teal-600") : "bg-orange-50 text-orange-600"}`}>
              {today ? `"${MOOD[r.last_checkin.status] ?? "Checked in"}" today at ` + new Date(r.last_checkin.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : `No check in yet today (expected by ${String(r.checkin_by).slice(0, 5)})`}</div>
            <Week id={r.id} />
            <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
              {!r.has_health && <Link className="text-indigo-600" href={`/app/health/${r.id}`}>Add health details (optional)</Link>}
              {r.has_health && <Link className="text-indigo-600" href={`/app/health/${r.id}`}>Health details</Link>}
              <Link className="text-indigo-600" href={`/app/health/${r.id}#appointments`}>Appointments</Link>
              <Link className="text-indigo-600" href={`/app/readings/${r.id}`}>Readings and devices</Link>
              <Link className="text-indigo-600" href={`/app/family/${r.id}`}>Family and check in</Link>
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

const MOOD: Record<string, string> = { ok: "I am okay", help: "I need some help", medical: "I need medical help", lonely: "I feel lonely" };
const DOT: Record<string, string> = { ok: "bg-teal-500", help: "bg-orange-500", medical: "bg-coral-500", lonely: "bg-orange-300" };
/** Last seven days of check ins, medicines today, brain games and groups. */
function Week({ id }: { id: string }) {
  const [w, setW] = useState<any>(null);
  useEffect(() => { api(`/api/recipients/${id}/week`).then(setW).catch(() => {}); }, [id]);
  if (!w) return null;
  return (<div className="mt-3">
    <div className="flex justify-between" aria-label="Check ins in the last seven days">{w.week.map((d: any) => <div key={d.day} className="grid justify-items-center gap-1 text-xs text-muted">
      <span title={d.status ? MOOD[d.status] : "No check in"} className={`h-6 w-6 rounded-full border-2 border-indigo-950 ${d.status ? DOT[d.status] : "bg-white"}`} />
      {new Date(d.day + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" })}</div>)}</div>
    <p className="mt-2 text-sm">{w.streak} day streak{w.meds.total ? ` · medicines ${w.meds.taken} of ${w.meds.total} today` : ""} · brain games {w.gameDays} of 7 days{w.groups ? ` · ${w.groups} group${w.groups > 1 ? "s" : ""}` : ""}</p></div>);
}

/** Intro calls the family asked for before hiring. */
function Intros() {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { api<any[]>("/api/intros").then((l) => setList(l.filter((x) => ["requested", "confirmed"].includes(x.status)))).catch(() => {}); }, []);
  if (!list.length) return null;
  return (<section className="card"><h2 className="text-lg font-bold">Intro calls</h2>{list.map((i) => <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm">
    <span><b className="text-ink">{i.display_name}</b> · {i.status === "confirmed" ? new Date(i.chosen).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "waiting for her to pick a time"}</span>
    {i.status === "confirmed" && (i.room_url ? <a className="btn min-h-[40px] px-4 text-sm" href={i.room_url} target="_blank" rel="noreferrer">Join video call</a> : <span className="text-muted">Uday will call you both at this time</span>)}</div>)}</section>);
}
