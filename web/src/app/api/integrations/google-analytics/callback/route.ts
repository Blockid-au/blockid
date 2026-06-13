import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  findOrCreateSVIAccount,
  getProjectIdFromRequest,
} from "@/lib/projects";
import {
  exchangeGoogleCodeForTokens,
  fetchFirstGa4Property,
  fetchGa4Stats,
  scoreGa4Stats,
} from "@/lib/google-analytics-oauth";

export const dynamic = "force-dynamic";

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(`${siteUrl()}/auth/login`);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const c = await cookies();
  const expectedState = c.get("ga_oauth_state")?.value;
  c.delete("ga_oauth_state");

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(
      `${siteUrl()}/dashboard/integrations?error=ga_oauth_state_mismatch`,
    );
  }

  const redirectUri = `${siteUrl()}/api/integrations/google-analytics/callback`;
  const tokens = await exchangeGoogleCodeForTokens(code, redirectUri);
  if (!tokens) {
    return NextResponse.redirect(
      `${siteUrl()}/dashboard/integrations?error=ga_oauth_exchange_failed`,
    );
  }

  const property = await fetchFirstGa4Property(tokens.accessToken);
  if (!property) {
    return NextResponse.redirect(
      `${siteUrl()}/dashboard/integrations?error=ga_no_properties`,
    );
  }

  const stats = await fetchGa4Stats(tokens.accessToken, property, 30);
  if (!stats) {
    return NextResponse.redirect(
      `${siteUrl()}/dashboard/integrations?error=ga_stats_failed`,
    );
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const projectId = await getProjectIdFromRequest();
    const accountId = await findOrCreateSVIAccount(user.email, projectId);
    if (accountId) {
      const impact = scoreGa4Stats(stats);
      await supabase
        .from("svi_evidence")
        .delete()
        .eq("account_id", accountId)
        .eq("evidence_type", "google_analytics");
      await supabase.from("svi_evidence").insert({
        account_id: accountId,
        evidence_type: "google_analytics",
        label: `GA4 · ${stats.displayName}`,
        value_or_url: `${stats.monthlySessions.toLocaleString()} sessions / 30d · ${stats.bounceRatePct}% bounce`,
        confidence_level: "verified",
        dimension: "mkt",
        svi_impact: impact,
        verified_at: new Date().toISOString(),
        project_id: projectId,
      });
    }
  }

  return NextResponse.redirect(
    `${siteUrl()}/dashboard/integrations?connected=google_analytics`,
  );
}
