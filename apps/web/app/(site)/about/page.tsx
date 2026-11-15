import { PageHero, Section } from "@/components/Section";
export const metadata = { title: "About" };
export default function Page() {
  return (<>
    <PageHero eyebrow="About" title="Uday means sunrise" lead="Every morning, families wake up wondering if their parents are alright. Uday exists so that question has an answer." img="sunrise" alt="Sunrise over the sea" />
    <Section><div className="max-w-2xl space-y-4 text-lg"><p>Uday is built in Pune by people who have lived this problem: parents ageing in one city, children working in another, and daily care held together by arrangements that fail without warning.</p>
      <p>The fix has two halves. Families need verified skills, visible care and a backup that never leaves them stranded. Caregivers need insurance, fair pay, training and a career. Dignity on one side of this market creates reliability on the other.</p>
      <p>We start deliberately small: one city, a certified first cohort, and published standards we can be held to.</p></div></Section>
  </>);
}
