// OAuth evidence connector: GitHub callback
//
// Exchanges the OAuth code for an access token, fetches the user's GitHub
// profile and repos, then saves the data as connected_source evidence in
// svi_evidence. Triggers an SVI rescore afterwards.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface GitHubUser {
  login: string;
  html_url: string;
  public_repos: number;
  followers: number;
  bio: string | null;
}

interface GitHubRepo {
  full_name: string;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  description: string | null;
}

// Find or create svi_account by email, return account id
async function findOrCreateAccount(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  email: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("svi_accounts")
    .insert({
      email,
      last_active_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[blockid:oauth:github] svi_accounts insert failed", error);
    return null;
  }
  return created.id as string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/workspace/evidence?error=github_missing_code", request.url),
    );
  }

  // Decode state to retrieve email and verify CSRF
  let stateData: { email?: string; csrf?: string };
  try {
    stateData = JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    return NextResponse.redirect(
      new URL("/workspace/evidence?error=github_invalid_state", request.url),
    );
  }

  const email = stateData.email;
  if (!email) {
    return NextResponse.redirect(
      new URL("/workspace/evidence?error=github_no_email", request.url),
    );
  }

  // Verify CSRF: first 16 chars of session token must match
  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value ?? "";
  if (stateData.csrf && stateData.csrf !== sessionToken.slice(0, 16)) {
    return NextResponse.redirect(
      new URL("/workspace/evidence?error=github_csrf_mismatch", request.url),
    );
  }

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error("No access token returned from GitHub");
    }

    const ghHeaders = { Authorization: `Bearer ${tokenData.access_token}` };

    // 2. Fetch user profile
    const userRes = await fetch("https://api.github.com/user", { headers: ghHeaders });
    const ghUser: GitHubUser = await userRes.json();

    // 3. Fetch repos (sorted by recent update, top 10)
    const reposRes = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=10&type=owner",
      { headers: ghHeaders },
    );
    const repos: GitHubRepo[] = await reposRes.json();

    // 4. Extract signals
    const totalRepos = ghUser.public_repos ?? 0;
    const totalStars = Array.isArray(repos)
      ? repos.reduce((sum, r) => sum + (r.stargazers_count ?? 0), 0)
      : 0;
    const languages = Array.isArray(repos)
      ? [...new Set(repos.map((r) => r.language).filter(Boolean))]
      : [];
    const topRepos = (Array.isArray(repos) ? repos : []).slice(0, 5).map((r) => ({
      name: r.full_name,
      url: r.html_url,
      language: r.language,
      stars: r.stargazers_count,
      updated: r.updated_at,
      description: r.description,
    }));

    // Calculate SVI impact: base 5, +1 per 5 repos (max +3), +1 per 10 stars (max +4)
    const repoBonus = Math.min(3, Math.floor(totalRepos / 5));
    const starBonus = Math.min(4, Math.floor(totalStars / 10));
    const sviImpact = Math.min(12, Math.max(5, 5 + repoBonus + starBonus));

    const label = `GitHub: ${ghUser.login} \u2014 ${totalRepos} repos, ${totalStars} stars`;

    // 5. Save as evidence
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const accountId = await findOrCreateAccount(supabase, email);
      if (accountId) {
        // Check if GitHub evidence already exists for this account
        const { data: existingEvidence } = await supabase
          .from("svi_evidence")
          .select("id")
          .eq("account_id", accountId)
          .eq("evidence_type", "github")
          .eq("confidence_level", "connected_source")
          .maybeSingle();

        const evidencePayload = {
          account_id: accountId,
          evidence_type: "github" as const,
          label,
          value_or_url: ghUser.html_url,
          confidence_level: "connected_source" as const,
          dimension: "ptd",
          svi_impact: sviImpact,
          metadata: JSON.stringify({
            username: ghUser.login,
            profile_url: ghUser.html_url,
            public_repos: totalRepos,
            total_stars: totalStars,
            followers: ghUser.followers,
            languages,
            repos: topRepos,
          }),
          verified_at: new Date().toISOString(),
        };

        if (existingEvidence) {
          // Update existing evidence
          await supabase
            .from("svi_evidence")
            .update(evidencePayload)
            .eq("id", existingEvidence.id);
        } else {
          // Insert new evidence
          await supabase.from("svi_evidence").insert({
            ...evidencePayload,
            created_at: new Date().toISOString(),
          });
        }

        // 6. Trigger rescore (fire-and-forget)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
        const cookieHeader = request.headers.get("cookie") ?? "";
        void fetch(`${siteUrl}/api/evidence/rescore`, {
          method: "POST",
          headers: { Cookie: cookieHeader },
        }).catch(() => {});
        void fetch(`${siteUrl}/api/svi/rescore-from-evidence`, {
          method: "POST",
          headers: { Cookie: cookieHeader },
        }).catch(() => {});
      }
    }

    // 7. Redirect to evidence vault with success param
    return NextResponse.redirect(
      new URL("/workspace/evidence?connected=github", request.url),
    );
  } catch (err) {
    console.error("[blockid:oauth:github] callback error", err);
    return NextResponse.redirect(
      new URL("/workspace/evidence?error=github_failed", request.url),
    );
  }
}
