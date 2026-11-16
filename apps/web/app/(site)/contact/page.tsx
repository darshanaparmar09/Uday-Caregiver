import { meta } from "@/lib/seo";
import { PageHero, Section } from "@/components/Section";
export const metadata = meta("/contact");
export default function Page() {
  return (<>
    <PageHero eyebrow="Contact" title="Talk to Uday" lead="Families, caregivers and partners. Contact details go live with the pilot." />
    <Section><div className="grid gap-4 md:grid-cols-3">
      <div className="card"><h2 className="text-lg font-bold">Families</h2><p className="mt-2">Sign in and raise a help request from any booking. It reaches the care manager on duty.</p></div>
      <div className="card"><h2 className="text-lg font-bold">Caregivers</h2><p className="mt-2">Apply through Careers. Our recruiter calls you within a week.</p></div>
      <div className="card"><h2 className="text-lg font-bold">Partners</h2><p className="mt-2">Partnership email and phone are published at launch.</p></div>
    </div><p className="note mt-6">If anyone is in danger, call 112 first.</p></Section>
  </>);
}
