import { HealthForm } from "@/components/forms/HealthForm";
import { Documents } from "@/components/forms/FamilyTools";
export const metadata = { title: "Health details" };
export default function Page({ params }: { params: { id: string } }) { return <div className="grid gap-8"><HealthForm id={params.id} /><Documents id={params.id} /></div>; }
