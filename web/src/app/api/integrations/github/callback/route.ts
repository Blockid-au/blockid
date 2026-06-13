import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  findOrCreateSVIAccount,
  getProjectIdFromRequest,
} from "@/lib/projects";
import {
  exchangeCodeForToken,
  fetchRepoStats,
  fetchTopRepo,
} from "@/lib/github";

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
  const expectedState = c.get("github_oauth_state")?.value;
  c.delete("github_oauth_state");

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(
      `${siteUrl()}/dashboard/integrations?error=oauth_state_mismatch`,
    );
  }

  const redirectUri = `${siteUrl()}/api/integrations/github/callback`;
  const token = await exchangeCodeForToken(code, redirectUri);
  if (!token) {
    return NextResponse.redirect(
      `${siteUrl()}/dashboard/integrations?error=oauth_exchange_failed`,
    );
  }

  const top = await fetchTopRepo(token);
  if (!top) {
    return NextResponse.redirect(
      `${siteUrl()}/dashboard/integrations?error=no_public_repos`,
    );
  }

  const stats = await fetchRepoStats(top.owner, top.repo, token);
  if (!stats) {
    return NextResponse.redirect(
      `${siteUrl()}/dashboard/integrations?error=stats_failed`,
    );
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const projectId = await getProjectIdFromRequest();
    const accountId = await findOrCreateSVIAccount(user.email, projectId);
    if (accountId) {
      const impact = Math.min(
        10,
        4 +
          (stats.commitsLast90 >= 30 ? 4 : stats.commitsLast90 >= 10 ? 2 : 0) +
          (stats.stars >= 100 ? 3 : stats.stars >= 10 ? 1 : 0),
      );
      await supabase
        .from("svi_evidence")
        .delete()
        .eq("account_id", accountId)
        .eq("evidence_type", "github_repo");
      await supabase.from("svi_evidence").insert({
        account_id: accountId,
        evidence_type: "github_repo",
        label: `GitHub · ${stats.owner}/${stats.repo}`,
        value_or_url: stats.url,
        confidence_level: "verified",
        dimension: "ptd",
        svi_impact: impact,
        verified_at: new Date().toISOString(),
        project_id: projectId,
      });
    }
  }

  return NextResponse.redirect(
    `${siteUrl()}/dashboard/integrations?connected=github`,
  );
}
