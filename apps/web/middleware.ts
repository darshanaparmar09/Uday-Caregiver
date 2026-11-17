import { NextResponse, type NextRequest } from "next/server";
// CORS for the mobile app's web build and Expo development only. Native apps do not need CORS.
// ALLOWED_ORIGINS is a comma separated list, for example http://localhost:8081. Empty means no cross origin access.
export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = origin && allowed.includes(origin);
  const h: Record<string, string> = ok ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Op", "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS", Vary: "Origin" } : {};
  if (req.method === "OPTIONS") return new NextResponse(null, { status: ok ? 204 : 403, headers: h });
  // Refuse oversized bodies before they are read into memory (uploads are base64 JSON, 5 MB files at most).
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 9_000_000) return NextResponse.json({ error: "That is too large to upload." }, { status: 413, headers: h });
  // Cookie sessions: a state changing request must come from our own pages (defence in depth on top of SameSite=Lax).
  if (!["GET", "HEAD"].includes(req.method) && origin && !ok && !req.headers.get("authorization")) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    try { if (new URL(origin).host !== host) return NextResponse.json({ error: "Cross site request refused." }, { status: 403 }); } catch { return NextResponse.json({ error: "Cross site request refused." }, { status: 403 }); }
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(h)) res.headers.set(k, v);
  return res;
}
export const config = { matcher: "/api/:path*" };
