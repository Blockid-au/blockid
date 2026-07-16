// Root middleware — runs before every non-static request.
//
// Currently responsible for:
//   * Seeding the `bid_jur` jurisdiction cookie so downstream RSC/SSR reads
//     have a stable declared jurisdiction to render against. Preference is:
//       1. Keep any existing cookie value (user's declared choice wins).
//       2. Otherwise use the Cloudflare / Vercel IP-country header.
//       3. Otherwise default to 'AU' with 30-day expiry (per CISO spec).
//
// This file is intentionally minimal and dependency-free (no supabase, no
// heavy imports) so it stays edge-safe. Deeper jurisdiction triangulation
// (billing address, declared vs. IP conflict) lives in lib/jurisdiction.ts
// and runs in Node route handlers.

import { NextResponse, type NextRequest } from "next/server";

const JUR_COOKIE = "bid_jur";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function ipCountryFromHeaders(req: NextRequest): string | null {
  const candidates = [
    req.headers.get("cf-ipcountry"),
    req.headers.get("x-vercel-ip-country"),
    req.headers.get("x-country"),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const v = raw.trim().toUpperCase();
    if (v && v.length === 2 && v !== "XX") return v;
  }
  return null;
}

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const existing = req.cookies.get(JUR_COOKIE)?.value;
  if (!existing) {
    const country = ipCountryFromHeaders(req) || "AU";
    res.cookies.set({
      name: JUR_COOKIE,
      value: country,
      maxAge: COOKIE_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      // Do not set httpOnly — the client-side jurisdiction switcher reads it.
      secure: process.env.NODE_ENV === "production",
    });
  }

  return res;
}

// Skip static assets, images, and Next internals — the cookie is only useful
// on real page/API traffic.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf|css|js|map)$).*)",
  ],
};
