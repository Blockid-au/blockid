"use client";

/**
 * JourneyStepLadder — ux-ia-startup-flow-v1 §C.4
 *
 * Dashboard visualisation of the full canonical 12-phase startup journey
 * (from `lib/showcase/gallery.ts:PHASE_LABELS`). The existing `<JourneyBar>`
 * shows the coarser 6-phase strip; this ladder shows the same journey at
 * the same granularity the reports + analytics use everywhere else, so a
 * founder can immediately see "where I am, what's next, what unlocks
 * later".
 *
 * Behaviour:
 *   - Desktop (>=md): horizontal rail across 12 nodes.
 *   - Mobile: vertical rail, one node per row.
 *   - Completed phases render as green checks (clickable — jump to their
 *     canonical route).
 *   - Current phase pulses in brand-600 (clickable — jumps to /dashboard).
 *   - Future phases dim to opacity-60 with a lock icon and a tooltip
 *     "Unlocks when you complete phase N".
 *
 * Rule: never HIDES a phase. Progressive disclosure = dim + tooltip only.
 * Breaking muscle memory is worse than clutter (goal doc §E).
 *
 * The route mapping is intentionally best-effort — every phase maps to a
 * feature the founder already has access to, so the ladder never leaves
 * the user on a 404. When we spin up dedicated /journey/<phase> landing
 * pages later, only PHASE_ROUTES needs to change.
 */

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Lock } from "lucide-react";
import { PHASE_LABELS } from "@/lib/showcase/gallery";
import { ALL_PHASE_KEYS, type PhaseKey } from "@/lib/journey-map";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Canonical route per 12-phase phase. Every route resolves — no 404s.
// ---------------------------------------------------------------------------
const PHASE_ROUTES: Record<PhaseKey, string> = {
  1: "/dashboard",                        // Vision / Day-0 Idea
  2: "/workspace/evaluation",             // Idea Validation
  3: "/dashboard/benchmark",              // Market Research
  4: "/workspace/evidence",               // MVP / Product Discovery
  5: "/workspace/metrics",                // PMF / Early Traction
  6: "/workspace/revenue",                // Revenue / Business Model
  7: "/dashboard/finance",                // Growth / Analytics
  8: "/dashboard/team",                   // Team & Culture
  9: "/dashboard/fundraise",              // Funding-Ready
  10: "/workspace/data-room",             // Fundraise / Term Sheet
  11: "/workspace/revenue",               // Post-Funding / Scale
  12: "/workspace/exit",                  // Exit / Beyond
};

// ---------------------------------------------------------------------------
// Map the dashboard's coarse 0-5 phase to the closest 12-phase ordinal.
// Kept exported so the (future) test file can assert the mapping is stable.
// ---------------------------------------------------------------------------
export function coarsePhaseToOrdinal(coarse: number): PhaseKey {
  // 0 Idea, 1 Validation, 2 Equity/Build, 3 Fundraise, 4 Traction, 5 Growth
  const table: Record<number, PhaseKey> = {
    0: 1,   // Vision
    1: 3,   // Market Research (already validated the idea if we got here)
    2: 5,   // PMF (once equity is set the founder has product usage signal)
    3: 9,   // Funding-Ready
    4: 7,   // Growth analytics
    5: 11,  // Post-funding scale
  };
  return table[Math.max(0, Math.min(5, coarse))] ?? 1;
}

export interface JourneyStepLadderProps {
  /**
   * Founder's current phase — either the coarse 0-5 scale from the
   * dashboard (pass `mode: "coarse"`) or the canonical 1-12 ordinal
   * from `journey-map.ts` (default). The ladder always displays 12 nodes.
   */
  currentPhase: number;
  /** How to interpret `currentPhase`. Default: "ordinal" (1-12). */
  mode?: "ordinal" | "coarse";
  className?: string;
}

/**
 * The dashboard passes a coarse phase (0-5). Every other caller should
 * pass an ordinal (1-12).
 */
