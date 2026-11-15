import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (<><a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-indigo-900 focus:px-3 focus:py-2 focus:text-white">Skip to content</a><Header /><main id="main">{children}</main><Footer /></>);
}
