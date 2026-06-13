// OAuth evidence connector: Google Analytics (GA4) callback
//
// Exchanges the OAuth code for an access token, fetches GA4 property list
// and basic session/user metrics, then:
//   1. Saves the connection in oauth_connections
//   2. Creates evidence items in svi_evidence (connected_source, 75% confidence)
//   3. Triggers an SVI rescore
//
// Evidence items created:
//   - GA4 properties connected → TRE (traction signal)
//   - Session/user volume → MPC (market penetration)
//   - Engagement rate → PMF (product-market fit proxy)

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";
import { findOrCreateSVIAccount, getProjectIdFromRequest } from "@/lib/projects";

export const dynamic = "force-dynamic";

interface GA4AccountSummary {
  name: string;
  displayName: string;
  propertySummaries?: { property: string; displayName: string }[];
}

interface GA4RunReportResponse {
  rows?: { dimensionValues?: unknown[]; metricValues?: { value: string }[] }[];
  totals?: { metricValues?: { value: string }[] }[];
}

async function fetchGA4Metrics(
  propertyId: string,
  accessToken: string,
): Promise<{ sessions: number; users: number; engagementRate: number } | null> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const today = new Date().toISOString().split("T")[0];

    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: thirtyDaysAgo, endDate: today }],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "engagementRate" },
          ],
        }),
      },
    );

    if (!res.ok) return null;
    const data: GA4RunReportResponse = await res.json();
    const totals = data.totals?.[0]?.metricValues;
    if (!totals || totals.length < 3) return null;

    return {
      sessions: parseInt(totals[0]?.value ?? "0", 10),
      users: parseInt(totals[1]?.value ?? "0", 10),
      engagementRate: parseFloat(totals[2]?.value ?? "0"),
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";

  if (errorParam) {
    return NextResponse.redirect(
      `${siteUrl}/workspace/evidence?error=analytics_${encodeURIComponent(errorParam)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=analytics_missing_code`);
  }

  let stateData: { email?: string; csrf?: string };
  try {
    stateData = JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=analytics_invalid_state`);
  }

  const email = stateData.email;
  if (!email) {
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=analytics_no_email`);
  }

  // Verify CSRF
  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value ?? "";
  if (!stateData.csrf || stateData.csrf !== sessionToken.slice(0, 16)) {
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=analytics_csrf_mismatch`);
  }

  const redirectUri = `${siteUrl}/api/oauth/ga4/callback`;

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error("No access token from Google");
    }

    const accessToken: string = tokenData.access_token;

    // 2. Fetch GA4 property list
    const propertiesRes = await fetch(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const propertiesData = await propertiesRes.json();

    const propertySummaries: { property: string; displayName: string }[] = (
      (propertiesData.accountSummaries as GA4AccountSummary[] | undefined) ?? []
    ).flatMap((acct) => acct.propertySummaries ?? []);

    const propertyCount = propertySummaries.length;

    // 3. Fetch metrics for the first property if available
    let metrics: { sessions: number; users: number; engagementRate: number } | null = null;
    if (propertySummaries.length > 0) {
      metrics = await fetchGA4Metrics(propertySummaries[0].property, accessToken);
    }

    // 4. Calculate SVI impact
    let sviImpact = 8; // base: connected
    if (metrics) {
      if (metrics.sessions > 10000) sviImpact = 18;
      else if (metrics.sessions > 1000) sviImpact = 14;
      else if (metrics.sessions > 100) sviImpact = 11;
    }

    const sessionDisplay = metrics
      ? `${metrics.sessions.toLocaleString()} sessions/mo`
      : `${propertyCount} propert${propertyCount === 1 ? "y" : "ies"}`;
    const label = `Google Analytics: ${sessionDisplay}`;

    // 5. Save to database
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=analytics_db_unavailable`);
    }

    const projectId = await getProjectIdFromRequest();
    const accountId = await findOrCreateSVIAccount(email, projectId);
    if (!accountId) {
      return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=analytics_account_failed`);
    }

    // Save OAuth connection
    await supabase.from("oauth_connections").upsert(
      {
        account_id: accountId,
        provider: "analytics",
        provider_user_id: email,
        access_token: accessToken,
        refresh_token: tokenData.refresh_token ?? null,
        raw_profile: JSON.stringify({
          propertyCount,
          properties: propertySummaries.slice(0, 5),
        }),
        connected_at: new Date().toISOString(),
      },
      { onConflict: "account_id,provider" },
    );

    // Upsert traction evidence (TRE)
    const { data: existingTre } = await supabase
      .from("svi_evidence")
      .select("id")
      .eq("account_id", accountId)
      .eq("evidence_type", "analytics")
      .eq("dimension", "tre")
      .maybeSingle();

    const trePayload = {
      account_id: accountId,
      evidence_type: "analytics" as const,
      label,
      value_or_url: JSON.stringify({
        connected: true,
        properties: propertySummaries.slice(0, 5),
        sessions: metrics?.sessions ?? null,
        users: metrics?.users ?? null,
        engagementRate: metrics?.engagementRate ?? null,
        connected_at: new Date().toISOString(),
      }),
      confidence_level: "connected_source" as const,
      dimension: "tre",
      svi_impact: sviImpact,
      verified_at: new Date().toISOString(),
    };

    if (existingTre) {
      await supabase.from("svi_evidence").update(trePayload).eq("id", existingTre.id);
    } else {
      await supabase.from("svi_evidence").insert({ ...trePayload, created_at: new Date().toISOString() });
    }

    // Upsert product-market fit signal (PMF) if engagement rate is strong
    if (metrics && metrics.engagementRate > 0.4) {
      const { data: existingPmf } = await supabase
        .from("svi_evidence")
        .select("id")
        .eq("account_id", accountId)
        .eq("evidence_type", "analytics")
        .eq("dimension", "pmf")
        .maybeSingle();

      const engPct = Math.round(metrics.engagementRate * 100);
      const pmfPayload = {
        account_id: accountId,
        evidence_type: "analytics" as const,
        label: `GA4 Engagement: ${engPct}% rate (${metrics.users.toLocaleString()} users)`,
        value_or_url: String(metrics.engagementRate),
        confidence_level: "connected_source" as const,
        dimension: "pmf",
        svi_impact: metrics.engagementRate > 0.65 ? 8 : 5,
        verified_at: new Date().toISOString(),
      };

      if (existingPmf) {
        await supabase.from("svi_evidence").update(pmfPayload).eq("id", existingPmf.id);
      } else {
        await supabase.from("svi_evidence").insert({ ...pmfPayload, created_at: new Date().toISOString() });
      }
    }

    // 6. Trigger SVI rescore
    const cookieHeader = request.headers.get("cookie") ?? "";
    void fetch(`${siteUrl}/api/svi/rescore-from-evidence`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
    }).catch(() => {});

    return NextResponse.redirect(`${siteUrl}/workspace/evidence?connected=analytics`);
  } catch (err) {
    console.error("[blockid:oauth:ga4] callback error", err);
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=analytics_failed`);
  }
}
