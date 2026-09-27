"use client";

// ValueImpactBanner — "What BlockID has delivered for you."
//
// Renders a horizontal banner with 4 stat chips:
//   • SVI growth since first analysis (with trend arrow)
//   • Company value — "not estimable" + unlock hint (V04a/D22: never derived
//     from the SVI; a valuation comes only from a CFO method)
//   • Investor Readiness score (from health score or readiness pct)
//   • Milestones completed (evidence count + actions)
//
// Purely presentational — receives props from the server page, no client fetch.

import { TrendingUp, Award, Target, Sparkles } from "lucide-react";
import { valuationNotEstimable } from "@/lib/valuation/not-estimable";

interface Props {
  sviFirst:    number | null;
  sviCurrent:  number | null;
  readinessPct: number;
  evidenceCount: number;
  actionsCompleted?: number;
  startupName?: string | null;
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

  const valuation = valuationNotEstimable();

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
          label="SVI index"
          value={String(sviCurrent)}
          sub={delta != null ? `${fmtDelta(delta)} pts since first analysis` : "Current index"}
          accent="var(--ds-accent)"
        />

        {/* Company value — never derived from the SVI (V04a / D22) */}
        <Chip
          icon={<Award className="h-4 w-4" />}
          label="Company value"
          value={valuation.label}
          sub={valuation.hint}
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
