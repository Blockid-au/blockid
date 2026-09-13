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
import { connectorProbeHeaders } from "@/lib/oauth/connector-probe";

export const dynamic = "force-dynamic";

// HEAD /api/oauth/xero — check if Xero OAuth is configured
// Release QA-2 F11: always 204 + `X-Connector-Configured: true|false` —
// "not configured" is a state, not a 5xx (see lib/oauth/connector-probe.ts).
export async function HEAD() {
  const configured = Boolean(process.env.XERO_CLIENT_ID);
  return new NextResponse(null, { status: 204, headers: connectorProbeHeaders(configured) });
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
  // S25-A — `offline_access` is what makes Xero return a refresh token (the
  // weekly resync cannot run without one: access tokens live 30 minutes) and
  // `accounting.reports.read` is the scope the P&L / BankSummary reports the
  // callback + resync pull actually require.
  url.searchParams.set(
    "scope",
    "openid profile email offline_access accounting.transactions accounting.contacts accounting.reports.read",
  );
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
