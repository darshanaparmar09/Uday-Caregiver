import { BookingDetail } from "@/components/ops/Live";
export const metadata = { title: "Booking" };
export default function Page({ params }: { params: { id: string } }) { return <BookingDetail id={params.id} />; }
