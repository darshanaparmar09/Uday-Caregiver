import { meta } from "@/lib/seo";
import Link from "next/link";
import { PageHero, Section, Head, Photo } from "@/components/Section";
export const metadata = meta("/families");
export default function Page() {
  return (<>
    <PageHero eyebrow="For families" title="Reliable care for your parents, visible from anywhere" lead="You do not need a cheaper caretaker. You need one who shows up, is trained for your parent's needs, and is replaced by someone briefed when absent." img="call" alt="A father in Pune on a video call with his son's family abroad" pos="center 40%" />
    <Section><Head title="Built for families who live apart" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[["Your time zone", "Alerts arrive at sensible hours where you live. Safety alerts always come through."], ["International cards", "Pay from abroad by card. Prices are in rupees with an estimate in your currency."],
          ["A local contact", "Name someone near your parent who can reach the home. They get alerts by call or WhatsApp, no app needed."], ["Shared with siblings", "Invite family with their own roles, so everyone sees the same shift logs."]].map(([t, d]) => <div key={t} className="card"><h3 className="font-bold">{t}</h3><p className="mt-2">{d}</p></div>)}
      </div></Section>
    <Section tone="tint"><div className="grid items-center gap-10 lg:grid-cols-2">
      <div><Head eyebrow="Your parent's side" title="One tap a day, nothing to learn" lead="The Uday app gives your parent a single large sunrise to tap each morning. If they tap for help, or miss their check in, you hear about it. Seniors without a smartphone can check in by call." />
        <Link href="/signin" className="btn">Set up daily check in</Link></div>
      <Photo src="woman" alt="A smiling elderly woman at home" pos="62% 30%" className="aspect-[4/3]" />
    </div></Section>
  </>);
}
