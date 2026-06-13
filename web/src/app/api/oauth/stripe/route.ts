// OAuth evidence connector: Stripe Connect
//
// Requires env vars:
//   STRIPE_CLIENT_ID — Stripe Connect platform client_id
//
// Redirects users to Stripe OAuth to authorize read-only access to their
// Stripe account as evidence for the SVI Evidence Vault.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// HEAD /api/oauth/stripe — check if Stripe OAuth is configured
export async function HEAD() {
  const clientId = process.env.STRIPE_CLIENT_ID;
  if (!clientId) {
    return new NextResponse(null, { status: 503 });
  }
  return new NextResponse(null, { status: 200 });
}

// GET /api/oauth/stripe — redirect to Stripe Connect OAuth authorization
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
    return NextResponse.redirect(`${siteUrl}/auth/login?next=/workspace/evidence`);
  }

  const clientId = process.env.STRIPE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: "Stripe OAuth not configured" },
      { status: 503 },
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
  const redirectUri = `${siteUrl}/api/oauth/stripe/callback`;

  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value ?? "";
  const state = Buffer.from(
    JSON.stringify({ email: user.email, csrf: sessionToken.slice(0, 16) }),
  ).toString("base64url");

  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "read_only");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
