"use client";

/**
 * JourneyStepLadder — ux-ia-startup-flow-v1 §C.4 (G7 Q3 + Q4 adopted, S19-A)
 *
 * Dashboard visualisation of the full canonical 12-phase startup journey
 * (from `lib/showcase/gallery.ts:PHASE_LABELS`). The existing `<JourneyBar>`
 * shows the coarser 6-phase strip; this ladder shows the same journey at
 * the same granularity the reports + analytics use everywhere else, so a
 * founder can immediately see "where I am, what's next, what unlocks
 * later".
 *
 * Behaviour:
 *   - Desktop (>=md): horizontal rail across all 12 nodes — never fewer
 *     (G7 Q3 decision: "all 12 on desktop").
 *   - Mobile (<sm, 640px): vertical rail collapsed to the current phase +
 *     the next 2, with a "Show all 12 phases" toggle (client state only,
 *     `aria-expanded`, keyboard-reachable `<button>`). Between sm and md
 *     the vertical rail shows all 12 (enough height, no toggle).
 *   - Completed phases render as green checks (clickable — jump to their
 *     canonical landing route). The desktop rail never hides them.
 *   - Current phase pulses in brand-600, carries `id="phase-current"` +
 *     `aria-current="step"` (clickable — jumps to /dashboard).
 *   - Future phases dim to opacity-60 with a lock icon and a tooltip
 *     "Unlocks when you complete phase N".
 *   - G7 Q4 (returning founder): when the current phase's 0-based index is
 *     >= SKIP_ANCHOR_MIN_INDEX a "Skip to current phase" anchor
 *     (`href="#phase-current"`) renders at the top of the ladder — always
 *     visible on mobile, screen-reader-only-until-focus on >= sm.
 *
 * Rule: never HIDES a phase on desktop. Progressive disclosure = dim +
 * tooltip only. Breaking muscle memory is worse than clutter (goal doc §E).
 * The mobile collapse is the one sanctioned exception (Q3) and is always
 * reversible through the toggle.
 *
 * The route mapping is intentionally best-effort — every phase maps to a
 * feature the founder already has access to, so the ladder never leaves
 * the user on a 404. When we spin up dedicated /journey/<phase> landing
 * pages later, only PHASE_ROUTES needs to change.
 *
 * One `<ol>` serves both breakpoints (flex-col below md, flex-row at md+)
 * so the current phase `<li>` — and therefore `id="phase-current"` — is
 * rendered exactly once. Each `<li>` carries a desktop node and a mobile
 * node; CSS decides which is shown.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowDown, CheckCircle2, ChevronDown, Lock } from "lucide-react";
import { PHASE_LABELS } from "@/lib/showcase/gallery";
import { ALL_PHASE_KEYS, type PhaseKey } from "@/lib/journey-map";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Canonical route per 12-phase phase. Every route resolves — no 404s.
// ---------------------------------------------------------------------------
export const PHASE_ROUTES: Record<PhaseKey, string> = {
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
// G7 Q3 / Q4 constants — exported so the colocated test pins the rules.
// ---------------------------------------------------------------------------

/** DOM id of the current-phase `<li>`; the skip anchor targets it. */
export const CURRENT_PHASE_ANCHOR_ID = "phase-current";

/** Mobile collapsed window = current phase + this many upcoming phases. */
export const MOBILE_WINDOW_AFTER = 2;

/**
 * Minimum 0-based index (ordinal - 1) of the current phase for the "Skip to
 * current phase" anchor to render, i.e. at least this many completed phases
 * sit above the current one.
 */
export const SKIP_ANCHOR_MIN_INDEX = 3;

/** Phases shown on mobile while collapsed: current + next MOBILE_WINDOW_AFTER. */
export function mobileVisiblePhases(currentOrdinal: PhaseKey): PhaseKey[] {
  return ALL_PHASE_KEYS.filter(
    (k) => k >= currentOrdinal && k <= currentOrdinal + MOBILE_WINDOW_AFTER,
  );
}

