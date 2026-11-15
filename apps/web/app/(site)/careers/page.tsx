import { PageHero, Section, Head } from "@/components/Section";
import { CareersForm } from "@/components/forms/CareersForm";
export const metadata = { title: "Careers" };
export default function Page() {
  return (<>
    <PageHero eyebrow="Careers at Uday" title="Respect, protection and a path up" lead="Care work is skilled work. Uday certifies your skills, protects your income and funds your way to the next tier." img="mobility" alt="An Uday caregiver helps an elderly patient stand beside a hospital bed" pos="center 30%" />
    <Section><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{[["Insurance", "Health and accident cover while you work through Uday."], ["Paid weekly", "Every completed shift paid to your bank each week."], ["Funded training", "Academy modules toward higher tiers, paid by Uday."], ["Safety", "An SOS button in your app and a safety desk behind it."]].map(([t, d]) => <div key={t} className="card"><h3 className="font-bold">{t}</h3><p className="mt-2">{d}</p></div>)}</div></Section>
    <Section tone="tint"><div className="grid gap-10 lg:grid-cols-2"><Head title="Apply to the academy" lead="The first cohort trains in Pune. Experienced attendants, nurses and people new to care work are welcome. Our team calls you within a week." /><div className="card"><CareersForm /></div></div></Section>
  </>);
}
