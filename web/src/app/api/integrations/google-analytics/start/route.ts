import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/auth";
import {
  buildGoogleAuthorizeUrl,
  isGoogleAnalyticsOAuthConfigured,
} from "@/lib/google-analytics-oauth";

export const dynamic = "force-dynamic";

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(
      `${siteUrl()}/auth/login?next=/dashboard/integrations`,
    );
  }
  if (!isGoogleAnalyticsOAuthConfigured()) {
    return NextResponse.redirect(
      `${siteUrl()}/dashboard/integrations?error=ga_oauth_not_configured`,
    );
  }

  const state = nanoid(24);
  const c = await cookies();
  c.set("ga_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 15,
    secure: process.env.NODE_ENV === "production",
  });

  const redirectUri = `${siteUrl()}/api/integrations/google-analytics/callback`;
  return NextResponse.redirect(buildGoogleAuthorizeUrl(state, redirectUri));
}
