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
    process.env.STRIPE_OAUTH_CLIENT_ID ?? process.env.STRIPE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      `${baseUrl()}/workspace/integrations?error=stripe_not_configured`,
    );
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const store = await cookies();
  store.set("blockid_stripe_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  const authUrl = new URL("https://connect.stripe.com/oauth/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", "read_only");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set(
    "redirect_uri",
    `${baseUrl()}/api/integrations/stripe/callback`,
  );

  return NextResponse.redirect(authUrl.toString());
}
