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

import Link from "next/link";
import type { PhaseBlocker } from "@/lib/growth/phase-gate";
import type { GrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import { GROWTH_PHASE_LABELS, growthPhaseOrder } from "@/lib/growth/phase-taxonomy";

export interface NextUnlockCardProps {
  currentPhase: GrowthPhaseId;
  completionPct: number;
  topBlockers: readonly PhaseBlocker[];
  nextAction: string | null;
  /**
   * Release QA-2 F8 — "start here" state for a founder with no project /
   * no phase yet. The dashboard used to render nothing, so a fresh founder
   * never saw the phase ladder at all. Renders Phase 1 · 0 % with a single
   * CTA to /analyze (the first score creates the project + phase).
   */
  startHere?: boolean;
}

/** Props for the "start here" state — exported so the page + tests share one definition. */
export const NEXT_UNLOCK_START_HERE: NextUnlockCardProps = {
  currentPhase: "vision",
  completionPct: 0,
  topBlockers: [],
  nextAction: "Run your first SVI score — it creates your startup profile and unlocks the phase ladder.",
  startHere: true,
};

const BLOCKER_CODE_LABEL: Record<string, string> = {
  missing_required_criteria: "Missing evidence",
  criteria_below_threshold: "Needs improvement",
  dimension_below_floor: "SVI dimension too low",
  deliverables_incomplete: "Deliverable incomplete",
};

/**
 * Colour band for the progress bar and pct label — semantic bull / warn /
 * bear tokens (AA in light and dark; S8-B a11y audit replaced the fixed
 * emerald/amber/rose-400 shades that failed on the light dashboard). The
 * percentage text beside the bar carries the meaning, never colour alone.
 */
export function progressColor(pct: number): string {
  if (pct >= 80) return "bg-bull";
  if (pct >= 50) return "bg-warn";
  return "bg-bear";
}

export function progressTextColor(pct: number): string {
  if (pct >= 80) return "text-bull";
  if (pct >= 50) return "text-warn";
  return "text-bear";
}

export function NextUnlockCard({
  currentPhase,
  completionPct,
  topBlockers,
  nextAction,
  startHere = false,
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
      data-start-here={startHere ? "true" : undefined}
      className="rounded-2xl border border-line-subtle bg-surface p-5 space-y-4"
      role="region"
      aria-labelledby="next-unlock-heading"
    >
      {/* Header — phase ordinal + label */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-tertiary font-medium mb-1">
            Next Unlock
            {/* G8-P8 — founder-facing phase × plan matrix + exit criteria. */}
            <Link
              href="/docs/unlocks"
              className="ml-2 inline-flex min-h-6 items-center normal-case tracking-normal text-secondary underline decoration-line-strong underline-offset-2 hover:text-action"
            >
              How unlocks work
            </Link>
          </p>
          <h3 id="next-unlock-heading" className="text-sm font-semibold text-primary leading-snug">
            Phase {phaseOrder} &middot; {phaseLabel}
          </h3>
        </div>
        {/* Pct badge */}
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${pctColor} bg-surface-sunken border border-line-subtle`}
        >
          {clamped}%
        </span>
      </div>

      {/* Progress bar */}
      <div>
        <div
          className="h-1.5 w-full rounded-full bg-surface-hover overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clamped}
          aria-label="Exit conditions met"
        >
          <div
            className={`h-full rounded-full transition-all duration-700 motion-reduce:transition-none ${barColor}`}
            style={{ width: `${clamped}%` }}
          />
        </div>
        <p className="text-[10px] text-tertiary mt-1">
          {startHere
            ? "Start here — nothing scored yet"
            : clamped === 100
              ? "All exit conditions met — ready to advance"
              : `${clamped}% of exit conditions met`}
        </p>
      </div>

      {/* Start-here CTA (no project / no phase yet) */}
      {startHere && (
        <Link
          href="/analyze"
          data-testid="next-unlock-start-cta"
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-action px-4 text-xs font-semibold text-on-action hover:bg-action-hover transition-colors"
        >
          Score my startup
        </Link>
      )}

      {/* Top-3 blockers */}
      {top3.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-tertiary font-medium mb-2">
            Blockers
          </p>
          <ul className="space-y-2">
            {top3.map((b) => (
              <li
                key={`${b.code}::${b.subject}`}
                className="flex items-start gap-2"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-bear" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-primary break-words">
                    {BLOCKER_CODE_LABEL[b.code] ?? b.code}
                    {" — "}
                    <span className="font-normal text-secondary">{b.subject}</span>
                  </p>
                  <p className="text-[10px] text-tertiary leading-relaxed line-clamp-2" title={b.detail}>
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
        <div className="rounded-xl border border-line-subtle bg-surface-sunken px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-tertiary font-medium mb-1">
            Next action
          </p>
          <p className="text-xs text-primary leading-relaxed">{nextAction}</p>
        </div>
      )}
    </div>
  );
}

export default NextUnlockCard;
