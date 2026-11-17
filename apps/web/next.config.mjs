/** @type {import('next').NextConfig} */
// Content Security Policy. Inline scripts are allowed because Next.js injects them; every other source is named.
// Razorpay Checkout, the Leaflet map (unpkg + OpenStreetMap tiles) and Google Fonts are the only outside hosts.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://unpkg.com https://*.razorpay.com",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://*.razorpay.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com https://www.google.com",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join("; ");
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self \"https://checkout.razorpay.com\")" },
  { key: "Content-Security-Policy", value: csp },
];
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@uday/core"],
  experimental: { serverComponentsExternalPackages: ["pg", "exceljs"], instrumentationHook: true },
  async headers() { return [
    { source: "/:path*", headers: securityHeaders },
    // Signed in pages and API answers are never cached by browsers or proxies.
    { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
  ]; },
};