/** G7 Q4 rule: skip anchor only once >= SKIP_ANCHOR_MIN_INDEX phases are behind. */
export function showsSkipAnchor(currentOrdinal: PhaseKey): boolean {
  return currentOrdinal - 1 >= SKIP_ANCHOR_MIN_INDEX;
}

// ---------------------------------------------------------------------------
// Map the dashboard's coarse 0-5 phase to the closest 12-phase ordinal.
// Kept exported so the test file can assert the mapping is stable.
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
  /**
   * Initial state of the mobile "Show all 12 phases" toggle. Default false
   * (collapsed to current + next 2). Client state after first paint.
   */
  defaultMobileExpanded?: boolean;
  className?: string;
}

const LIST_ID = "journey-step-ladder-list";

/**
 * The dashboard passes a coarse phase (0-5). Every other caller should
 * pass an ordinal (1-12).
 */
export function JourneyStepLadder({
  currentPhase,
  mode = "ordinal",
  defaultMobileExpanded = false,
  className,
}: JourneyStepLadderProps) {
  const currentOrdinal: PhaseKey =
    mode === "coarse"
      ? coarsePhaseToOrdinal(currentPhase)
      : (Math.max(1, Math.min(12, currentPhase)) as PhaseKey);

  const [mobileExpanded, setMobileExpanded] = React.useState(defaultMobileExpanded);
  const mobileWindow = mobileVisiblePhases(currentOrdinal);
  const completedCount = currentOrdinal - 1;
  const skipAnchor = showsSkipAnchor(currentOrdinal);
  const currentLabel = PHASE_LABELS[currentOrdinal].en;

  return (
    <section
      aria-labelledby="journey-step-ladder-title"
      data-testid="journey-step-ladder"
      data-current-phase={currentOrdinal}
      className={cn(
        "rounded-2xl border border-surface-200 bg-white p-4 sm:p-6 shadow-sm",
        className,
      )}
    >
      {/* G7 Q4 — returning founder: jump past the completed rungs. Visible
          on mobile (where the rail is vertical), sr-only-until-focus on
          >= sm where all 12 sit on one row anyway. */}
      {skipAnchor && (
        <a
          href={`#${CURRENT_PHASE_ANCHOR_ID}`}
          data-testid="journey-skip-to-current"
          className={cn(
            "mb-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700",
            "outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
            "sm:sr-only sm:focus:not-sr-only sm:focus:mb-3 sm:focus:inline-flex",
          )}
        >
          Skip to current phase (Phase {currentOrdinal}: {currentLabel})
          <ArrowDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </a>
      )}

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

      {/* One list, two layouts: vertical rail below md, horizontal rail at md+. */}
      <ol
        role="list"
        id={LIST_ID}
        data-mobile-expanded={mobileExpanded ? "true" : "false"}
        className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between md:gap-0"
      >
        {ALL_PHASE_KEYS.map((key, idx) => {
          const isCompleted = key < currentOrdinal;
          const isCurrent = key === currentOrdinal;
          const isFuture = key > currentOrdinal;
          // G7 Q3 — below sm the collapsed rail hides everything outside
          // current + next 2. `hidden sm:flex` keeps the node in the DOM
          // (so md+ rails are unaffected) but out of the a11y tree while
          // collapsed on a phone.
          const mobileHidden = !mobileExpanded && !mobileWindow.includes(key);
          const nodeProps = { ordinal: key, isCompleted, isCurrent, isFuture, currentOrdinal };
          return (
            <React.Fragment key={key}>
              {idx > 0 && (
                <li
                  aria-hidden
                  className={cn(
                    "hidden md:block flex-1 h-0.5 mt-4 transition-colors duration-500 motion-reduce:transition-none",
                    key <= currentOrdinal ? "bg-emerald-500" : "bg-surface-200",
                  )}
                />
              )}
              <li
                id={isCurrent ? CURRENT_PHASE_ANCHOR_ID : undefined}
                aria-current={isCurrent ? "step" : undefined}
                data-phase={key}
                data-mobile-collapsed={mobileHidden ? "true" : undefined}
                className={cn(
                  mobileHidden ? "hidden sm:flex" : "flex",
                  "items-center gap-3 rounded-lg px-2 py-2 scroll-mt-24",
                  "md:w-20 md:shrink-0 md:flex-col md:items-center md:gap-0 md:rounded-none md:px-0 md:py-0",
                  isCurrent && "bg-brand-50 ring-1 ring-brand-100 md:bg-transparent md:ring-0",
                  isFuture && "opacity-60 md:opacity-100",
                )}
              >
                {/* Desktop node first so `.first()` in E2E picks the visible one on a 1280px viewport. */}
                <div className="hidden md:flex md:flex-col md:items-center">
                  <PhaseNode {...nodeProps} />
                </div>
                <div className="flex w-full items-center gap-3 md:hidden">
                  <MobileNode {...nodeProps} />
                </div>
              </li>
            </React.Fragment>
          );
        })}
      </ol>

      {/* G7 Q3 — mobile-only toggle. Client state; never rendered at >= sm. */}
      <button
        type="button"
        onClick={() => setMobileExpanded((v) => !v)}
        aria-expanded={mobileExpanded}
        aria-controls={LIST_ID}
        data-testid="journey-show-all-toggle"
        className={cn(
          "sm:hidden mt-2 flex w-full min-h-11 items-center justify-center gap-2 rounded-lg border border-surface-200 px-3 py-2",
          "text-xs font-semibold text-brand-700 hover:bg-brand-50 outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
          "transition-colors duration-150 motion-reduce:transition-none",
        )}
      >
        <span>{mobileExpanded ? "Show fewer phases" : "Show all 12 phases"}</span>
        {!mobileExpanded && completedCount > 0 && (
          <span className="font-normal text-ink-500">· {completedCount} completed</span>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none",
            mobileExpanded && "rotate-180",
          )}
          strokeWidth={2}
          aria-hidden
        />
      </button>
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
          "relative flex items-center justify-center rounded-full h-8 w-8 transition-all duration-300 motion-reduce:transition-none",
          isCompleted && "bg-emerald-500",
          isCurrent && "bg-brand-600 ring-4 ring-brand-100 animate-pulse motion-reduce:animate-none",
          isFuture && "bg-surface-200",
        )}
        aria-label={`Phase ${ordinal}: ${label}${isCurrent ? " (current)" : isCompleted ? " (completed)" : " (upcoming)"}`}
      >
        {isCompleted && <CheckCircle2 className="h-4 w-4 text-primary" strokeWidth={2.5} />}
        {isCurrent && <span className="text-[11px] font-bold text-primary">{ordinal}</span>}
        {isFuture && <Lock className="h-3 w-3 text-muted" strokeWidth={2} aria-hidden />}
      </div>
      <span
        className={cn(
          "mt-1.5 text-[9.5px] leading-tight font-medium text-center select-none max-w-[72px]",
          isCompleted && "text-emerald-700",
          isCurrent && "text-brand-700 font-semibold",
          isFuture && "text-muted",
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
          isCompleted && "bg-emerald-500 text-primary",
          isCurrent && "bg-brand-600 text-white ring-2 ring-brand-100",
          isFuture && "bg-surface-200 text-muted",
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
          <p className="text-[10px] text-muted">
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
        className="flex items-center gap-3 w-full min-h-11 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div
      data-testid={`journey-step-node-${ordinal}`}
      className="flex items-center gap-3 w-full min-h-11"
      aria-label={`Phase ${ordinal} ${label} — unlocks after phase ${currentOrdinal}`}
    >
      {inner}
    </div>
  );
}

export default JourneyStepLadder;
