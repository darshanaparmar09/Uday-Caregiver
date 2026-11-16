import { PersonDetail } from "@/components/ops/People";
export const metadata = { title: "Person" };
export default function Page({ params }: { params: { id: string } }) { return <PersonDetail id={params.id} />; }
