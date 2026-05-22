// OAuth evidence connector: GitHub callback
//
// Exchanges the OAuth code for an access token, fetches the user's GitHub
// profile, repos, and commit activity, then:
//   1. Saves the connection in oauth_connections
//   2. Creates evidence items in svi_evidence (connected_source, 75% confidence)
//   3. Triggers an SVI rescore
//
// Evidence items created:
//   - hasSourceCode = true (just connecting = signal)
//   - hasProduct = true (if repos have README + recent commits)
//   - Commit frequency → traction signal (>10 commits/week = strong)
//   - Public vs private repos → product maturity signal

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";
import { auditGitHubRepo, type GitHubRepoAudit } from "@/lib/github-repo-audit";
import { findOrCreateSVIAccount, getProjectIdFromRequest } from "@/lib/projects";

export const dynamic = "force-dynamic";

interface GitHubUser {
  login: string;
  html_url: string;
  public_repos: number;
  total_private_repos?: number;
  followers: number;
  bio: string | null;
  created_at: string;
}

interface GitHubRepo {
  full_name: string;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  pushed_at: string;
  description: string | null;
  private: boolean;
  has_pages: boolean;
  homepage: string | null;
  default_branch: string;
  fork: boolean;
  size: number;
}

interface CommitWeek {
  total: number;
  week: number;
  days: number[];
}


