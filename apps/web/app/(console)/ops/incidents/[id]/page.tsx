import { IncidentDetail } from "@/components/ops/Live";
export const metadata = { title: "Incident" };
export default function Page({ params }: { params: { id: string } }) { return <IncidentDetail id={params.id} />; }
