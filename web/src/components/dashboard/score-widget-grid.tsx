// Personalisable widget grid for /workspace/score (G13-W3-IA3 — moved off the
// founder landing, spec §B.1 "the 14-widget WidgetGrid … moves to
// /workspace/score where it belongs").
//
// Each child MUST carry a stable `data-widget-id` that is ALSO listed in
// lib/dashboard/widget-ids.ts (widget-ids.test.ts reads THIS file and fails
// on drift); WidgetGrid persists per-founder pin + reorder + hide to
// localStorage (instant) and app_users.dashboard_layout via
// /api/dashboard/layout (cross-device). Absent widgets disappear from the
// grid entirely (sanitizeStoredIds self-heals older saved orders — the
// retired guide-next / reports-actions / growth-* ids now live on
// /workspace/plan and the landing).

import Link from "next/link";
import { BarChart3, ChevronRight, ShieldCheck, Target, TrendingUp, Zap, type LucideIcon } from "lucide-react";
import { WidgetGrid } from "@/components/dashboard/widget-grid";
import { HealthScoreWidget } from "@/components/founder/health-score-widget";
import { RevenueTrackerTile } from "@/components/founder/revenue-tracker-tile";
import { AIConfidenceActionPlan } from "@/components/dashboard/ai-confidence-action-plan";
import { GitHubEvidenceCard } from "@/components/dashboard/github-evidence-card";
import { StatusCards } from "@/components/dashboard/status-cards";
import { DataRoomReadinessCard } from "@/components/dashboard/data-room-readiness-card";
import { AIEvaluationSummary } from "@/components/dashboard/ai-evaluation-summary";
import { ScoreHistoryChart } from "@/components/svi/score-history-chart";
import { CapTableMini } from "@/components/dashboard/cap-table-mini";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import type { StartupAISummary } from "@/lib/analysis/aggregate-startup-summary";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { NAV_PHASE_NAMES } from "@/lib/nav/founder-phase-shared";
import { valuationNotEstimable } from "@/lib/valuation/not-estimable";

/* V04a (D22): no dollar figure is derived from the SVI. The "Company value"
   card shows "not estimable" and the evidence that unlocks a CFO method. */

function MetricCard({ title, value, subtitle, trend, icon: Icon }: { title: string; value: string | number; subtitle?: string; trend?: number; icon: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-line-subtle bg-surface-sunken p-4 backdrop-blur-sm transition-all duration-300 hover:border-action/25">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{title}</p>
        <Icon className="h-4 w-4 text-muted" />
      </div>
      <p className="text-2xl font-bold text-ink-100">{value}</p>
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      {trend != null && trend !== 0 && (
        <span className={`text-xs font-semibold ${trend > 0 ? "text-emerald-400" : "text-red-400"}`}>
          {trend > 0 ? "+" : ""}
          {trend}
        </span>
      )}
    </div>
  );
}

export interface ScoreWidgetGridProps {
  projectId: string | null;
  analysis: SVIAnalysis;
  sviScore: number;
  delta: number | null;
  /** 0..5 nav band + its label (sidebar band, internal — §B.5). */
  phase: number;
  creditBalance: number;
  evidenceCount: number;
  sviHistory: Array<{ total_svi: number; created_at: string }>;
  projectName: string | null;
  githubEvidence: { label: string; url: string; commitsLast90: number | null; stars: number | null; pushedAt: string | null } | null;
  shareholders: Array<{ name: string; percentage: number; color: string }>;
  totalShares: number;
  userActions: Array<{ action_type: string; action_label: string; completed_at: string }>;
  aiSummary: StartupAISummary | null;
}

export function ScoreWidgetGrid(p: ScoreWidgetGridProps) {
  const phaseName = NAV_PHASE_NAMES[p.phase] ?? NAV_PHASE_NAMES[0];
  const readiness = Math.min(100, Math.round(p.sviScore * 0.8 + p.evidenceCount * 2));
  const valuation = valuationNotEstimable();
  return (
    <WidgetGrid>
      {p.projectId && (
        <div data-widget-id="health-score" className="col-span-full">
          <HealthScoreWidget startupId={p.projectId} />
        </div>
      )}

      <div data-widget-id="metrics" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard title="Company value" value={valuation.label} subtitle={valuation.hint} icon={BarChart3} />
        <MetricCard title="SVI index" value={p.sviScore} trend={p.delta ?? undefined} icon={TrendingUp} />
        <MetricCard title="Current Phase" value={phaseName} icon={Target} />
        <MetricCard title="Credits" value={p.creditBalance % 1 === 0 ? p.creditBalance : p.creditBalance.toFixed(2)} subtitle="remaining" icon={Zap} />
        <MetricCard title="Investor Ready" value={`${readiness}%`} icon={ShieldCheck} />
      </div>

      {p.analysis.subs && p.analysis.subs.length > 0 && (
        <div data-widget-id="svi-radar">
          <AIConfidenceActionPlan subs={p.analysis.subs} />
        </div>
      )}

      {p.githubEvidence && (
        <div data-widget-id="github-evidence">
          <GitHubEvidenceCard repoLabel={p.githubEvidence.label} repoUrl={p.githubEvidence.url} commitsLast90={p.githubEvidence.commitsLast90} stars={p.githubEvidence.stars} pushedAt={p.githubEvidence.pushedAt} />
        </div>
      )}

      <div data-widget-id="revenue-90d">
        <RevenueTrackerTile />
      </div>

      <div data-widget-id="status-cards">
        <StatusCards sviScore={p.sviScore} evidenceCount={p.evidenceCount} phase={p.phase} phaseName={phaseName} hasCapTable={p.shareholders.length > 0} hasEquity={p.shareholders.length > 1} />
      </div>

      <div data-widget-id="data-room">
        <DataRoomReadinessCard />
      </div>

      {p.aiSummary && (
        <div data-widget-id="ai-eval-summary">
          <AIEvaluationSummary summary={p.aiSummary} />
        </div>
      )}

      {p.sviHistory.length > 0 && (
        <div data-widget-id="svi-trend">
          <ScoreHistoryChart history={p.sviHistory} startupName={p.projectName ?? undefined} />
        </div>
      )}

      <div data-widget-id="cohort-benchmark">
        <Link href="/workspace/score/benchmark" className="flex items-center justify-between gap-4 rounded-2xl border border-line-subtle bg-surface-sunken p-5 backdrop-blur-sm transition-all duration-300 hover:border-action/25">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-action" />
            <div>
              <p className="text-sm font-semibold text-ink-100">See your cohort percentile</p>
              <p className="text-xs text-muted">Compare your SVI against anonymised AU pre-seed/seed startups.</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted/50" />
        </Link>
      </div>

      <div data-widget-id="cap-activity" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CapTableMini shareholders={p.shareholders} totalShares={p.totalShares} />
        <ActivityFeed rawActions={p.userActions.map((a) => ({ action_type: a.action_type, description: a.action_label, created_at: a.completed_at }))} />
      </div>
    </WidgetGrid>
  );
}