// Fetch commit activity for a repo (last 52 weeks)
async function fetchCommitActivity(
  owner: string,
  repo: string,
  headers: Record<string, string>,
): Promise<CommitWeek[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/stats/commit_activity`,
      { headers },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// Check if a repo has a README (proxy for "has documentation")
async function repoHasReadme(
  owner: string,
  repo: string,
  headers: Record<string, string>,
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      { headers },
    );
    return res.ok;
  } catch {
    return false;
  }
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

    const ghHeaders = {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github.v3+json",
    };

    // 2. Fetch user profile
    const userRes = await fetch("https://api.github.com/user", { headers: ghHeaders });
    const ghUser: GitHubUser = await userRes.json();

    // 3. Fetch repos (sorted by recent update, top 20 for analysis)
    const reposRes = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=20&type=owner",
      { headers: ghHeaders },
    );
    const allRepos: GitHubRepo[] = await reposRes.json();
    const repos = Array.isArray(allRepos) ? allRepos.filter((r) => !r.fork) : [];

    // 4. Fetch commit activity for top 3 recently-pushed repos
    const topReposForActivity = repos
      .sort((a, b) => new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime())
      .slice(0, 3);

    let totalWeeklyCommits = 0;
    let recentWeeklyCommits = 0;
    const repoActivities: Array<{ repo: string; weeklyAvg: number; recentWeekly: number }> = [];

    for (const repo of topReposForActivity) {
      const [owner, repoName] = repo.full_name.split("/");
      const activity = await fetchCommitActivity(owner, repoName, ghHeaders);
      if (activity.length > 0) {
        // Last 4 weeks average
        const last4Weeks = activity.slice(-4);
        const recentAvg = last4Weeks.reduce((s, w) => s + w.total, 0) / Math.max(1, last4Weeks.length);
        // Overall average
        const overallAvg = activity.reduce((s, w) => s + w.total, 0) / Math.max(1, activity.length);
        totalWeeklyCommits += overallAvg;
        recentWeeklyCommits += recentAvg;
        repoActivities.push({
          repo: repo.full_name,
          weeklyAvg: Math.round(overallAvg * 10) / 10,
          recentWeekly: Math.round(recentAvg * 10) / 10,
        });
      }
    }

    // 5. Check if any top repo has a README (product maturity signal)
    let hasReadmeRepo = false;
    for (const repo of topReposForActivity.slice(0, 2)) {
      const [owner, repoName] = repo.full_name.split("/");
      if (await repoHasReadme(owner, repoName, ghHeaders)) {
        hasReadmeRepo = true;
        break;
      }
    }

    // 6. Extract signals for evidence items
    const totalRepos = ghUser.public_repos ?? 0;
    const privateRepos = ghUser.total_private_repos ?? 0;
    const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count ?? 0), 0);
    const languages = [...new Set(repos.map((r) => r.language).filter(Boolean))];

    // Recent activity: repos pushed to in the last 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentlyActiveRepos = repos.filter(
      (r) => new Date(r.pushed_at).getTime() > thirtyDaysAgo,
    );

    // Public repos with a homepage or GitHub Pages = deployed product signal
    const reposWithHomepage = repos.filter(
      (r) => !r.private && (r.homepage || r.has_pages),
    );

    // 7. Calculate SVI impact based on rich signals
    // Base: 5 points for connecting
    let sviImpact = 5;

    // Repo count bonus: +1 per 5 repos, max +3
    sviImpact += Math.min(3, Math.floor(totalRepos / 5));

    // Star bonus: +1 per 10 stars, max +4
    sviImpact += Math.min(4, Math.floor(totalStars / 10));

    // Commit frequency bonus (recent 4 weeks): strong activity = +3
    if (recentWeeklyCommits >= 10) {
      sviImpact += 3; // Strong: 10+ commits/week across top repos
    } else if (recentWeeklyCommits >= 5) {
      sviImpact += 2; // Moderate: 5-9 commits/week
    } else if (recentWeeklyCommits >= 1) {
      sviImpact += 1; // Light: 1-4 commits/week
    }

    // README + recent commits = product maturity signal: +2
    if (hasReadmeRepo && recentlyActiveRepos.length > 0) {
      sviImpact += 2;
    }

    // Deployed product (homepage/pages): +1
    if (reposWithHomepage.length > 0) {
      sviImpact += 1;
    }

    // Private repos signal serious development: +1
    if (privateRepos > 0) {
      sviImpact += 1;
    }

    // Cap at 15
    sviImpact = Math.min(15, sviImpact);

    // Determine commit frequency tier for the label
    const commitTier =
      recentWeeklyCommits >= 10
        ? "strong"
        : recentWeeklyCommits >= 5
          ? "moderate"
          : recentWeeklyCommits >= 1
            ? "light"
            : "inactive";

    const label = `GitHub: ${ghUser.login} \u2014 ${totalRepos} repos, ${Math.round(recentWeeklyCommits)} commits/week`;

    const topRepoData = repos.slice(0, 5).map((r) => ({
      name: r.full_name,
      url: r.html_url,
      language: r.language,
      stars: r.stargazers_count,
      pushed: r.pushed_at,
      description: r.description,
      private: r.private,
      hasHomepage: !!(r.homepage || r.has_pages),
      size: r.size,
    }));

    // 6b. Deep repo audit on the most recently-pushed repo (enterprise CTO analysis)
    let repoAudit: GitHubRepoAudit | null = null;
    if (topReposForActivity.length > 0) {
      try {
        repoAudit = await auditGitHubRepo(
          topReposForActivity[0].full_name,
          tokenData.access_token,
        );
      } catch (err) {
        console.warn("[blockid:oauth:github] deep repo audit failed", err);
      }
    }

    const metadata = {
      username: ghUser.login,
      profile_url: ghUser.html_url,
      public_repos: totalRepos,
      private_repos: privateRepos,
      total_stars: totalStars,
      followers: ghUser.followers,
      languages,
      repos: topRepoData,
      commit_activity: {
        weekly_avg: Math.round(totalWeeklyCommits * 10) / 10,
        recent_weekly_avg: Math.round(recentWeeklyCommits * 10) / 10,
        tier: commitTier,
        repo_details: repoActivities,
      },
      signals: {
        has_readme: hasReadmeRepo,
        recently_active_count: recentlyActiveRepos.length,
        deployed_repos_count: reposWithHomepage.length,
        has_private_repos: privateRepos > 0,
      },
      repo_audit: repoAudit,
      connected_at: new Date().toISOString(),
    };

    // 8. Save to database
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const projectId = await getProjectIdFromRequest();
      const accountId = await findOrCreateSVIAccount(email, projectId);
      if (accountId) {
        // 8a. Save/update oauth_connections
        await supabase
          .from("oauth_connections")
          .upsert(
            {
              user_email: email,
              provider: "github",
              provider_user_id: ghUser.login,
              access_token: tokenData.access_token,
              metadata,
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_email,provider" },
          )
          .then(({ error }) => {
            if (error) {
              // oauth_connections table may not exist yet — log but don't block
              console.warn("[blockid:oauth:github] oauth_connections upsert failed (table may not exist yet)", error.message);
            }
          });

        // 8b. Check if GitHub evidence already exists for this account
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
          verified_at: new Date().toISOString(),
        };

        if (existingEvidence) {
          // Update existing evidence with fresh data
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

        // 8c. If commit frequency is strong, also create a traction evidence item
        if (commitTier === "strong" || commitTier === "moderate") {
          const tractionLabel =
            commitTier === "strong"
              ? `GitHub Activity: ${Math.round(recentWeeklyCommits)} commits/week (strong)`
              : `GitHub Activity: ${Math.round(recentWeeklyCommits)} commits/week (moderate)`;

          const { data: existingTraction } = await supabase
            .from("svi_evidence")
            .select("id")
            .eq("account_id", accountId)
            .eq("evidence_type", "github")
            .eq("dimension", "tre")
            .maybeSingle();

          const tractionPayload = {
            account_id: accountId,
            evidence_type: "github" as const,
            label: tractionLabel,
            value_or_url: ghUser.html_url,
            confidence_level: "connected_source" as const,
            dimension: "tre",
            svi_impact: commitTier === "strong" ? 8 : 5,
            verified_at: new Date().toISOString(),
          };

          if (existingTraction) {
            await supabase
              .from("svi_evidence")
              .update(tractionPayload)
              .eq("id", existingTraction.id);
          } else {
            await supabase.from("svi_evidence").insert({
              ...tractionPayload,
              created_at: new Date().toISOString(),
            });
          }
        }

        // 8d. Deep repo audit evidence — architecture, CI/CD, testing, code quality
        if (repoAudit && repoAudit.overallGrade !== "F") {
          const auditLabel = repoAudit.evidenceLabels.join(" | ");
          const auditNotes = repoAudit.scoringNotes.join(" ");

          // Architecture & code quality → PTD
          const { data: existingAudit } = await supabase
            .from("svi_evidence")
            .select("id")
            .eq("account_id", accountId)
            .eq("evidence_type", "github_repo_audit")
            .eq("dimension", "ptd")
            .maybeSingle();

          const auditPtdPayload = {
            account_id: accountId,
            evidence_type: "github_repo_audit" as const,
            label: `Code Audit (${repoAudit.overallGrade}): ${auditLabel}`,
            value_or_url: repoAudit.repoUrl,
            confidence_level: "connected_source" as const,
            dimension: "ptd",
            svi_impact: Math.max(0, repoAudit.signalBoosts.ptdBoost),
            verified_at: new Date().toISOString(),
          };

          if (existingAudit) {
            await supabase.from("svi_evidence").update(auditPtdPayload).eq("id", existingAudit.id);
          } else {
            await supabase.from("svi_evidence").insert({ ...auditPtdPayload, created_at: new Date().toISOString() });
          }

          // Engineering team quality → FTV (Founder & Team)
          if (repoAudit.signalBoosts.ftvBoost > 0) {
            const { data: existingFtv } = await supabase
              .from("svi_evidence")
              .select("id")
              .eq("account_id", accountId)
              .eq("evidence_type", "github_repo_audit")
              .eq("dimension", "ftv")
              .maybeSingle();

            const auditFtvPayload = {
              account_id: accountId,
              evidence_type: "github_repo_audit" as const,
              label: `Engineering Quality: ${repoAudit.activity.contributors} contributors, ${repoAudit.testing.estimatedTestMaturity} testing`,
              value_or_url: repoAudit.repoUrl,
              confidence_level: "connected_source" as const,
              dimension: "ftv",
              svi_impact: repoAudit.signalBoosts.ftvBoost,
              verified_at: new Date().toISOString(),
            };

            if (existingFtv) {
              await supabase.from("svi_evidence").update(auditFtvPayload).eq("id", existingFtv.id);
            } else {
              await supabase.from("svi_evidence").insert({ ...auditFtvPayload, created_at: new Date().toISOString() });
            }
          }

          // Tech moat → SVM (Strategic Vision & Moat)
          if (repoAudit.signalBoosts.svmBoost > 0) {
            const { data: existingSvm } = await supabase
              .from("svi_evidence")
              .select("id")
              .eq("account_id", accountId)
              .eq("evidence_type", "github_repo_audit")
              .eq("dimension", "svm")
              .maybeSingle();

            const auditSvmPayload = {
              account_id: accountId,
              evidence_type: "github_repo_audit" as const,
              label: `Tech Moat: ${repoAudit.architecture.frameworks.join(", ")} + ${repoAudit.dependencies.notableLibs.slice(0, 3).join(", ")}`,
              value_or_url: repoAudit.repoUrl,
              confidence_level: "connected_source" as const,
              dimension: "svm",
              svi_impact: repoAudit.signalBoosts.svmBoost,
              verified_at: new Date().toISOString(),
            };

            if (existingSvm) {
              await supabase.from("svi_evidence").update(auditSvmPayload).eq("id", existingSvm.id);
            } else {
              await supabase.from("svi_evidence").insert({ ...auditSvmPayload, created_at: new Date().toISOString() });
            }
          }
        }

        // 9. Trigger SVI rescore (fire-and-forget, single endpoint)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
        const cookieHeader = request.headers.get("cookie") ?? "";
        void fetch(`${siteUrl}/api/svi/rescore-from-evidence`, {
          method: "POST",
          headers: { Cookie: cookieHeader },
        }).catch(() => {});
      }
    }

    // 10. Redirect to evidence vault with success param
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
