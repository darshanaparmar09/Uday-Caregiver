import Link from "next/link";
import { PageHero, Section } from "@/components/Section";
import { meta } from "@/lib/seo";
export const metadata = meta("/delete-account");
/** Public page for the Google Play "delete account" link. Works without signing in. */
export default function Page({ searchParams }: { searchParams: { done?: string } }) {
  return (<>
    <PageHero eyebrow="Your data" title="Delete your Uday account" lead={searchParams.done ? "Your account has been deleted. Thank you for using Uday." : "Applies to the Uday app, the Uday Caregiver app and this website."} />
    <Section><div className="max-w-2xl space-y-6">
      <div><h2 className="text-2xl font-bold">In the app</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5"><li>Open Uday or Uday Caregiver and go to Me.</li><li>Under Your data, tap Delete my account.</li><li>Type DELETE and confirm.</li></ol></div>
      <div><h2 className="text-2xl font-bold">On the website</h2>
        <p className="mt-2"><Link className="font-semibold text-indigo-600" href="/signin?next=/app/account">Sign in</Link>, open My account, then Your data, then Delete my account.</p></div>
      <div><h2 className="text-2xl font-bold">Cannot sign in?</h2>
        <p className="mt-2">Send a request from the <Link className="font-semibold text-indigo-600" href="/contact">contact page</Link> with the phone number on the account. We confirm it is you by a code sent to that number, then delete within 30 days.</p></div>
      <div><h2 className="text-2xl font-bold">What is erased</h2>
        <p className="mt-2">Your name, phone number, email, address, health details, documents, check ins, messages, community posts and AI companion chats. You are signed out on every device.</p></div>
      <div><h2 className="text-2xl font-bold">What is kept, and why</h2>
        <p className="mt-2">Payment records and tax invoices, without your name, for the period Indian tax law requires. Safety incident records where the law or an investigation requires them.</p></div>
      <div><h2 className="text-2xl font-bold">When deletion waits</h2>
        <p className="mt-2">If care is booked or in progress, cancel or finish it first, so no caregiver arrives at a home we can no longer reach. Caregivers must first be paid any money owed.</p></div>
      <p className="note">Retention periods are pending legal review.</p>
    </div></Section>
  </>);
}
