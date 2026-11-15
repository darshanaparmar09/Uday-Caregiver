import { PageHero } from "@/components/Section";
import { Hire } from "@/components/forms/Hire";
export const metadata = { title: "Hire a caregiver" };
export default function Page() {
  return (<>
    <PageHero eyebrow="Hire a caregiver" title="Choose the care, pick the person, pay on Uday" lead="Day, night or 24 hour live in care, for a day, a week, a month or a quarter. Your payment is held, not charged, until the caregiver accepts." img="walk" alt="An Uday caregiver walks arm in arm with an elderly woman" pos="center 35%" />
    <section className="py-10"><div className="wrap"><Hire /></div></section>
  </>);
}
