"use client";

// ValueImpactBanner — "What BlockID has delivered for you."
//
// Renders a horizontal banner with 4 stat chips:
//   • SVI growth since first analysis (with trend arrow)
//   • Estimated valuation gain (derived from SVI delta)
//   • Investor Readiness score (from health score or readiness pct)
//   • Milestones completed (evidence count + actions)
//
// Purely presentational — receives props from the server page, no client fetch.

import { TrendingUp, Award, Target, Sparkles } from "lucide-react";

interface Props {
  sviFirst:    number | null;
  sviCurrent:  number | null;
  readinessPct: number;
  evidenceCount: number;
  actionsCompleted?: number;
  startupName?: string | null;
}

function estimateValuation(score: number): number {
  if (score < 30)        return Math.round(score * 3000);
  if (score <= 50)       return Math.round(50_000   + (score - 30)  * 22_500);
  if (score <= 70)       return Math.round(500_000  + (score - 50)  * 75_000);
  if (score <= 85)       return Math.round(2_000_000 + (score - 70) * 200_000);
  if (score <= 120)      return Math.round(5_000_000 + (score - 85) * 142_857);
  return Math.round(10_000_000 + (score - 120) * 250_000);
}

function fmtVal(raw: number): string {
  if (raw >= 1_000_000) return `A$${(raw / 1_000_000).toFixed(1)}M`;
  if (raw >= 1_000)     return `A$${(raw / 1_000).toFixed(0)}K`;
  return `A$${raw.toLocaleString()}`;
}

function fmtDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

interface ChipProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}

function Chip({ icon, label, value, sub, accent = "var(--ds-accent)" }: ChipProps) {
  return (
    <div className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3">
      <div
        className="h-9 w-9 flex items-center justify-center rounded-lg shrink-0"
        style={{ background: `color-mix(in srgb, ${accent} 10%, transparent)`, color: accent }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-widest font-semibold text-muted">{label}</p>
        <p className="text-lg font-extrabold text-primary leading-tight">{value}</p>
        {sub && <p className="text-xs text-tertiary mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

export function ValueImpactBanner({
  sviFirst,
  sviCurrent,
  readinessPct,
  evidenceCount,
  actionsCompleted = 0,
  startupName,
}: Props) {
  if (!sviCurrent) return null;

  const delta = (sviFirst != null && sviFirst !== sviCurrent)
    ? sviCurrent - sviFirst
    : null;

  const currentVal = estimateValuation(sviCurrent);
  const firstVal   = sviFirst ? estimateValuation(sviFirst) : null;
  const valDelta   = firstVal ? currentVal - firstVal : null;

  const milestones = evidenceCount + actionsCompleted;

  return (
    <div className="rounded-2xl border border-action/25 bg-surface overflow-hidden">
      {/* Top label */}
      <div className="px-5 py-3 border-b border-line-subtle flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-action" />
        <p className="text-xs font-semibold text-action uppercase tracking-widest">
          {startupName ? `${startupName} · ` : ""}BlockID Value Delivered
        </p>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap divide-x divide-line-subtle">
        {/* SVI growth */}
        <Chip
          icon={<TrendingUp className="h-4 w-4" />}
          label="SVI Score"
          value={String(sviCurrent)}
          sub={delta != null ? `${fmtDelta(delta)} pts since first analysis` : "Current score"}
          accent="var(--ds-accent)"
        />

        {/* Estimated valuation */}
        <Chip
          icon={<Award className="h-4 w-4" />}
          label="Est. Value"
          value={fmtVal(currentVal)}
          sub={valDelta != null && valDelta > 0 ? `+${fmtVal(valDelta)} gained` : "Your startup value"}
          accent="var(--ds-success)"
        />

        {/* Investor readiness */}
        <Chip
          icon={<Target className="h-4 w-4" />}
          label="Investor Ready"
          value={`${readinessPct}%`}
          sub="Readiness score"
          accent="var(--ds-warn)"
        />

        {/* Milestones */}
        <Chip
          icon={<Sparkles className="h-4 w-4" />}
          label="Milestones"
          value={String(milestones)}
          sub={`${evidenceCount} evidence · ${actionsCompleted} actions done`}
          accent="var(--ds-accent-hover)"
        />
      </div>
    </div>
  );
}
