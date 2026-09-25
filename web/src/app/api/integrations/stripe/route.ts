import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { projectScopeOrRedirect } from "@/lib/project-members/http";
import { createStripeOAuthState, STRIPE_STATE_COOKIE, STRIPE_STATE_TTL_SECONDS } from "@/lib/connectors/stripe-oauth-state";

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
      `${baseUrl()}/auth/login?next=/workspace/evidence/connectors`,
    );
  }

  const clientId =
    process.env.STRIPE_OAUTH_CLIENT_ID ?? process.env.STRIPE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      `${baseUrl()}/workspace/evidence/connectors?error=stripe_not_configured`,
    );
  }

  const { scope, denied } = await projectScopeOrRedirect("admin", `${baseUrl()}/workspace/evidence/connectors`, "stripe_forbidden_role");
  if (denied) return denied;
  let grant: ReturnType<typeof createStripeOAuthState>;
  try {
    grant = createStripeOAuthState({ userId: user.id, projectId: scope?.projectId ?? null, ownerUserId: scope?.ownerUserId ?? user.id });
  } catch {
    return NextResponse.redirect(`${baseUrl()}/workspace/evidence/connectors?error=stripe_not_configured`);
  }
  const { state } = grant;
  const store = await cookies();
  store.set(STRIPE_STATE_COOKIE, grant.cookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: STRIPE_STATE_TTL_SECONDS,
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
