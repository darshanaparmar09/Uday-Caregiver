import type { MetadataRoute } from "next";
import { PAGES, SITE_URL } from "@/lib/seo";
import { q } from "@/lib/db";
export const dynamic = "force-dynamic";
export const revalidate = 3600;
/** sitemap.xml: every public page plus live, real care facility listings (sample listings are left out). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages = Object.entries(PAGES).map(([path, p]) => ({ url: SITE_URL + (path === "/" ? "" : path), lastModified: now, changeFrequency: p.freq, priority: p.priority }));
  const fac = await q<{ id: string; updated_at: Date }>("SELECT id, updated_at FROM facilities WHERE status='live' AND NOT sample ORDER BY updated_at DESC LIMIT 5000").catch(() => []);
  return [...pages, ...fac.map((f) => ({ url: `${SITE_URL}/facilities/${f.id}`, lastModified: f.updated_at ?? now, changeFrequency: "weekly" as const, priority: 0.6 }))];
}
