/**
 * /startup-package/[projectId] — the Package dashboard.
 *
 * Server component. Fans out to load:
 *   (a) the founder's `startup_package_purchases` row for this project
 *   (b) every interview answer (drives phase progress + hydrates PDFs)
 *   (c) the 12-phase progress rows
 *   (d) the latest SVI snapshot
 *   (e) the reserved allocation row
 *
 * Redirect matrix:
 *   - no purchase → /startup-package  (buy page owned by subgoal 2)
 *   - purchase but no interview answers → /startup-package/interview  (subgoal 3)
 *   - otherwise render the 3-column dashboard.
 *
 * SUBGOAL 6 (spawn-agent-v-d-ng-cosmic-aho plan).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, CreditCard, Sparkles } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { getProjectById } from "@/lib/projects";
import { GROWTH_PHASES } from "@/lib/startup-growth-phases";
import {
  deliverablesForPhase,
  type GrowthPhaseId,
} from "@/lib/startup-package/deliverable-registry";
import { loadPackageDashboardData } from "@/lib/startup-package/dashboard-data";
import { PaywallProvider } from "@/components/sales/paywall-nudge";
import { PhaseList, type PhaseListItem } from "@/components/startup-package/phase-list";
import { PhaseCard } from "@/components/startup-package/phase-card";
import { SviMeter } from "@/components/startup-package/svi-meter";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Startup Package · BlockID",
  description:
    "Guided path from idea to investor-ready — per-phase deliverables, live SVI, reserved cap-table allocation.",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function Page({ params }: PageProps) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/startup-package/${projectId}`)}`);
  }

  const project = await getProjectById(projectId);
  if (!project || project.userId !== user.id) {
    notFound();
  }

  const data = await loadPackageDashboardData(user.id, projectId);

  // Redirect matrix
  if (!data.purchase) {
    redirect("/startup-package");
  }
  if (data.interviewAnswers.length === 0) {
    redirect("/startup-package/interview");
  }

  // Which phase is "current"? First in_progress → first not_started → last.
  const progressById = new Map(
    data.phaseProgress.map((p) => [p.phase_id, p]),
  );
  const currentPhase =
    GROWTH_PHASES.find(
      (p) => progressById.get(p.id)?.status === "in_progress",
    ) ??
    GROWTH_PHASES.find(
      (p) => (progressById.get(p.id)?.status ?? "not_started") === "not_started",
    ) ??
    GROWTH_PHASES[0];

  const phaseItems: PhaseListItem[] = GROWTH_PHASES.map((phase) => {
    const row = progressById.get(phase.id);
    return {
      phase,
      status: (row?.status ?? "not_started") as PhaseListItem["status"],
      completionPct: Number(row?.completion_pct ?? 0),
    };
  });

  const answeredStepKeys = data.interviewAnswers.map((a) => a.step_key);
  const balance = data.creditBalance;
  const lowBalance = balance < 5;

  return (
    <PaywallProvider>
      <main className="min-h-screen bg-surface-50">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {/* Header */}
          <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                Startup Package
              </p>
              <h1 className="mt-1 text-2xl font-bold text-ink-900">
                {project.name}
              </h1>
              <p className="mt-1 text-sm text-ink-500">
                Purchased{" "}
                {new Date(data.purchase.purchased_at).toLocaleDateString("en-AU")} ·
                {" "}
                {data.purchase.seed_credits} seed credits
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 ring-1 ring-surface-200">
                Balance: {balance.toFixed(2)} cr
              </span>
              <Link
                href="/pricing?tier=founder"
                className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                <CreditCard aria-hidden="true" className="h-3 w-3" />
                Buy credits
                <ArrowRight aria-hidden="true" className="h-3 w-3" />
              </Link>
            </div>
          </header>

          {/* 3-column layout — stacks on mobile */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px,1fr,300px]">
            {/* LEFT rail — 12-phase list */}
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <PhaseList items={phaseItems} currentPhaseId={currentPhase.id} />
            </aside>

            {/* CENTER — every phase card, anchor-scrolled from the left rail */}
            <section className="space-y-6">
              {GROWTH_PHASES.map((phase) => (
                <PhaseCard
                  key={phase.id}
                  phase={phase}
                  deliverables={deliverablesForPhase(phase.id as GrowthPhaseId)}
                  projectId={projectId}
                  creditBalance={balance}
                  answeredStepKeys={answeredStepKeys}
                  reservedAllocation={
                    phase.id === "legal_equity" && data.reservedAllocation
                      ? {
                          id: data.reservedAllocation.id,
                          pct_reserved: data.reservedAllocation.pct_reserved,
                          ticker_hint: data.reservedAllocation.ticker_hint,
                        }
                      : null
                  }
                  currentPlan={user.plan ?? undefined}
                />
              ))}
            </section>

            {/* RIGHT rail — SVI meter + reservation summary + CTA */}
            <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
              {data.sviSnapshot ? (
                <SviMeter
                  score={data.sviSnapshot.totalSVI}
                  grade={data.sviSnapshot.grade}
                  stageLabel={data.sviSnapshot.stageLabel}
                  snapshotDate={data.sviSnapshot.snapshotDate}
                />
              ) : (
                <div className="rounded-2xl border border-surface-200 bg-white p-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                    Live SVI
                  </p>
                  <p className="mt-3 text-sm text-ink-500">
                    Answer the first interview step to seed your live SVI.
                  </p>
                </div>
              )}

              <ReservedAllocationSummary
                pct={data.reservedAllocation?.pct_reserved ?? null}
                ticker={data.reservedAllocation?.ticker_hint ?? null}
              />

              {lowBalance && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
                    <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                    Low credit balance
                  </p>
                  <p className="mt-2 text-xs text-amber-900">
                    You have {balance.toFixed(2)} credits. Top up to keep the
                    auto-fill flow running smoothly.
                  </p>
                  <Link
                    href="/pricing?tier=founder"
                    className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                  >
                    Buy more credits
                    <ArrowRight aria-hidden="true" className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </aside>
          </div>
        </div>
      </main>
    </PaywallProvider>
  );
}

// ─── Right-rail: reservation summary ────────────────────────────────────

function ReservedAllocationSummary({
  pct,
  ticker,
}: {
  pct: number | null;
  ticker: string | null;
}) {
  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
        Reserved allocation
      </p>
      {pct == null ? (
        <p className="mt-2 text-sm text-ink-500">
          No reservation yet — set one in the{" "}
          <a
            href="#phase-legal_equity"
            className="font-semibold text-brand-600 hover:underline"
          >
            Legal &amp; Equity
          </a>{" "}
          phase.
        </p>
      ) : (
        <div className="mt-2 space-y-1">
          <p className="text-2xl font-bold text-ink-900">{pct}%</p>
          <p className="text-xs text-ink-500">
            Ticker: <span className="font-mono">{ticker ?? "—"}</span>
          </p>
          <p className="mt-2 text-[10px] text-ink-400">
            Stored in your dataroom. On-chain issuance ships in v2.
          </p>
        </div>
      )}
    </div>
  );
}
