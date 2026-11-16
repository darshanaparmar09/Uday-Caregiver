import { Bookings } from "@/components/ops/Live";
export const metadata = { title: "Bookings" };
export default function Page({ searchParams }: { searchParams: { status?: string } }) { return <Bookings initial={searchParams.status} />; }
