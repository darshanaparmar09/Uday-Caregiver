import { FamilyMembers, CheckinMode } from "@/components/forms/FamilyTools";
export const metadata = { title: "Family" };
export default function Page({ params }: { params: { id: string } }) { return <div className="grid gap-6"><FamilyMembers id={params.id} /><CheckinMode id={params.id} /></div>; }
