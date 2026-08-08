"use client";

// G8-P4 — Next Unlock dashboard card.
//
// Shows the founder's current growth phase, how close they are to clearing it
// (completionPct), the top-3 blockers standing in the way, and the single
// most important next action (from computeNextSteps / nudge engine).
//
// Props are computed server-side by the dashboard page via computePhaseGate()
// + topBlockers() and the nudge engine's next_action, so this component stays
// a pure presentational leaf — no fetching, no side effects.

import type { PhaseBlocker } from "@/lib/growth/phase-gate";
import type { GrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import { GROWTH_PHASE_LABELS, growthPhaseOrder } from "@/lib/growth/phase-taxonomy";

export interface NextUnlockCardProps {
  currentPhase: GrowthPhaseId;
  completionPct: number;
  topBlockers: readonly PhaseBlocker[];
  nextAction: string | null;
}

const BLOCKER_CODE_LABEL: Record<string, string> = {
  missing_required_criteria: "Missing evidence",
  criteria_below_threshold: "Needs improvement",
  dimension_below_floor: "SVI dimension too low",
  deliverables_incomplete: "Deliverable incomplete",
};

/** Colour band for the progress bar and pct label. */
function progressColor(pct: number): string {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-400";
  return "bg-rose-500";
}

function progressTextColor(pct: number): string {
  if (pct >= 80) return "text-emerald-400";
  if (pct >= 50) return "text-amber-400";
  return "text-rose-400";
}

export function NextUnlockCard({
  currentPhase,
  completionPct,
  topBlockers,
  nextAction,
}: NextUnlockCardProps) {
  const phaseOrder = growthPhaseOrder(currentPhase);
  const phaseLabel = GROWTH_PHASE_LABELS[currentPhase]?.en ?? currentPhase;
  const clamped = Math.max(0, Math.min(100, Math.round(completionPct)));
  const barColor = progressColor(clamped);
  const pctColor = progressTextColor(clamped);
  const top3 = topBlockers.slice(0, 3);

  return (
    <div
      data-testid="next-unlock-card"
      data-phase={currentPhase}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4"
    >
      {/* Header — phase ordinal + label */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium mb-1">
            Next Unlock
          </p>
          <h3 className="text-sm font-semibold text-slate-100 leading-snug">
            Phase {phaseOrder} &middot; {phaseLabel}
          </h3>
        </div>
        {/* Pct badge */}
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${pctColor} bg-white/5 border border-white/10`}
        >
          {clamped}%
        </span>
      </div>

      {/* Progress bar */}
      <div>
        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${clamped}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          {clamped === 100
            ? "All exit conditions met — ready to advance"
            : `${clamped}% of exit conditions met`}
        </p>
      </div>

      {/* Top-3 blockers */}
      {top3.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium mb-2">
            Blockers
          </p>
          <ul className="space-y-2">
            {top3.map((b) => (
              <li
                key={`${b.code}::${b.subject}`}
                className="flex items-start gap-2"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-200 truncate">
                    {BLOCKER_CODE_LABEL[b.code] ?? b.code}
                    {" — "}
                    <span className="font-normal text-slate-400">{b.subject}</span>
                  </p>
                  <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2">
                    {b.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next action */}
      {nextAction && (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium mb-1">
            Next action
          </p>
          <p className="text-xs text-slate-200 leading-relaxed">{nextAction}</p>
        </div>
      )}
    </div>
  );
}

export default NextUnlockCard;
