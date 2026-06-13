import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GitBranch } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  findOrCreateSVIAccount,
  getProjectIdFromRequest,
} from "@/lib/projects";
import { isGitHubOAuthConfigured } from "@/lib/github";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { GitHubConnectForm } from "@/components/dashboard/github-connect-form";

export const metadata: Metadata = {
  title: "Integrations · BlockID",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/integrations");

  const sp = await searchParams;

  let existingRepoUrl: string | null = null;
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const projectId = await getProjectIdFromRequest();
    const accountId = await findOrCreateSVIAccount(user.email, projectId);
    if (accountId) {
      const { data } = await supabase
        .from("svi_evidence")
        .select("value_or_url")
        .eq("account_id", accountId)
        .eq("evidence_type", "github_repo")
        .maybeSingle();
      existingRepoUrl = (data?.value_or_url as string | null) ?? null;
    }
  }

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-3xl mx-auto px-6 pb-24 pt-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Integrations</h1>
          <p className="text-sm text-ink-600 mt-1">
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
        {sp.error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Could not complete the GitHub connection ({sp.error}). You can still
            paste a public repo URL below.
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

        <GitHubConnectForm
          oauthEnabled={isGitHubOAuthConfigured()}
          initialRepo={existingRepoUrl}
        />
      </div>
    </WorkspaceLayout>
  );
}
