import { Readings } from "@/components/forms/Readings";
export const metadata = { title: "Readings" };
export default function Page({ params }: { params: { id: string } }) { return <Readings id={params.id} />; }
