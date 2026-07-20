import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectIdFromRequest } from "@/lib/projects";
import { saveConnection, writeSignals, markSynced } from "@/lib/oauth-connectors";
import { fetchGa4Signals, listGa4Properties } from "@/lib/oauth-ga4-signals";

export const dynamic = "force-dynamic";

function baseUrl(): string {
  return (
    process.env.OAUTH_REDIRECT_BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://blockid.au"
  ).replace(/\/$/, "");
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
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
  const expected = store.get("blockid_ga4_state")?.value;
  const propertyHint = store.get("blockid_ga4_property")?.value ?? null;
  store.delete("blockid_ga4_state");
  store.delete("blockid_ga4_property");

  if (errorParam) {
    return NextResponse.redirect(
      `${baseUrl()}/workspace/integrations?error=ga4_${encodeURIComponent(errorParam)}`,
    );
  }

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(
      `${baseUrl()}/workspace/integrations?error=ga4_state_mismatch`,
    );
  }

  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${baseUrl()}/workspace/integrations?error=ga4_not_configured`,
    );
  }

  try {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${baseUrl()}/api/integrations/ga4/callback`,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const tokenJson = (await tokenRes.json()) as GoogleTokenResponse;
    if (!tokenJson.access_token) throw new Error("no_access_token");

    const projectId = await getProjectIdFromRequest();

    const availableProps = await listGa4Properties(tokenJson.access_token);
    const chosen =
      availableProps.find((p) => p.propertyId === propertyHint) ??
      availableProps[0] ??
      null;

    const conn = await saveConnection({
      userId: user.id,
      projectId,
      provider: "ga4",
      providerAccountId: chosen?.propertyId ?? null,
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? null,
      scopes: (tokenJson.scope ?? "").split(" ").filter(Boolean),
      expiresAt: tokenJson.expires_in
        ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
        : null,
      metadata: {
        propertyId: chosen?.propertyId ?? null,
        propertyName: chosen?.displayName ?? null,
        availableProperties: availableProps,
      },
    });

    if (chosen) {
      try {
        const signals = await fetchGa4Signals(
          tokenJson.access_token,
          chosen.propertyId,
        );
        await writeSignals(user.id, projectId, "ga4", [
          { key: "sessions_30d", numeric: signals.sessions30d },
          { key: "new_users_30d", numeric: signals.newUsers30d },
          { key: "conversions_30d", numeric: signals.conversions30d },
          {
            key: "avg_session_duration_sec",
            numeric: signals.averageSessionDurationSec,
          },
        ]);
        if (conn) await markSynced(conn.id);
      } catch (err) {
        if (conn) await markSynced(conn.id, (err as Error).message);
      }
    }

    return NextResponse.redirect(
      `${baseUrl()}/workspace/evidence?connected=ga4`,
    );
  } catch (err) {
    console.error("[blockid:integrations:ga4:callback]", err);
    return NextResponse.redirect(
      `${baseUrl()}/workspace/integrations?error=ga4_exchange_failed`,
    );
  }
}
