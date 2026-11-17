import Link from "next/link";
import { Logo } from "./Logo";
export function Footer() {
  return (
    <footer className="bg-indigo-950 text-indigo-100/80" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="wrap grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div><Logo light /><p className="mt-3 max-w-xs text-sm">Certified caregivers for Indian families, with a free daily check in for parents. Across India, starting in Pune.</p></div>
        <div className="grid content-start gap-2 text-sm"><b className="mb-1 text-white">Families</b><Link href="/hire">Hire a caregiver</Link><Link href="/how-it-works">How it works</Link><Link href="/families">For families abroad</Link><Link href="/signin">Sign in / Register</Link></div>
        <div className="grid content-start gap-2 text-sm"><b className="mb-1 text-white">Uday</b><Link href="/trust">Trust and safety</Link><Link href="/careers">Careers</Link><Link href="/partners">Partners</Link><Link href="/about">About</Link></div>
        <div className="grid content-start gap-2 text-sm"><b className="mb-1 text-white">Help</b><Link href="/faq">FAQ</Link><Link href="/contact">Contact</Link><Link href="/legal">Privacy and terms</Link></div>
      </div>
      <div className="wrap flex flex-wrap justify-between gap-2 border-t border-white/10 py-5 text-xs"><span>© {new Date().getFullYear()} Uday · Pune, India</span><span>If anyone is in danger, call 112.</span></div>
    </footer>
  );
}
