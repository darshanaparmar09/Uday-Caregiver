import { PageHero, Section, Head } from "@/components/Section";
export const metadata = { title: "Trust and safety" };
const CHECKS = [["Identity", "Checked through a licensed verification partner. Uday never stores Aadhaar numbers."],
  ["Police verification", "Done by an independent third party. You see a Police verified tick; the report stays with the provider."],
  ["References", "Two past employers or families, called and recorded."], ["Training and tier", "Uday academy modules and a practical assessment set the tier."],
  ["Nursing registration", "Checked with the nursing council for every Tier 3 nurse."], ["Shadow shift", "One supervised shift before anyone works alone."]];
export default function Page() {
  return (<>
    <PageHero eyebrow="Trust and safety" title="The safety question, answered before it is asked" lead="Someone you have never met will be alone with your parent. Here is what we check, what we promise and what happens when something goes wrong." img="checkup" alt="A smiling woman at a health check up" pos="center 30%" />
    <Section><Head title="Six checks before the first shift" /><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{CHECKS.map(([t, d]) => <div key={t} className="card"><div className="pill-ok inline-block">Required</div><h3 className="mt-3 font-bold">{t}</h3><p className="mt-2">{d}</p></div>)}</div></Section>
    <Section tone="tint"><Head title="During every shift" /><div className="grid gap-4 md:grid-cols-3">
      <div className="card"><h3 className="font-bold">Provable attendance</h3><p className="mt-2">Location checked arrival and a start code only your family can give.</p></div>
      <div className="card"><h3 className="font-bold">SOS on both sides</h3><p className="mt-2">Seniors and caregivers can raise an alert that reaches the Uday safety desk. In danger, call 112 first.</p></div>
      <div className="card"><h3 className="font-bold">Your data, locked</h3><p className="mt-2">Health and identity details are encrypted separately. Caregivers see only what you allow, only while booked.</p></div>
    </div></Section>
    <Section><Head title="When something goes wrong" lead="A safety concern pauses the caregiver within 24 hours while we review. You get a written outcome. The disputed shift is held, not charged." /></Section>
  </>);
}
