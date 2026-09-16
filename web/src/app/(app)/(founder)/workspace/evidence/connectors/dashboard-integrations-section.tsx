// S-IA2 — ex /dashboard/integrations ("Integrations"), now the "Evidence
// sources" section of /workspace/evidence/connectors. Async server component:
// it does its own member-aware evidence lookup and renders the GitHub manual /
// OAuth form plus the Google Analytics OAuth link. The page passes the
// signed-in user and the `?connected=` callback param (the page renders the
// shared `?error=` banner once for every connector).

import { GitBranch, LineChart } from "lucide-react";
import type { AppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectScope } from "@/lib/projects";
import { pageScopeKeys, resolveSVIAccountIdForPage } from "@/lib/project-members/page-scope";
import { ViewOnlyNote } from "@/components/workspace/view-only-note";
import { isGitHubOAuthConfigured } from "@/lib/github";
import { isGoogleAnalyticsOAuthConfigured } from "@/lib/google-analytics-oauth";
import { GitHubConnectForm } from "@/components/dashboard/github-connect-form";

/** `?connected=` values this section explains itself (the page skips its generic banner for these). */
export const SECTION_CONNECTED_VALUES = ["github", "google_analytics"] as const;

export async function DashboardIntegrationsSection({
  user,
  connected,
}: {
  user: AppUser;
  /** `?connected=` from an OAuth callback; the page owns the generic `?error=` banner. */
  connected?: string;
}) {
  const sp = { connected };

  let existingRepoUrl: string | null = null;
  let existingGaSummary: string | null = null;
  // S18-B — member-aware: integration evidence lives under the OWNER's
  // svi_account (read-only for members). Linking an OAuth source is admin+
  // (every callback gates "admin"); the manual GitHub repo form is editor+
  // (/api/integrations/github/manual). Viewers see the status only.
  const scope = await getProjectScope("viewer");
  const { role, canEdit, isMember } = pageScopeKeys(scope, user);
  const canOAuth = !isMember || role === "admin";
  const canConnect = canEdit;

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const accountId = await resolveSVIAccountIdForPage(scope, user);
    if (accountId) {
      const { data } = await supabase
        .from("svi_evidence")
        .select("value_or_url")
        .eq("account_id", accountId)
        .eq("evidence_type", "github_repo")
        .maybeSingle();
      existingRepoUrl = (data?.value_or_url as string | null) ?? null;

      const { data: gaRow } = await supabase
        .from("svi_evidence")
        .select("label, value_or_url")
        .eq("account_id", accountId)
        .eq("evidence_type", "google_analytics")
        .maybeSingle();
      const gaLabel = (gaRow as { label?: string } | null)?.label ?? null;
      const gaValue = (gaRow as { value_or_url?: string } | null)?.value_or_url ?? null;
      existingGaSummary = gaLabel && gaValue ? `${gaLabel} · ${gaValue}` : null;
    }
  }

  return (
    <section
      aria-labelledby="evidence-sources-heading"
      className="space-y-6 pt-6 border-t border-line-subtle"
    >
      <div>
        <h2 id="evidence-sources-heading" className="text-xl font-semibold text-primary">
          Evidence sources
        </h2>
        <p className="text-sm text-muted mt-1">
          Connect external sources to strengthen your SVI evidence and prove
          real progress to investors.
        </p>
      </div>

      {sp.connected === "github" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          GitHub connected — your top public repo has been added to your SVI
          evidence.
        </div>
      )}
      {sp.connected === "google_analytics" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Google Analytics connected — monthly sessions and bounce rate are
          now recorded as Marketing (mkt) evidence in your SVI.
        </div>
      )}

      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        <div className="flex items-center gap-3 mb-2">
          <GitBranch strokeWidth={1.75} className="h-5 w-5 text-ink-700" />
          <h2 className="text-lg font-semibold text-ink-800">
            GitHub — Product Activity Evidence
          </h2>
        </div>
        <p className="text-sm text-ink-600">
          We&rsquo;ll pull public commit count (last 90 days), stars, and
          last-pushed date as evidence of active development. Boosts your{" "}
          <strong>Product &amp; Technical Depth</strong> sub-score.
        </p>
      </div>

      {!canConnect && (
        <ViewOnlyNote role={role} action="connect or change integrations" />
      )}
      {canConnect ? (
        <GitHubConnectForm
          oauthEnabled={canOAuth && isGitHubOAuthConfigured()}
          initialRepo={existingRepoUrl}
        />
      ) : (
        existingRepoUrl && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            Connected · {existingRepoUrl}
          </div>
        )
      )}

      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        <div className="flex items-center gap-3 mb-2">
          <LineChart strokeWidth={1.75} className="h-5 w-5 text-ink-700" />
          <h2 className="text-lg font-semibold text-ink-800">
            Google Analytics — Marketing Evidence
          </h2>
        </div>
        <p className="text-sm text-ink-600">
          We&rsquo;ll pull monthly sessions and bounce rate (last 30 days) via
          the GA4 Data API as evidence of real audience reach. Boosts your{" "}
          <strong>Marketing (mkt)</strong> sub-score.
        </p>

        {existingGaSummary && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            Connected · {existingGaSummary}
          </div>
        )}

        <div className="mt-4">
          {!canOAuth ? (
            isMember && canEdit && (
              <ViewOnlyNote role={role} action="link Google Analytics (admin only)" />
            )
          ) : isGoogleAnalyticsOAuthConfigured() ? (
            <a
              href="/api/integrations/google-analytics/start"
              className="inline-flex items-center gap-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800"
            >
              <LineChart strokeWidth={1.75} className="h-4 w-4" />
              {existingGaSummary ? "Reconnect Google Analytics" : "Connect Google Analytics"}
            </a>
          ) : (
            <p className="text-xs text-ink-500">
              Google Analytics OAuth is not yet configured on this deployment.
              Set <code>GOOGLE_CLIENT_ID</code> and{" "}
              <code>GOOGLE_CLIENT_SECRET</code> to enable it.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
