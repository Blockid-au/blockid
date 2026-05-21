// OAuth evidence connector: LinkedIn
//
// Requires env vars:
//   LINKEDIN_CLIENT_ID     — LinkedIn OAuth App client ID
//   LINKEDIN_CLIENT_SECRET — LinkedIn OAuth App client secret
//
// Connects a founder's LinkedIn profile as an evidence source for the SVI
// Evidence Vault. Uses "Sign In with LinkedIn using OpenID Connect".

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// HEAD /api/oauth/linkedin — check if LinkedIn OAuth is configured
export async function HEAD() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    return new NextResponse(null, { status: 503 });
  }
  return new NextResponse(null, { status: 200 });
}

// GET /api/oauth/linkedin — redirect to LinkedIn OAuth authorization
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/auth/login?next=/workspace/evidence", request.url),
    );
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: "LinkedIn OAuth not configured" },
      { status: 503 },
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
  const redirectUri = `${siteUrl}/api/oauth/linkedin/callback`;
  // OpenID Connect scopes: profile info + email
  const scope = "openid profile email";

  // Use the session token as CSRF state to verify on callback
  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value ?? "";
  const state = Buffer.from(
    JSON.stringify({ email: user.email, csrf: sessionToken.slice(0, 16) }),
  ).toString("base64url");

  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
