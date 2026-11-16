"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../api";

type Ctx = { role: string; perms: string[]; can: (p: string) => boolean; name: string };
const C = createContext<Ctx>({ role: "viewer", perms: [], can: () => false, name: "" });
export const useOps = () => useContext(C);

const NAV: { href: string; label: string; icon: string; group: string; perm?: string }[] = [
  { href: "/ops", label: "Today", icon: "◉", group: "Live" },
  { href: "/ops/bookings", label: "Bookings", icon: "▤", group: "Live" },
  { href: "/ops/help", label: "Help requests", icon: "✉", group: "Live" },
  { href: "/ops/incidents", label: "Incidents", icon: "⚑", group: "Live" },
  { href: "/ops/care", label: "Relief and intros", icon: "⇄", group: "Live" },
  { href: "/ops/caregivers", label: "Caregivers", icon: "♥", group: "People" },
  { href: "/ops/people", label: "Families and seniors", icon: "⌂", group: "People" },
  { href: "/ops/community", label: "Community", icon: "☺", group: "People" },
  { href: "/ops/money", label: "Payments and GST", icon: "₹", group: "Money", perm: "money" },
  { href: "/ops/pricing", label: "Pricing and policy", icon: "%", group: "Money" },
  { href: "/ops/reports", label: "Reports", icon: "▥", group: "Money" },
  { href: "/ops/team", label: "Team", icon: "☰", group: "Admin" },
  { href: "/ops/audit", label: "Audit and messages", icon: "◎", group: "Admin", perm: "audit" },
  { href: "/ops/settings", label: "Settings", icon: "⚙", group: "Admin", perm: "settings" },
];
const ROLE: Record<string, string> = { admin: "Admin", agent: "Agent", finance: "Finance", viewer: "Viewer" };

export function ConsoleShell({ name, role, perms, children }: { name: string; role: string; perms: string[]; children: React.ReactNode }) {
  const path = usePathname(); const [open, setOpen] = useState(false); const [badges, setBadges] = useState<Record<string, number>>({});
  const can = (p: string) => perms.includes(p);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => { const l = () => api("/api/ops/dashboard").then((d) => setBadges({ "/ops/help": d.counts?.open_tickets ?? 0, "/ops/incidents": d.counts?.open_incidents ?? 0, "/ops": d.sos?.length ?? 0 })).catch(() => {}); l(); const t = setInterval(l, 30000); return () => clearInterval(t); }, []);
  const items = NAV.filter((n) => !n.perm || can(n.perm));
  const active = (h: string) => (h === "/ops" ? path === "/ops" : path.startsWith(h));
  return (
    <C.Provider value={{ role, perms, can, name }}>
      <div className="min-h-screen bg-[#F6F5FB] lg:grid lg:grid-cols-[240px_1fr]">
        <a href="#ops-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
        <aside className={`${open ? "block" : "hidden"} fixed inset-0 z-40 overflow-y-auto bg-indigo-950 text-white lg:sticky lg:top-0 lg:block lg:h-screen`} aria-label="Operations menu">
          <div className="flex items-center justify-between px-5 py-4">
            <Link href="/ops" className="flex items-center gap-2 font-display text-lg font-extrabold"><svg width="26" height="26" viewBox="0 0 30 30" aria-hidden><rect width="30" height="30" rx="9" fill="#271A5C" /><path d="M6 20a9 9 0 0 1 18 0z" fill="#F5A623" /><path d="M5 22.5h20" stroke="#F5891F" strokeWidth="1.6" strokeLinecap="round" /></svg>uday <span className="text-xs font-semibold text-indigo-100/70">operations</span></Link>
            <button className="grid h-10 w-10 place-items-center rounded-lg border border-white/20 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">✕</button></div>
          <nav className="grid gap-4 px-3 pb-6">{["Live", "People", "Money", "Admin"].map((g) => { const xs = items.filter((n) => n.group === g); return xs.length ? (
            <div key={g}><div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-[.16em] text-indigo-100/50">{g}</div>
              {xs.map((n) => <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
                className={`flex min-h-[40px] items-center gap-3 rounded-lg px-3 text-sm font-semibold ${active(n.href) ? "bg-white/12 text-white" : "text-indigo-100/80 hover:bg-white/5 hover:text-white"}`} style={active(n.href) ? { background: "rgba(255,255,255,.12)" } : undefined}>
                <span aria-hidden className="w-4 text-center text-orange-400">{n.icon}</span><span className="flex-1">{n.label}</span>
                {badges[n.href] ? <span className={`rounded-full px-2 text-xs font-bold ${n.href === "/ops" ? "bg-red-500 text-white" : "bg-orange-500 text-indigo-950"}`} aria-label={`${badges[n.href]} open`}>{badges[n.href]}</span> : null}</Link>)}</div>) : null; })}</nav>
          <div className="border-t border-white/10 px-5 py-4 text-sm"><div className="font-semibold">{name}</div><div className="text-indigo-100/60">{ROLE[role] ?? role}</div>
            <button className="mt-2 text-sm font-semibold text-orange-400" onClick={() => fetch("/api/auth/logout", { method: "POST" }).finally(() => (location.href = "/signin"))}>Sign out</button></div>
        </aside>
        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white/95 px-4 py-2.5 backdrop-blur sm:px-6">
            <button className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
            <Search />
          </header>
          <main id="ops-main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">{children}</main>
        </div>
      </div>
    </C.Provider>);
}

function Search() {
  const [q, setQ] = useState(""); const [res, setRes] = useState<any[] | null>(null); const [i, setI] = useState(0); const router = useRouter(); const box = useRef<HTMLInputElement>(null);
  useEffect(() => { if (q.trim().length < 2) { setRes(null); return; } const t = setTimeout(() => api(`/api/ops/search?q=${encodeURIComponent(q)}`).then((r) => { setRes(r); setI(0); }).catch(() => setRes([])), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") { e.preventDefault(); box.current?.focus(); } }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);
  const go = (h: string) => { setQ(""); setRes(null); router.push(h); };
  return (
    <div className="relative w-full max-w-xl">
      <input ref={box} className="input-sm" type="search" placeholder="Search name, phone, last 4 digits, UDY…, TKT…, INC…  ( / )" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (!res?.length) return; if (e.key === "ArrowDown") { e.preventDefault(); setI((i + 1) % res.length); } if (e.key === "ArrowUp") { e.preventDefault(); setI((i - 1 + res.length) % res.length); } if (e.key === "Enter") go(res[i].href); if (e.key === "Escape") setRes(null); }} />
      {res && <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-auto rounded-xl border border-line bg-white shadow-lift" role="listbox">
        {!res.length ? <p className="p-3 text-sm text-muted">Nothing found</p> : res.map((r, k) => (
          <button key={r.kind + r.id + k} role="option" aria-selected={k === i} onMouseEnter={() => setI(k)} onClick={() => go(r.href)} className={`flex w-full items-baseline gap-3 px-3 py-2 text-left text-sm ${k === i ? "bg-indigo-50" : ""}`}>
            <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-wider text-muted">{r.kind}</span><span className="min-w-0"><b className="text-ink">{r.title}</b> <span className="text-muted">{r.sub}</span></span></button>))}</div>}
    </div>);
}
