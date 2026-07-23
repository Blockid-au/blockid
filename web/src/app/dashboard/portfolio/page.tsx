// /dashboard/portfolio — every non-archived project the user owns rendered
// side-by-side. Q4 Multi-project #1 (feature-upgrade-roadmap-v2.md:53).
//
// Data source: getPortfolioRows() from the /api/projects/portfolio handler.
// The RSC calls it directly (no HTTP hop) — the API route stays the stable
// public JSON contract for mobile / partner integrations.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Briefcase, PlusCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { CanonicalStageBadge } from "@/components/showcase/canonical-stage-badge";
import { CANONICAL_STAGES, CANONICAL_STAGE_LABELS, type StageKey } from "@/lib/journey-vocabulary";
import { getPortfolioRows, type PortfolioRow } from "@/lib/portfolio";
import { PortfolioComparisonChart } from "@/components/portfolio/comparison-chart";

export const metadata: Metadata = {
  title: "Portfolio · BlockID",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The showcase `CanonicalStageBadge` expects a 12-phase key (1..12) — not a
 * canonical StageKey. This helper picks a representative phase for each
 * canonical bucket so we can render the same badge component and stay a
 * single source of truth for the copy.
 */
const STAGE_TO_REPRESENTATIVE_PHASE: Record<StageKey, number> = {
  idea: 1,
  validation: 2,
  mvp_early_revenue: 4,
  seed: 6,
  series_a: 8,
  series_b_c: 10,
  late_stage: 11,
  public_exit: 12,
};

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.round(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  return `${Math.round(diffMo / 12)}y ago`;
}

function sviBadgeClasses(score: number | null): string {
  if (score == null) return "bg-surface-100 text-ink-500";
  if (score >= 85) return "bg-emerald-100 text-emerald-700";
  if (score >= 70) return "bg-blue-100 text-blue-700";
  if (score >= 50) return "bg-amber-100 text-amber-700";
  if (score >= 30) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-600";
}

/** Stage rank for sorting — earliest → latest along the canonical ladder. */
function stageRank(stage: StageKey): number {
  const idx = CANONICAL_STAGES.indexOf(stage);
  return idx === -1 ? 0 : idx;
}

function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-surface-200 bg-white px-6 py-16 text-center">
      <Briefcase className="mx-auto h-8 w-8 text-ink-300" strokeWidth={1.5} />
      <h2 className="mt-4 text-lg font-semibold text-ink-900">
        You haven&apos;t created any startups yet.
      </h2>
      <p className="mt-2 text-sm text-ink-500">
        Add your first startup profile to see it in the portfolio view.
      </p>
      <Link
        href="/onboarding?step=6"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
      >
        <PlusCircle className="h-4 w-4" strokeWidth={1.75} />
        Get started
      </Link>
    </div>
  );
}

function RowLink({ row, children, className }: { row: PortfolioRow; children: React.ReactNode; className?: string }) {
  return (
    <Link href={`/workspace/projects/${row.slug}/analyze`} className={className}>
      {children}
    </Link>
  );
}

export default async function PortfolioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/portfolio");

  const [rows, isSandbox] = await Promise.all([
    getPortfolioRows(user),
    getCurrentProjectIsSandbox(),
  ]);

  // Order by canonical stage (latest first) then by SVI desc — the "furthest
  // along" project reads first, matching how founders think about their
  // portfolio priorities.
  const sortedRows = [...rows].sort((a, b) => {
    const stageDiff = stageRank(b.canonical_stage) - stageRank(a.canonical_stage);
    if (stageDiff !== 0) return stageDiff;
    return (b.current_svi_score ?? -1) - (a.current_svi_score ?? -1);
  });

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="max-w-6xl mx-auto px-6 pb-24 pt-6 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-brand-600 font-medium">
              Portfolio
            </p>
            <h1 className="mt-1 text-2xl font-bold text-ink-900">
              Your startups, side-by-side
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              Compare SVI, canonical stage, credits, and next action across every
              project you own.
            </p>
          </div>
          <Link
            href="/workspace/projects"
            className="hidden md:inline-flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:border-brand-300 transition-colors"
          >
            <PlusCircle className="h-4 w-4" strokeWidth={1.75} />
            Add startup
          </Link>
        </header>

        {sortedRows.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* ── Cross-project SVI comparison — Q4 Multi-project #2 ────── */}
            {sortedRows.some((r) => r.svi_history.length > 0) ? (
              <PortfolioComparisonChart rows={sortedRows} />
            ) : null}

            {/* ── Desktop table ────────────────────────────────────────────── */}
            <div className="hidden md:block rounded-2xl border border-surface-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50 text-left">
                    <th className="px-4 py-3 font-semibold text-ink-700">Project</th>
                    <th className="px-4 py-3 font-semibold text-ink-700">SVI</th>
                    <th className="px-4 py-3 font-semibold text-ink-700">Stage</th>
                    <th className="px-4 py-3 font-semibold text-ink-700 text-right">Credits MTD</th>
                    <th className="px-4 py-3 font-semibold text-ink-700">Last activity</th>
                    <th className="px-4 py-3 font-semibold text-ink-700">Next action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={row.id} className="border-b border-surface-100 last:border-0 hover:bg-surface-50/50 transition-colors">
                      <td className="px-4 py-4">
                        <RowLink
                          row={row}
                          className="font-medium text-ink-900 hover:text-brand-600 transition-colors"
                        >
                          {row.name}
                        </RowLink>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${sviBadgeClasses(row.current_svi_score)}`}
                        >
                          {row.current_svi_score ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <CanonicalStageBadge
                          phase={STAGE_TO_REPRESENTATIVE_PHASE[row.canonical_stage]}
                        />
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums text-ink-700">
                        {row.credits_used_mtd.toFixed(row.credits_used_mtd % 1 === 0 ? 0 : 2)}
                      </td>
                      <td className="px-4 py-4 text-ink-500">
                        {relativeTime(row.last_activity_at)}
                      </td>
                      <td className="px-4 py-4">
                        <Link
                          href={row.next_action.url}
                          className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium"
                        >
                          {row.next_action.label}
                          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Mobile card grid ─────────────────────────────────────────── */}
            <div className="md:hidden grid grid-cols-1 gap-3">
              {sortedRows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-surface-200 bg-white p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <RowLink row={row} className="font-semibold text-ink-900 hover:text-brand-600 transition-colors">
                      {row.name}
                    </RowLink>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold shrink-0 ${sviBadgeClasses(row.current_svi_score)}`}
                    >
                      SVI {row.current_svi_score ?? "—"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <CanonicalStageBadge
                      phase={STAGE_TO_REPRESENTATIVE_PHASE[row.canonical_stage]}
                    />
                    <span className="text-xs text-ink-500">
                      · {CANONICAL_STAGE_LABELS[row.canonical_stage].label_en}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-ink-500">
                    <span>{row.credits_used_mtd.toFixed(row.credits_used_mtd % 1 === 0 ? 0 : 2)} credits MTD</span>
                    <span>{relativeTime(row.last_activity_at)}</span>
                  </div>
                  <Link
                    href={row.next_action.url}
                    className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    {row.next_action.label}
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </WorkspaceLayout>
  );
}
