import { FacilityView } from "@/components/forms/FacilityView";
export const metadata = { title: "Care facility" };
export default function Page({ params }: { params: { id: string } }) { return <div className="bg-gradient-to-b from-indigo-50/70 to-paper"><div className="wrap max-w-5xl py-8 sm:py-12"><FacilityView id={params.id} /></div></div>; }
