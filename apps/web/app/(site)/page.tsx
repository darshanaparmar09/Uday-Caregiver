import Link from "next/link";
import { meta, SITE_URL } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
export const metadata = meta("/");
// Organization details for search results. Phone and social links to be added once live.
const ORG = { "@context": "https://schema.org", "@type": "Organization", name: "Uday", url: SITE_URL, logo: `${SITE_URL}/icon.svg`,
  description: "Certified caregivers by the day, night or live in, with a free daily check in for parents. Pune, India.",
  areaServed: { "@type": "City", name: "Pune" }, address: { "@type": "PostalAddress", addressLocality: "Pune", addressRegion: "Maharashtra", addressCountry: "IN" } };
import { Section, Head, Photo } from "@/components/Section";

const TIERS = [
  ["Tier 1", "Companion", "Company, meals, walks, reminders, light help at home.", "from ₹850 a day"],
  ["Tier 2", "Trained caregiver", "Mobility, transfers, hygiene, dementia and post surgery support.", "from ₹1,400 a day"],
  ["Tier 3", "Nurse", "Injections, wound care, vitals, catheter and diabetes care.", "from ₹2,100 a day"],
];

export default function Home() {
  return (
    <>
      <JsonLd data={ORG} />
      <div className="relative overflow-hidden bg-indigo-900">
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-orange-500/30 via-orange-500/5 to-transparent" />
        <div aria-hidden className="absolute -bottom-56 left-1/2 h-[28rem] w-[56rem] -translate-x-1/2 rounded-full bg-orange-400/40 blur-3xl" />
        <div className="wrap relative grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-indigo-100"><span className="h-2 w-2 rounded-full bg-orange-400" />Pune pilot · opening 2027</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] text-white sm:text-6xl">Care for your parents, <span className="text-orange-400">every single day.</span></h1>
            <p className="mt-5 max-w-xl text-lg text-indigo-100/85">Uday certified caregivers by the day, night or live in. A free daily check in for your parents. Every shift verified, logged and visible to you, wherever you live.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/hire" className="btn text-base">Hire a caregiver</Link>
              <Link href="/signin" className="inline-flex min-h-[48px] items-center rounded-xl border border-white/25 px-5 font-semibold text-white hover:bg-white/10">Start free daily check in</Link>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 text-sm text-indigo-100/80">
              <div><dt className="font-display text-2xl font-extrabold text-white">3</dt><dd>published tiers of certification</dd></div>
              <div><dt className="font-display text-2xl font-extrabold text-white">4 hrs</dt><dd>free cancellation window</dd></div>
              <div><dt className="font-display text-2xl font-extrabold text-white">0</dt><dd>cash at home: pay online only</dd></div>
            </dl>
          </div>
          <div className="relative">
            <Photo src="garden" alt="An Uday caregiver walks with an elderly man in a wheelchair through a garden" pos="60% center" className="aspect-[4/3]" priority />
            <div className="absolute -bottom-5 left-4 right-4 rounded-2xl bg-white p-4 shadow-lift sm:left-auto sm:right-[-12px] sm:w-72">
              <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-teal-50 text-lg text-teal-600">✓</span>
                <div><div className="text-sm font-semibold text-ink">Papa checked in at 8:42 AM</div><div className="text-xs text-muted">Sunita arrived 9:00 · shift log at 5 PM</div></div></div>
            </div>
          </div>
        </div>
      </div>

      <Section>
        <Head eyebrow="The problem" title="Care fails where families live apart" lead="Most paid elder care in India is informal: found by word of mouth, paid in cash, and held together by hope. Uday replaces that with a system." />
        <div className="grid gap-4 md:grid-cols-3">
          {[["Unverified help", "You cannot tell a trained attendant from an untrained one. Every Uday caregiver is identity checked, police verified by a third party, and tier certified before the first shift."],
            ["No record of the day", "Did Papa eat, did the medicine happen? Every Uday shift ends with a log you read the same day, from anywhere."],
            ["No backup", "When a caretaker takes leave, families start from zero. Uday proposes a briefed caregiver of the same tier, and you approve."]].map(([t, d]) => (
            <div key={t} className="card"><h3 className="text-lg font-bold">{t}</h3><p className="mt-2">{d}</p></div>))}
        </div>
      </Section>

      <Section tone="tint">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <Head eyebrow="How it works" title="Book in minutes. Then it simply runs." />
            <ol className="grid gap-5">
              {[["Tell us about your parent", "Routine, language, mobility and emergency contacts. Health details are optional."],
                ["Choose a certified caregiver", "Day shift, night shift or 24 hour live in, for a day, a week, a month or a quarter. Your payment is held, not charged."],
                ["See every shift", "Arrival is location checked. You give a start code at the door and an end code when the shift is done. The shift log reaches you the same day."]].map(([t, d], i) => (
                <li key={t} className="flex gap-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-900 font-display font-bold text-orange-400">{i + 1}</span><div><h3 className="font-bold">{t}</h3><p className="mt-1">{d}</p></div></li>))}
            </ol>
            <Link href="/how-it-works" className="btn-ghost mt-8">See the full journey</Link>
          </div>
          <Photo src="companion" alt="An Uday caregiver plays checkers with an elderly man" pos="center 40%" className="aspect-[4/3]" />
        </div>
      </Section>

      <Section>
        <Head eyebrow="Certification" title="Three tiers, published and verified" lead="Skills are verified, not claimed. You see exactly what each tier is checked for before you book." />
        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map(([n, t, d, p], i) => (
            <div key={n} className={`card relative overflow-hidden ${i === 1 ? "ring-2 ring-orange-400" : ""}`}>
              <div className="absolute right-0 top-0 h-24 w-24 -translate-y-1/2 translate-x-1/2 rounded-full bg-orange-100" />
              <span className="chip">{n}</span><h3 className="mt-3 text-xl font-bold">{t}</h3><p className="mt-2">{d}</p><p className="mt-4 text-sm font-semibold text-indigo-700">{p} <span className="font-normal text-muted">· sample rates</span></p>
            </div>))}
        </div>
      </Section>

      <Section tone="dark">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Photo src="call" alt="A father in Pune on a video call with his son's family abroad" pos="center 40%" className="aspect-[16/10]" />
          <div>
            <Head light eyebrow="For families abroad" title="Visible from anywhere" lead="Pay by international card. Get alerts in your time zone. Approve a substitute in one tap. Your parent needs no app: a daily check in by tap, call or WhatsApp." />
            <Link href="/families" className="btn">How it works for NRI families</Link>
          </div>
        </div>
      </Section>

      <Section>
        <div className="grid gap-6 rounded-3xl bg-gradient-to-br from-orange-50 to-indigo-50 p-8 sm:p-12 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div><div className="eyebrow">Free for every family</div><h2 className="mt-2 text-3xl font-extrabold">The daily check in</h2>
            <p className="mt-3 max-w-xl text-lg">Every morning your parent taps one large sunrise on their phone. If they need help, or do not check in, you and your local contact hear about it straight away.</p></div>
          <div className="flex flex-wrap gap-3 lg:justify-end"><Link href="/signin" className="btn">Set up check in</Link><Link href="/trust" className="btn-ghost">Our safety standards</Link></div>
        </div>
      </Section>
    </>
  );
}
