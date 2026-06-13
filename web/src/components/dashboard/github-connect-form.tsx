"use client";

import * as React from "react";
import { GitBranch, Link2, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

interface Props {
  oauthEnabled: boolean;
  initialRepo?: string | null;
}

interface RepoStats {
  owner: string;
  repo: string;
  url: string;
  stars: number;
  forks: number;
  openIssues: number;
  pushedAt: string | null;
  commitsLast90: number;
  language: string | null;
}

export function GitHubConnectForm({ oauthEnabled, initialRepo }: Props) {
  const [repo, setRepo] = React.useState(initialRepo ?? "");
  const [submitting, setSubmitting] = React.useState(false);
  const [stats, setStats] = React.useState<RepoStats | null>(null);
  const [impact, setImpact] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!repo.trim()) return;
    setSubmitting(true);
    setError(null);
    setStats(null);
    setImpact(null);
    try {
      const res = await fetch("/api/integrations/github/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: repo.trim() }),
      });
      const data = await res.json();
      if (data.ok && data.stats) {
        setStats(data.stats as RepoStats);
        setImpact(typeof data.impact === "number" ? data.impact : null);
      } else {
        setError(data.reason ?? "Could not connect repo");
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {oauthEnabled && (
        <div className="rounded-2xl border border-surface-200 bg-white p-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-ink-900 flex items-center justify-center shrink-0">
              <GitBranch strokeWidth={1.75} className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-ink-800">
                Connect with GitHub
              </h2>
              <p className="text-sm text-ink-600 mt-1">
                Sign in with GitHub so we can pull your most-active public repo
                automatically. We only read public repo metadata.
              </p>
              <a
                href="/api/integrations/github/start"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-800 transition-colors"
              >
                <GitBranch strokeWidth={1.75} className="h-4 w-4" />
                Connect GitHub account
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
            <Link2 strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-ink-800">
              Or paste a public repo URL
            </h2>
            <p className="text-sm text-ink-600 mt-1">
              {oauthEnabled
                ? "No login required — works for any public GitHub repo."
                : "GitHub OAuth is not configured on this instance, but you can still link a public repo. We fetch the public stats via the GitHub API."}
            </p>
            <form onSubmit={submit} className="mt-4 flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="https://github.com/owner/repo or owner/repo"
                className="flex-1 rounded-xl border border-surface-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="submit"
                disabled={submitting || !repo.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? (
                  <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" />
                ) : null}
                Link repo
              </button>
            </form>
            {error && (
              <div className="mt-3 flex items-start gap-2 text-sm text-red-700">
                <AlertTriangle strokeWidth={1.75} className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {stats && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                  <CheckCircle2 strokeWidth={1.75} className="h-4 w-4" />
                  Linked: {stats.owner}/{stats.repo}
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <Stat label="Commits 90d" value={stats.commitsLast90} />
                  <Stat label="Stars" value={stats.stars} />
                  <Stat label="Forks" value={stats.forks} />
                  <Stat
                    label="Last push"
                    value={
                      stats.pushedAt
                        ? new Date(stats.pushedAt).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"
                    }
                  />
                </div>
                {impact !== null && (
                  <p className="mt-3 text-xs text-emerald-700">
                    Added to your Product &amp; Technical Depth evidence — est.
                    +{impact} SVI points.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-white border border-emerald-200 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-ink-500 font-medium">
        {label}
      </p>
      <p className="text-sm font-semibold text-ink-800 tabular-nums mt-0.5">
        {value}
      </p>
    </div>
  );
}
