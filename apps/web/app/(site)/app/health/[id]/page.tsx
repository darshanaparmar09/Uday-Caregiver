import { HealthForm } from "@/components/forms/HealthForm";
import { Documents } from "@/components/forms/FamilyTools";
import { Appointments } from "@/components/forms/CareToday";
export const metadata = { title: "Health details" };
export default function Page({ params }: { params: { id: string } }) {
  return <div className="grid gap-8"><div id="appointments"><Appointments rid={params.id} name="your parent" /></div><HealthForm id={params.id} /><Documents id={params.id} /></div>;
}
