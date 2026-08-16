"use client";

// SeriesAActionPlan — week-by-week roadmap derived from FundingReadiness milestones.
//
// Props:
//   fundingReadiness: FundingReadiness — output of computeFundingReadiness()
//   sviScore: number                  — analysis.totalSVI
//   stage: string                     — analysis.stageLabel

import { cn } from "@/lib/utils";
import type { FundingReadiness, FundingMilestone } from "@/lib/svi-analysis";

// ── Dimension badge colours ───────────────────────────────────────────────────

const DIM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  tre: { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200"     },
  ftv: { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200"  },
  mpc: { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"   },
  cgh: { bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200"    },
  iri: { bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200"    },
  ptd: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  lco: { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200"  },
  svm: { bg: "bg-fuchsia-50", text: "text-fuchsia-700", border: "border-fuchsia-200" },
};

function dimColor(dimension: string) {
  return DIM_COLORS[dimension] ?? { bg: "bg-surface-50", text: "text-ink-600", border: "border-surface-200" };
}

// ── Phase configuration ───────────────────────────────────────────────────────

const PHASES: {
  id: string;
  label: string;
  timeframe: string;
  dotColor: string;
  lineColor: string;
  cardBorder: string;
  pillBg: string;
  pillText: string;
}[] = [
  {
    id: "now",
    label: "Now",
    timeframe: "Weeks 1–2",
    dotColor: "bg-brand-600",
    lineColor: "bg-brand-200",
    cardBorder: "border-brand-200 bg-brand-50/40",
    pillBg: "bg-brand-100",
    pillText: "text-brand-700",
  },
  {
    id: "month1",
    label: "Month 1",
    timeframe: "Weeks 3–4",
    dotColor: "bg-sky-500",
    lineColor: "bg-sky-200",
    cardBorder: "border-sky-200 bg-sky-50/30",
    pillBg: "bg-sky-100",
    pillText: "text-sky-700",
  },
  {
    id: "month23",
    label: "Month 2–3",
    timeframe: "30–90 days",
    dotColor: "bg-surface-400",
    lineColor: "bg-surface-200",
    cardBorder: "border-border bg-muted/10",
    pillBg: "bg-surface-100",
    pillText: "text-ink-600",
  },
];

// ── Milestone progress bar ────────────────────────────────────────────────────

function MilestoneProgressBar({ current, target }: { current: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <div className="space-y-1 mt-2">
      <div className="flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>
          Current: <span className="font-semibold text-foreground">{current}</span>
        </span>
        <span>
          Target: <span className="font-semibold text-foreground">{target}</span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Single milestone card ─────────────────────────────────────────────────────

function MilestoneCard({
  milestone,
  cardBorder,
}: {
  milestone: FundingMilestone;
  cardBorder: string;
}) {
  const dc = dimColor(milestone.dimension);
  const gap = milestone.targetValue - milestone.currentValue;

  return (
    <div className={cn("rounded-xl border p-3.5 space-y-2", cardBorder)}>
      {/* Top row: dim badge + label */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "shrink-0 inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded border",
              dc.bg, dc.text, dc.border,
            )}
          >
            {milestone.dimension.toUpperCase()}
          </span>
          <span className="text-sm font-medium text-foreground leading-tight">
            {milestone.label}
          </span>
        </div>
        {milestone.required && (
          <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
            Unlocks Series A gate
          </span>
        )}
      </div>

      {/* Action text */}
      <p className="text-xs text-muted-foreground leading-snug">{milestone.action}</p>

      {/* Gap + progress */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          Gap: <span className="font-semibold text-amber-700">+{gap} points needed</span>
        </span>
      </div>
      <MilestoneProgressBar current={milestone.currentValue} target={milestone.targetValue} />
    </div>
  );
}

// ── Phase section ─────────────────────────────────────────────────────────────

function PhaseSection({
  phase,
  milestones,
}: {
  phase: (typeof PHASES)[number];
  milestones: FundingMilestone[];
}) {
  if (milestones.length === 0) return null;
  return (
    <div className="flex gap-4">
      {/* Timeline spine */}
      <div className="flex flex-col items-center w-8 shrink-0 pt-1">
        <div className={cn("h-3 w-3 rounded-full shrink-0", phase.dotColor)} />
        <div className={cn("flex-1 w-0.5 mt-1", phase.lineColor)} />
      </div>

      {/* Content */}
      <div className="flex-1 pb-6 space-y-2">
        {/* Phase header */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full",
              phase.pillBg, phase.pillText,
            )}
          >
            {phase.label}
          </span>
          <span className="text-xs text-muted-foreground">{phase.timeframe}</span>
        </div>

        {/* Milestone cards */}
        {milestones.map((m, i) => (
          <MilestoneCard key={i} milestone={m} cardBorder={phase.cardBorder} />
        ))}
      </div>
    </div>
  );
}

// ── Already-ready state ───────────────────────────────────────────────────────

function AlreadyReadyBanner({ targetGate }: { targetGate: string }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-center space-y-1">
      <p className="text-sm font-semibold text-emerald-800">
        Series A criteria met — working toward {targetGate}
      </p>
      <p className="text-xs text-emerald-700">
        Your dimension scores have crossed all Series A gate thresholds. The roadmap below
        shows your path to {targetGate}.
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SeriesAActionPlan({
  fundingReadiness,
  sviScore,
  stage,
}: {
  fundingReadiness: FundingReadiness;
  sviScore: number;
  stage: string;
}) {
  const { currentGate, gateScore, milestones, seriesAReady, seriesBReady } = fundingReadiness;

  // Determine the target gate label for display
  const isSeriesAReady = seriesAReady || seriesBReady;
  const targetGateLabel = seriesBReady ? "Series B+" : isSeriesAReady ? "Series B" : "Series A";

  // Only show unmet milestones in the action plan
  const unmetMilestones = milestones.filter((m) => !m.met);

  // Count of unmet REQUIRED milestones (all milestones from computeFundingReadiness are required=true)
  const requiredUnmetCount = unmetMilestones.filter((m) => m.required).length;

  // Sort unmet milestones by gap descending (highest gap = most impactful, do first)
  const sorted = [...unmetMilestones].sort(
    (a, b) => (b.targetValue - b.currentValue) - (a.targetValue - a.currentValue),
  );

  // Assign to phases
  const phase0 = sorted.slice(0, 2);      // Now (Weeks 1–2): top 2 highest-gap
  const phase1 = sorted.slice(2, 5);      // Month 1: next 2–3
  const phase2 = sorted.slice(5);         // Month 2–3: remainder

  // Already met all milestones
  if (unmetMilestones.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 h-8 w-8 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4 text-emerald-600">
              <path d="M9 12l2 2 4-4" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold">Your Series A Roadmap</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              All gate criteria for {isSeriesAReady ? targetGateLabel : "Series A"} met
            </p>
          </div>
        </div>
        <AlreadyReadyBanner targetGate={targetGateLabel} />
        <p className="text-[10px] text-muted-foreground">
          Current gate: <span className="font-semibold">{currentGate}</span> &middot;{" "}
          {gateScore}% toward {targetGateLabel} &middot; Stage: {stage} &middot; SVI: {sviScore}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="shrink-0 h-8 w-8 rounded-lg bg-brand-100 border border-brand-200 flex items-center justify-center">
            {/* Roadmap / flag icon */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4 text-brand-600">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold">
              Your Series A Roadmap
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className="font-semibold text-foreground">{requiredUnmetCount} action{requiredUnmetCount !== 1 ? "s" : ""}</span>{" "}
              to unlock {targetGateLabel}
            </p>
          </div>
        </div>

        {/* Series A ready indicator or gate badge */}
        {isSeriesAReady ? (
          <span className="inline-flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 text-emerald-700 px-2.5 py-1 text-xs font-semibold rounded-lg">
            Series A Ready
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 border border-amber-200 bg-amber-50 text-amber-700 px-2.5 py-1 text-xs font-semibold rounded-lg">
            {gateScore}% to Series A
          </span>
        )}
      </div>

      {/* ── Timeline ── */}
      <div className="space-y-0 mt-2">
        <PhaseSection phase={PHASES[0]} milestones={phase0} />
        <PhaseSection phase={PHASES[1]} milestones={phase1} />
        <PhaseSection phase={PHASES[2]} milestones={phase2} />
      </div>

      {/* ── Footer ── */}
      <p className="text-[10px] text-muted-foreground border-t border-border pt-3">
        Current gate:{" "}
        <span className="font-semibold">{currentGate}</span> &middot;{" "}
        <span className="font-semibold">{gateScore}%</span> toward Series A &middot;{" "}
        Stage: {stage} &middot; SVI: {sviScore}
      </p>
    </div>
  );
}
