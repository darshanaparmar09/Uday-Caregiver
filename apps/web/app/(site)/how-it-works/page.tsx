import { meta } from "@/lib/seo";
import Link from "next/link";
import { PageHero, Section } from "@/components/Section";
export const metadata = meta("/how-it-works");
const STEPS = [
  ["Create your account", "Sign in with your mobile number, from India or abroad. Add family members with their own roles: owner, care manager, payer or viewer."],
  ["Tell us about your parent", "Address, languages, care needs and two emergency contacts. Allergies, medicines and prescriptions are optional, and you decide what a caregiver may see."],
  ["Choose and request", "Pick day shift, night shift or 24 hour live in, for a day, a week, a month or a quarter. Choose a caregiver from the list. Your payment is held, not charged."],
  ["The caregiver answers", "Accepted: your payment is captured and you are told at once. Declined or no answer: Uday proposes the next caregiver of the same tier, and you approve before anyone is sent."],
  ["Verified start and end", "Arrival is checked against the home's location. You give a start code at the door and an end code at the end of the shift, so every shift is provable."],
  ["Logged and paid per shift", "Meals, medicines, mood and notes reach you the same day. The caregiver is paid one completed shift at a time, so you never pay for care that did not happen."],
];
export default function Page() {
  return (<>
    <PageHero eyebrow="How it works" title="From first request to covered care" lead="Six steps, each designed so that nothing depends on memory, goodwill or luck." img="elder" alt="An elderly woman smiling at home" pos="center 25%" />
    <Section><ol className="grid max-w-3xl gap-4">{STEPS.map(([t, d], i) => (
      <li key={t} className="card flex gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-orange-100 font-display font-extrabold text-orange-600">{i + 1}</span><div><h2 className="text-lg font-bold">{t}</h2><p className="mt-1">{d}</p></div></li>))}</ol></Section>
    <Section tone="tint"><div className="grid gap-4 md:grid-cols-3">
      <div className="card"><h3 className="font-bold">Change of plans</h3><p className="mt-2">Cancel or reschedule free up to 4 hours before a shift. After that, 20% of one day of care. Unused days are always refunded.</p></div>
      <div className="card"><h3 className="font-bold">Online payment only</h3><p className="mt-2">UPI, cards (Indian and international) and net banking. No cash changes hands at home.</p></div>
      <div className="card"><h3 className="font-bold">Help when you need it</h3><p className="mt-2">Raise a request from any booking. Safety and no show requests go to the care manager on duty first.</p></div>
    </div><Link href="/hire" className="btn mt-8">Hire a caregiver</Link></Section>
  </>);
}
