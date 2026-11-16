import { TicketDetail } from "@/components/ops/Live";
export const metadata = { title: "Help request" };
export default function Page({ params }: { params: { id: string } }) { return <TicketDetail id={params.id} />; }
