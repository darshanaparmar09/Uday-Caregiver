import { BookingView } from "@/components/forms/BookingView";
export const metadata = { title: "Booking" };
export default function Page({ params }: { params: { id: string } }) { return <BookingView id={params.id} />; }
