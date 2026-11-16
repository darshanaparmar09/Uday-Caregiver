import { meta } from "@/lib/seo";
import { PartnerPortal } from "@/components/forms/PartnerPortal";
export const metadata = meta("/partner");
export const dynamic = "force-dynamic";
export default function Page() { return <div className="bg-gradient-to-b from-indigo-50/70 to-paper"><div className="wrap max-w-4xl py-8 sm:py-12"><PartnerPortal /></div></div>; }
