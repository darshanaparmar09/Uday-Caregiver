import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Uday · Certified caregivers for your parents", template: "%s · Uday" },
  description: "Uday is a care marketplace for Pune: Uday certified caregivers by day, night or live in, with a free daily wellness check in for parents.",
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  applicationName: "Uday", formatDetection: { telephone: false },
  // Search Console and Bing verification codes, once the domain is added there.
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION || undefined, other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined },
};
export const viewport: Viewport = { themeColor: "#1A1040", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
