import type { Metadata } from "next";
import { FacilityView } from "@/components/forms/FacilityView";
import { meta, SITE_URL } from "@/lib/seo";
import { one } from "@/lib/db";
import { JsonLd } from "@/components/JsonLd";
export const dynamic = "force-dynamic";
const TYPE: Record<string, string> = { assisted_living: "Assisted living", nursing_home: "Nursing home", memory_care: "Dementia care", rehab: "Rehabilitation", respite: "Respite care", retirement_community: "Retirement community" };
async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return one<any>("SELECT id, name, types, city, locality, description, monthly_from_paise, sample, status, licence_verified FROM facilities WHERE id=$1 AND status IN ('live','review')", [id]).catch(() => null);
}
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const f = await load(params.id);
  if (!f) return meta(`/facilities/${params.id}`, { title: "Care facility", noindex: true });
  const kind = (f.types ?? []).map((t: string) => TYPE[t] ?? t.replace(/_/g, " ")).slice(0, 2).join(" and ") || "Elder care";
  const from = f.monthly_from_paise ? ` From ₹${Math.round(f.monthly_from_paise / 100).toLocaleString("en-IN")} a month.` : "";
  const desc = `${kind} in ${f.locality}, ${f.city}.${from} See care, costs, visiting rules and family reviews, and book a visit on Uday.`.slice(0, 158);
  // Sample listings and listings still under review are not indexed.
  return meta(`/facilities/${f.id}`, { title: `${f.name}, ${f.locality}`, description: desc, noindex: f.sample || f.status !== "live" });
}
export default async function Page({ params }: { params: { id: string } }) {
  const f = await load(params.id);
  return <div className="bg-gradient-to-b from-indigo-50/70 to-paper"><div className="wrap max-w-5xl py-8 sm:py-12">
    {f && !f.sample && f.status === "live" && <JsonLd data={{ "@context": "https://schema.org", "@type": "LocalBusiness", name: f.name, url: `${SITE_URL}/facilities/${f.id}`, description: f.description ?? undefined,
      address: { "@type": "PostalAddress", addressLocality: f.locality, addressRegion: "Maharashtra", addressCountry: "IN" } }} />}
    <FacilityView id={params.id} /></div></div>;
}
