"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";

const NAV = [
  ["/hire", "Hire a caregiver"], ["/how-it-works", "How it works"], ["/families", "Families"], ["/facilities", "Facilities"], ["/partners", "Partners"],
  ["/trust", "Trust and safety"], ["/about", "About"], ["/faq", "FAQ"],
] as const;

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-paper/85 backdrop-blur-md" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="wrap flex h-16 items-center gap-4">
        <Link href="/" aria-label="Uday home"><Logo /></Link>
        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 lg:flex">
          {NAV.map(([h, t]) => (
            <Link key={h} href={h} aria-current={path === h ? "page" : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-[15px] font-medium transition hover:bg-indigo-50 ${path === h ? "text-indigo-700" : "text-body"}`}>{t}</Link>
          ))}
          <Link href="/signin" className="btn ml-2 min-h-[42px] px-4 text-sm">Sign in / Register</Link>
        </nav>
        <button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mnav" aria-label="Menu"
          className="ml-auto grid h-11 w-11 place-items-center rounded-xl border border-line lg:hidden">{open ? "✕" : "☰"}</button>
      </div>
      {open && (
        <nav id="mnav" aria-label="Main" className="wrap grid gap-1 pb-4 lg:hidden">
          {NAV.map(([h, t]) => <Link key={h} href={h} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-base font-medium text-ink hover:bg-indigo-50">{t}</Link>)}
          <Link href="/signin" onClick={() => setOpen(false)} className="btn mt-2">Sign in / Register</Link>
        </nav>
      )}
    </header>
  );
}
