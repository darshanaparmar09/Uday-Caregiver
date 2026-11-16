import { meta } from "@/lib/seo";
import Link from "next/link";
import { PageHero, Section, Head } from "@/components/Section";
import { Directory } from "@/components/forms/Directory";
import { FACILITY_TYPES_EXPLAINED, CHOOSING_STEPS } from "@/components/facilityGuide";
export const metadata = meta("/facilities");
export default function Page() {
  return (<>
    <PageHero eyebrow="Care facilities" title="When home care is no longer enough" lead="Compare assisted living, nursing homes, memory care and retirement communities in Pune. Read reviews from families who visited, book a visit, and use our checklist when you go." img="clinic" alt="An Uday staff member assists an elderly woman at a reception desk" pos="center 60%" />
    <Section><Directory /></Section>
    <Section tone="tint">
      <Head eyebrow="Guide" title="Choosing the right facility" lead="Give yourself as much time as you can. A careful choice is a much better match in the end." />
      <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{CHOOSING_STEPS.map(([t, d], i) => <li key={t} className="card"><span className="chip">Step {i + 1}</span><h3 className="mt-2 font-bold">{t}</h3><p className="mt-1 text-sm">{d}</p></li>)}</ol>
      <h3 className="mt-10 text-xl font-bold">Types of facility</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">{FACILITY_TYPES_EXPLAINED.map(([t, d]) => <div key={t} className="card"><h4 className="font-bold text-ink">{t}</h4><p className="mt-1 text-sm">{d}</p></div>)}</div>
      <p className="note mt-6">Open any facility to use the visit checklist. Your answers are saved privately to your account.</p>
    </Section>
    <Section><div className="card flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-bold">Run a care facility?</h2><p className="mt-1">List it on Uday and receive visit requests from families. Monthly plan, cancel any time.</p></div><Link href="/partner" className="btn">List your facility</Link></div></Section>
  </>);
}
