import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Uday · Care for your parents", short_name: "Uday", start_url: "/", display: "standalone", background_color: "#1A1040", theme_color: "#1A1040", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] };
}
