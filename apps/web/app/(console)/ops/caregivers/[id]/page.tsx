import { CaregiverDetail } from "@/components/ops/People";
export const metadata = { title: "Caregiver" };
export default function Page({ params }: { params: { id: string } }) { return <CaregiverDetail id={params.id} />; }
