import { CaregiverPage } from "@/components/forms/CaregiverPage";
import { meta } from "@/lib/seo";
// Caregiver profiles are personal: shown to families on Uday, kept out of search engines.
export const metadata = meta("/caregivers", { title: "Caregiver profile", description: "A verified Uday caregiver's tier, languages, ratings and reviews.", noindex: true, type: "profile" });
export default function Page({ params }: { params: { id: string } }) { return <div className="bg-gradient-to-b from-indigo-50/70 to-paper"><div className="wrap max-w-3xl py-8 sm:py-12"><CaregiverPage id={params.id} /></div></div>; }
