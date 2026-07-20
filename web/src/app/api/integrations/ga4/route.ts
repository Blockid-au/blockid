import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function baseUrl(): string {
  return (
    process.env.OAUTH_REDIRECT_BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://blockid.au"
  ).replace(/\/$/, "");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("action") !== "start") {
    return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(
      `${baseUrl()}/auth/login?next=/workspace/integrations`,
    );
  }

  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      `${baseUrl()}/workspace/integrations?error=ga4_not_configured`,
    );
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const store = await cookies();
  store.set("blockid_ga4_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  const propertyId = url.searchParams.get("propertyId");
  if (propertyId) {
    store.set("blockid_ga4_property", propertyId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/",
    });
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/analytics.readonly",
  );
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set(
    "redirect_uri",
    `${baseUrl()}/api/integrations/ga4/callback`,
  );

  return NextResponse.redirect(authUrl.toString());
}
