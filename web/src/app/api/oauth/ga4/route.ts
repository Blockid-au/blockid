// OAuth evidence connector: Google Analytics (GA4)
//
// Requires env vars:
//   GOOGLE_CLIENT_ID     — Google OAuth App client ID
//   GOOGLE_CLIENT_SECRET — Google OAuth App client secret
//
// Connects the user's Google Analytics account as an evidence source for
// the SVI Evidence Vault. Uses Google OAuth with analytics.readonly scope.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// HEAD /api/oauth/ga4 — check if Google Analytics OAuth is configured
export async function HEAD() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return new NextResponse(null, { status: 503 });
  }
  return new NextResponse(null, { status: 200 });
}

// GET /api/oauth/ga4 — redirect to Google OAuth authorization
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
    return NextResponse.redirect(`${siteUrl}/auth/login?next=/workspace/evidence`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: "Google Analytics OAuth not configured" },
      { status: 503 },
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
  const redirectUri = `${siteUrl}/api/oauth/ga4/callback`;

  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value ?? "";
  const state = Buffer.from(
    JSON.stringify({ email: user.email, csrf: sessionToken.slice(0, 16) }),
  ).toString("base64url");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/analytics.readonly");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return NextResponse.redirect(url.toString());
}
