import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL } from "@/lib/seo";
export const dynamic = "force-dynamic";
/** robots.txt. Staging and development block all crawlers so test pages never appear in search. */
export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/ops", "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL,
  };
}
