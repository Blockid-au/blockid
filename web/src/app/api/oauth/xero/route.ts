// OAuth evidence connector: Xero
//
// Requires env vars:
//   XERO_CLIENT_ID — Xero OAuth app client_id
//   XERO_CLIENT_SECRET — Xero OAuth app client_secret
//
// Redirects users to Xero OAuth to authorize read access to their
// Xero organisation as evidence for the SVI Evidence Vault.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// HEAD /api/oauth/xero — check if Xero OAuth is configured
export async function HEAD() {
  const clientId = process.env.XERO_CLIENT_ID;
  if (!clientId) {
    return new NextResponse(null, { status: 503 });
  }
  return new NextResponse(null, { status: 200 });
}

// GET /api/oauth/xero — redirect to Xero OAuth authorization
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
    return NextResponse.redirect(`${siteUrl}/auth/login?next=/workspace/evidence`);
  }

  const clientId = process.env.XERO_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: "Xero OAuth not configured" },
      { status: 503 },
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
  const callbackUrl = `${siteUrl}/api/oauth/xero/callback`;

  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value ?? "";
  const state = Buffer.from(
    JSON.stringify({ email: user.email, csrf: sessionToken.slice(0, 16) }),
  ).toString("base64url");

  const url = new URL("https://login.xero.com/identity/connect/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", "openid profile email accounting.transactions accounting.contacts");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
