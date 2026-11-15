import { NextResponse, type NextRequest } from "next/server";
// CORS for the mobile app's web build and Expo development only. Native apps do not need CORS.
// ALLOWED_ORIGINS is a comma separated list, for example http://localhost:8081. Empty means no cross origin access.
export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = origin && allowed.includes(origin);
  const h: Record<string, string> = ok ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS", Vary: "Origin" } : {};
  if (req.method === "OPTIONS") return new NextResponse(null, { status: ok ? 204 : 403, headers: h });
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(h)) res.headers.set(k, v);
  return res;
}
export const config = { matcher: "/api/:path*" };
