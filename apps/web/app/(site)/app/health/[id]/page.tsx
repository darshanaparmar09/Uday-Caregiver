import { HealthForm } from "@/components/forms/HealthForm";
export const metadata = { title: "Health details" };
export default function Page({ params }: { params: { id: string } }) { return <HealthForm id={params.id} />; }
