import { meta } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero, Section } from "@/components/Section";
export const metadata = meta("/faq");
const F = [["What does a booking cost?", "Rates depend on tier and care type. Sample rates on the site start at ₹850 a day for Tier 1. The checkout shows the care fee, Uday's platform fee and GST before you pay. Final pilot prices are being confirmed."],
  ["When am I charged?", "Your payment is held when you request and captured only when the caregiver accepts. If nobody accepts, the hold is released."],
  ["What if the caregiver declines?", "Uday proposes the next caregiver of the same tier. You approve before anyone is sent, or cancel and the hold is released."],
  ["Can I cancel?", "Free up to 4 hours before a shift. After that, 20% of one day of care. Unused days of a longer plan are always refunded."],
  ["Do I have to share medical details?", "No. Allergies, medicines and prescriptions are optional. If you add them, you choose what the caregiver may see."],
  ["My parent does not use a smartphone.", "The daily check in also works by phone call. A family member or your local contact receives the shift codes and reads them out."],
  ["Can I pay from abroad?", "Yes, by international card."], ["How do caregivers join?", "Through the Careers page. Every caregiver clears identity, police, reference and training checks before the first shift."]];
export default function Page() {
  return (<>
    <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: F.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }} />
    <PageHero eyebrow="FAQ" title="Questions families and caregivers ask" lead="Short answers now; a conversation whenever you want one." />
    <Section><div className="grid max-w-3xl gap-3">{F.map(([q, a]) => (
      <details key={q} className="card group"><summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-bold text-ink">{q}<span className="text-orange-500 transition group-open:rotate-45">+</span></summary><p className="mt-2">{a}</p></details>))}</div></Section>
  </>);
}
