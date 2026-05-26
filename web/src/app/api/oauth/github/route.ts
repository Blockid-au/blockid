// OAuth evidence connector: GitHub
//
// Requires env vars:
//   GITHUB_CLIENT_ID     — GitHub OAuth App client ID
//   GITHUB_CLIENT_SECRET — GitHub OAuth App client secret
//
// This route is separate from /api/auth/github (login). It connects a user's
// GitHub account as an evidence source for the SVI Evidence Vault.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// HEAD /api/oauth/github — check if GitHub OAuth is configured
// Used by the Evidence Wizard and ConnectButtons to show availability.
// Returns 200 if configured, 503 if not.
export async function HEAD() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return new NextResponse(null, { status: 503 });
  }
  return new NextResponse(null, { status: 200 });
}

// GET /api/oauth/github — redirect to GitHub OAuth authorization
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
    return NextResponse.redirect(`${siteUrl}/auth/login?next=/workspace/evidence`);
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: "GitHub OAuth not configured" },
      { status: 503 },
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
  const redirectUri = `${siteUrl}/api/oauth/github/callback`;
  const scope = "read:user,repo";

  // Use the session token as CSRF state to verify on callback
  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value ?? "";
  const state = Buffer.from(
    JSON.stringify({ email: user.email, csrf: sessionToken.slice(0, 16) }),
  ).toString("base64url");

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
