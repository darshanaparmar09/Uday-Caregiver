import { ImageResponse } from "next/og";
export const runtime = "nodejs";
export const alt = "Uday: certified caregivers for your parents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
/** The picture shown when a page of the website is shared on WhatsApp, LinkedIn or X. */
export default function Image() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(180deg, #1A1040 0%, #2A1B5E 62%, #8A3F2A 100%)", color: "#fff", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="72" height="72" viewBox="0 0 30 30"><rect width="30" height="30" rx="9" fill="#120B30" /><path d="M6 20a9 9 0 0 1 18 0z" fill="#F7A23B" /><path d="M5 22.5h20" stroke="#F5891F" strokeWidth="1.6" strokeLinecap="round" /></svg>
        <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: -1 }}>uday</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, maxWidth: 950 }}>Certified caregivers for your parents</div>
        <div style={{ fontSize: 32, color: "#FFD9A8" }}>Day, night or live in care · Free daily check in · Across India</div>
      </div>
      <div style={{ position: "absolute", right: -120, bottom: -260, width: 620, height: 620, borderRadius: 620, background: "radial-gradient(circle, #FFC56B 0%, #F5891F 45%, rgba(245,137,31,0) 70%)", display: "flex" }} />
    </div>, size);
}
