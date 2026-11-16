import { CaregiverPage } from "@/components/forms/CaregiverPage";
export const metadata = { title: "Caregiver profile" };
export default function Page({ params }: { params: { id: string } }) { return <div className="bg-gradient-to-b from-indigo-50/70 to-paper"><div className="wrap max-w-3xl py-8 sm:py-12"><CaregiverPage id={params.id} /></div></div>; }
