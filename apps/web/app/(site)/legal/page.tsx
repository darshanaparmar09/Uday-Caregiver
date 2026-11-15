import { PageHero, Section } from "@/components/Section";
export const metadata = { title: "Privacy and terms" };
export default function Page() {
  return (<>
    <PageHero eyebrow="Legal" title="Privacy and terms" lead="Final versions are being prepared with counsel and will be published before the pilot takes any booking." />
    <Section><div className="max-w-2xl space-y-4">
      <h2 className="text-2xl font-bold">What we commit to now</h2>
      <ul className="list-disc space-y-2 pl-5"><li>Data is stored in India and encrypted. Health and identity details are encrypted separately with their own keys.</li>
        <li>We never store card numbers, UPI PINs, full Aadhaar numbers or police reports.</li><li>Health details are optional. You choose what a caregiver may see, and you can withdraw consent at any time.</li>
        <li>Every staff view of health details is logged.</li></ul>
      <p className="note">This page is a placeholder until counsel approves the privacy policy and terms of use.</p></div></Section>
  </>);
}
