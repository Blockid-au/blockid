import Link from "next/link";
import { GitBranch, GitCommitVertical, Star, Clock, ArrowRight } from "lucide-react";

interface Props {
  repoLabel: string;
  repoUrl: string;
  commitsLast90: number | null;
  stars: number | null;
  pushedAt: string | null;
}

export function GitHubEvidenceCard({
  repoLabel,
  repoUrl,
  commitsLast90,
  stars,
  pushedAt,
}: Props) {
  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-ink-900 flex items-center justify-center shrink-0">
          <GitBranch strokeWidth={1.75} className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
            Product Activity Evidence
          </p>
          <h3 className="text-sm font-semibold text-ink-800 mt-0.5 truncate">
            {repoLabel}
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {commitsLast90 != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                <GitCommitVertical strokeWidth={1.75} className="h-3 w-3" />
                {commitsLast90} commits · 90d
              </span>
            )}
            {stars != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
                <Star strokeWidth={1.75} className="h-3 w-3" />
                {stars} stars
              </span>
            )}
            {pushedAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-50 border border-surface-200 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
                <Clock strokeWidth={1.75} className="h-3 w-3" />
                Last push{" "}
                {new Date(pushedAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"
            >
              View repo
              <ArrowRight strokeWidth={2} className="h-3 w-3" />
            </a>
            <Link
              href="/dashboard/integrations"
              className="text-xs text-ink-500 hover:text-ink-700"
            >
              Manage integration
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
