import type { Metadata } from "next";

/**
 * Search engine setup for the public website: one title and description per page, a canonical address,
 * Open Graph and X (Twitter) cards for link previews. Set SITE_URL to the live domain, for example https://uday.care.
 * Only production is indexed: staging and development tell search engines to stay away (see app/robots.ts).
 */
export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const SITE_NAME = "Uday";
export const INDEXABLE = (process.env.UDAY_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development")) === "production";

/** Public pages in one place: the sitemap and every page's metadata read from here. */
export const PAGES = {
  "/": { title: "Uday · Certified caregivers for your parents in Pune", description: "Uday certified caregivers in Pune by the day, night or live in, plus a free daily check in for parents. Verified carers, clear prices, updates from anywhere.", priority: 1, freq: "weekly" },
  "/hire": { title: "Hire a caregiver in Pune", description: "Choose day, night or 24 hour live in care, pick a verified caregiver by tier, ratings and languages, and pay safely. Your payment is held until she accepts.", priority: 0.9, freq: "daily" },
  "/how-it-works": { title: "How home care booking works", description: "From your first request to covered care: how Uday matches a caregiver, holds your payment, confirms each shift with a code and keeps your family informed.", priority: 0.8, freq: "monthly" },
  "/families": { title: "Elder care for families, including NRIs", description: "Reliable home care for your parents in Pune, visible from anywhere. Daily check ins, shift updates and one tap alerts for families in India and abroad.", priority: 0.8, freq: "monthly" },
  "/trust": { title: "Trust and safety", description: "Six checks before a caregiver's first shift: identity, police verification, references, certificates, fitness and academy training. And during every shift.", priority: 0.7, freq: "monthly" },
  "/facilities": { title: "Care homes and assisted living in Pune", description: "Compare elder care facilities in Pune by type, monthly cost, dementia care and visiting rules. Book a visit and use Uday's checklist of what to ask.", priority: 0.8, freq: "weekly" },
  "/careers": { title: "Caregiver jobs in Pune", description: "Join Uday as a caregiver or nurse: fair weekly pay, insurance, free academy training and a path from companion to nursing care. Apply in two minutes.", priority: 0.7, freq: "weekly" },
  "/partners": { title: "Elder care partnerships", description: "Elder care programmes for employers, insurers, banks and housing societies. Give your members certified caregivers and a free daily check in for parents.", priority: 0.5, freq: "monthly" },
  "/partner": { title: "List your care facility", description: "List your care home, assisted living or day care centre on Uday. Reach Pune families looking for elder care, receive visit requests and collect reviews.", priority: 0.5, freq: "monthly" },
  "/about": { title: "About us", description: "Uday means sunrise. Why we started a Pune elder care service that families abroad and at home can trust, and how we treat caregivers.", priority: 0.5, freq: "yearly" },
  "/faq": { title: "Elder care questions and answers", description: "Prices, payment holds, cancellations, caregiver checks, live in care, day offs and the daily check in: answers to what families ask most.", priority: 0.6, freq: "monthly" },
  "/contact": { title: "Contact us", description: "Talk to the Uday team in Pune about home care for your parents, caregiver jobs or partnerships. In an emergency, call 112.", priority: 0.5, freq: "yearly" },
  "/legal": { title: "Privacy and terms", description: "How Uday handles personal and health information, and the terms for families, caregivers and care facilities.", priority: 0.2, freq: "yearly" },
} as const;
export type PagePath = keyof typeof PAGES;

const OG_IMAGE = "/opengraph-image";
export function meta(path: PagePath | string, over: { title?: string; description?: string; noindex?: boolean; type?: "website" | "article" | "profile" } = {}): Metadata {
  const p = (PAGES as Record<string, { title: string; description: string }>)[path];
  const title = over.title ?? p?.title ?? SITE_NAME; const description = over.description ?? p?.description;
  return {
    title: path === "/" ? { absolute: title } : title, description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: SITE_NAME, locale: "en_IN", type: over.type ?? "website", images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Uday: certified caregivers for your parents" }] },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE] },
    robots: over.noindex ? { index: false, follow: false } : undefined,
  };
}
