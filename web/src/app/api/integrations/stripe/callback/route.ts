import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectIdFromRequest } from "@/lib/projects";
import { saveConnection, writeSignals, markSynced } from "@/lib/oauth-connectors";
import { fetchStripeSignals } from "@/lib/oauth-stripe-signals";

export const dynamic = "force-dynamic";

function baseUrl(): string {
  return (
    process.env.OAUTH_REDIRECT_BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://blockid.au"
  ).replace(/\/$/, "");
}

interface StripeTokenResponse {
  access_token?: string;
  refresh_token?: string;
  stripe_user_id?: string;
  scope?: string;
  livemode?: boolean;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(`${baseUrl()}/auth/login`);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const store = await cookies();
  const expected = store.get("blockid_stripe_state")?.value;
  store.delete("blockid_stripe_state");

  if (errorParam) {
    return NextResponse.redirect(
      `${baseUrl()}/workspace/integrations?error=stripe_${encodeURIComponent(errorParam)}`,
    );
  }

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(
      `${baseUrl()}/workspace/integrations?error=stripe_state_mismatch`,
    );
  }

  const clientSecret =
    process.env.STRIPE_OAUTH_CLIENT_SECRET ??
    process.env.STRIPE_CLIENT_SECRET ??
    process.env.STRIPE_SECRET_KEY;
  if (!clientSecret) {
    return NextResponse.redirect(
      `${baseUrl()}/workspace/integrations?error=stripe_not_configured`,
    );
  }

  try {
    const body = new URLSearchParams({
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    });
    const tokenRes = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const tokenJson = (await tokenRes.json()) as StripeTokenResponse;
    if (!tokenJson.access_token || !tokenJson.stripe_user_id) {
      throw new Error(tokenJson.error_description ?? "no_access_token");
    }

    const projectId = await getProjectIdFromRequest();

    const conn = await saveConnection({
      userId: user.id,
      projectId,
      provider: "stripe",
      providerAccountId: tokenJson.stripe_user_id,
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? null,
      scopes: (tokenJson.scope ?? "").split(",").filter(Boolean),
      metadata: {
        stripe_user_id: tokenJson.stripe_user_id,
        livemode: tokenJson.livemode ?? false,
      },
    });

    try {
      const signals = await fetchStripeSignals(tokenJson.access_token);
      await writeSignals(user.id, projectId, "stripe", [
        { key: "mrr_aud", numeric: signals.mrrAud },
        { key: "active_customers", numeric: signals.activeCustomers },
        { key: "recent_payments_30d", numeric: signals.recentPayments30d },
        { key: "average_order_aud", numeric: signals.averageOrderAud },
      ]);
      if (conn) await markSynced(conn.id);
    } catch (err) {
      if (conn) await markSynced(conn.id, (err as Error).message);
    }

    return NextResponse.redirect(
      `${baseUrl()}/workspace/evidence?connected=stripe`,
    );
  } catch (err) {
    console.error("[blockid:integrations:stripe:callback]", err);
    return NextResponse.redirect(
      `${baseUrl()}/workspace/integrations?error=stripe_exchange_failed`,
    );
  }
}