export function JourneyStepLadder({
  currentPhase,
  mode = "ordinal",
  className,
}: JourneyStepLadderProps) {
  const currentOrdinal: PhaseKey =
    mode === "coarse"
      ? coarsePhaseToOrdinal(currentPhase)
      : (Math.max(1, Math.min(12, currentPhase)) as PhaseKey);

  return (
    <section
      aria-labelledby="journey-step-ladder-title"
      data-testid="journey-step-ladder"
      className={cn(
        "rounded-2xl border border-surface-200 bg-white p-4 sm:p-6 shadow-sm",
        className,
      )}
    >
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2
            id="journey-step-ladder-title"
            className="text-sm font-semibold text-ink-800 tracking-wide"
          >
            Your 12-phase journey
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">
            You are on phase {currentOrdinal} of 12. Completed phases are
            green; upcoming phases unlock as you complete each step.
          </p>
        </div>
        <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-wider text-brand-600 bg-brand-50 px-2 py-0.5 rounded">
          Where am I?
        </span>
      </header>

      {/* Desktop horizontal rail */}
      <ol
        role="list"
        className="hidden md:flex md:items-start md:justify-between md:gap-0"
      >
        {ALL_PHASE_KEYS.map((key, idx) => {
          const isCompleted = key < currentOrdinal;
          const isCurrent = key === currentOrdinal;
          const isFuture = key > currentOrdinal;
          return (
            <React.Fragment key={key}>
              {idx > 0 && (
                <li
                  aria-hidden
                  className={cn(
                    "flex-1 h-0.5 mt-4 transition-colors duration-500",
                    key <= currentOrdinal ? "bg-emerald-500" : "bg-surface-200",
                  )}
                />
              )}
              <li className="flex flex-col items-center flex-shrink-0 w-16 sm:w-20">
                <PhaseNode
                  ordinal={key}
                  isCompleted={isCompleted}
                  isCurrent={isCurrent}
                  isFuture={isFuture}
                  currentOrdinal={currentOrdinal}
                />
              </li>
            </React.Fragment>
          );
        })}
      </ol>

      {/* Mobile vertical rail */}
      <ol role="list" className="md:hidden flex flex-col gap-1">
        {ALL_PHASE_KEYS.map((key) => {
          const isCompleted = key < currentOrdinal;
          const isCurrent = key === currentOrdinal;
          const isFuture = key > currentOrdinal;
          return (
            <li
              key={key}
              className={cn(
                "flex items-center gap-3 py-2 px-2 rounded-lg",
                isCurrent && "bg-brand-50 ring-1 ring-brand-100",
                isFuture && "opacity-60",
              )}
            >
              <MobileNode
                ordinal={key}
                isCompleted={isCompleted}
                isCurrent={isCurrent}
                isFuture={isFuture}
                currentOrdinal={currentOrdinal}
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Desktop node — circle + label + optional tooltip
// ---------------------------------------------------------------------------
interface NodeProps {
  ordinal: PhaseKey;
  isCompleted: boolean;
  isCurrent: boolean;
  isFuture: boolean;
  currentOrdinal: PhaseKey;
}

function PhaseNode({ ordinal, isCompleted, isCurrent, isFuture, currentOrdinal }: NodeProps) {
  const [tooltip, setTooltip] = React.useState(false);
  const label = PHASE_LABELS[ordinal].en;
  const href = PHASE_ROUTES[ordinal];

  const circle = (
    <div
      className="relative flex flex-col items-center"
      onMouseEnter={() => setTooltip(true)}
      onMouseLeave={() => setTooltip(false)}
      onFocus={() => setTooltip(true)}
      onBlur={() => setTooltip(false)}
    >
      {tooltip && (
        <div
          role="tooltip"
          className="absolute -top-11 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg pointer-events-none"
        >
          {isFuture
            ? `Unlocks after phase ${currentOrdinal}`
            : label}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-ink-900" />
        </div>
      )}
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full h-8 w-8 transition-all duration-300",
          isCompleted && "bg-emerald-500",
          isCurrent && "bg-brand-600 ring-4 ring-brand-100 animate-pulse",
          isFuture && "bg-surface-200",
        )}
        aria-label={`Phase ${ordinal}: ${label}${isCurrent ? " (current)" : isCompleted ? " (completed)" : " (upcoming)"}`}
      >
        {isCompleted && <CheckCircle2 className="h-4 w-4 text-white" strokeWidth={2.5} />}
        {isCurrent && <span className="text-[11px] font-bold text-white">{ordinal}</span>}
        {isFuture && <Lock className="h-3 w-3 text-ink-400" strokeWidth={2} aria-hidden />}
      </div>
      <span
        className={cn(
          "mt-1.5 text-[9.5px] leading-tight font-medium text-center select-none max-w-[72px]",
          isCompleted && "text-emerald-700",
          isCurrent && "text-brand-700 font-semibold",
          isFuture && "text-ink-400",
        )}
      >
        {label}
      </span>
    </div>
  );

  if (isCompleted || isCurrent) {
    return (
      <Link
        href={href}
        className="outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg"
        data-testid={`journey-step-node-${ordinal}`}
      >
        {circle}
      </Link>
    );
  }
  return (
    <div data-testid={`journey-step-node-${ordinal}`} className="cursor-not-allowed">
      {circle}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile node — full-width row
// ---------------------------------------------------------------------------
function MobileNode({ ordinal, isCompleted, isCurrent, isFuture, currentOrdinal }: NodeProps) {
  const label = PHASE_LABELS[ordinal].en;
  const href = PHASE_ROUTES[ordinal];
  const inner = (
    <>
      <div
        className={cn(
          "flex items-center justify-center rounded-full h-8 w-8 shrink-0",
          isCompleted && "bg-emerald-500 text-white",
          isCurrent && "bg-brand-600 text-white ring-2 ring-brand-100",
          isFuture && "bg-surface-200 text-ink-400",
        )}
        aria-hidden
      >
        {isCompleted ? (
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
        ) : isCurrent ? (
          <span className="text-[11px] font-bold">{ordinal}</span>
        ) : (
          <Lock className="h-3 w-3" strokeWidth={2} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium truncate",
            isCurrent ? "text-brand-700" : isCompleted ? "text-emerald-700" : "text-ink-500",
          )}
        >
          Phase {ordinal} · {label}
        </p>
        {isFuture && (
          <p className="text-[10px] text-ink-400">
            Unlocks after phase {currentOrdinal}
          </p>
        )}
      </div>
    </>
  );

  if (isCompleted || isCurrent) {
    return (
      <Link
        href={href}
        data-testid={`journey-step-node-${ordinal}`}
        className="flex items-center gap-3 w-full outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div
      data-testid={`journey-step-node-${ordinal}`}
      className="flex items-center gap-3 w-full"
      aria-label={`Phase ${ordinal} ${label} — unlocks after phase ${currentOrdinal}`}
    >
      {inner}
    </div>
  );
}

export default JourneyStepLadder;
