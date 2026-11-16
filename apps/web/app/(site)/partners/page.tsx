import Link from "next/link";
import { PageHero, Section } from "@/components/Section";
export const metadata = { title: "Partners" };
const P = [["Senior living operators", "A care layer for residents: check ins, certified caregivers on call, and a shared view for your front desk."],
  ["Hospitals", "Discharge to home care with a briefed caregiver and logs your team can follow up on."],
  ["Banks and insurers", "An elder care benefit your customers actually use, with clear reporting."],
  ["Corporate HR", "Care for employees' parents, so your people can work without worry."]];
export default function Page() {
  return (<>
    <PageHero eyebrow="Partners" title="Elder care programmes your customers keep" lead="Uday runs the care layer so your organisation can serve senior citizens and their families every day, not as a one time benefit." img="woman" alt="An elderly woman at home" pos="62% 30%" />
    <Section><div className="grid gap-4 md:grid-cols-2">{P.map(([t, d]) => <div key={t} className="card"><h2 className="text-lg font-bold">{t}</h2><p className="mt-2">{d}</p></div>)}</div>
      <div className="mt-8 flex flex-wrap gap-3"><Link href="/contact" className="btn">Start a partner conversation</Link><Link href="/partner" className="btn-ghost">List your care facility</Link></div></Section>
  </>);
}
