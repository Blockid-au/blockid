/**
 * GrowthPhaseStrip — a compact horizontal indicator showing the 12 startup
 * growth phases as pills. Used at the top of public demo pages so visitors
 * can see the same journey model the workspace sidebar (post-menu-IA
 * restructure) organises itself around.
 *
 * Contract mirrors the shape of `renderGrowthJourneySVG()` — the same
 * `GROWTH_PHASES` array drives both surfaces so any renumbering flows
 * through automatically.
 *
 * Server component. No client state. Two visual modes:
 *   - `variant="menu"` (default) renders a nav-like list of phase names
 *     under a small "Startup journey" eyebrow, mirroring the pillar
 *     layout of the new workspace sidebar (Overview → Now → Coming up).
 *   - `variant="indicator"` renders a compact pill row highlighting the
 *     `currentPhase` (order index 1..12), useful when the demo page is
 *     scoped to a single walkthrough phase.
 *
 * Both modes are keyboard-focusable and expose `data-testid="growth-phase-strip"`
 * plus per-phase `data-phase="<order>"` markers so E2E can hook in without
 * scraping visible copy.
 */

import { GROWTH_PHASES } from "@/lib/startup-growth-phases";

export interface GrowthPhaseStripProps {
  /** 1-indexed phase to highlight. Omit to render the neutral menu view. */
  currentPhase?: number;
  /** Toggle between the vertical menu and the compact indicator strip. */
  variant?: "menu" | "indicator";
  /** Optional caption above the strip. Falls back to a sensible default. */
  eyebrow?: string;
  /** Optional href pattern for each phase — receives the phase id. Omit to
   * render inert markers (default for the demo page). */
  hrefFor?: (phaseId: string) => string;
  className?: string;
}

const DEFAULT_EYEBROW = "Startup journey";

export function GrowthPhaseStrip({
  currentPhase,
  variant = "indicator",
  eyebrow = DEFAULT_EYEBROW,
  hrefFor,
  className,
}: GrowthPhaseStripProps) {
  const phases = GROWTH_PHASES;
  const activeOrder =
    typeof currentPhase === "number" && currentPhase >= 1 && currentPhase <= phases.length
      ? currentPhase
      : null;

  return (
    <section
      aria-label="Startup growth phase progress"
      data-testid="growth-phase-strip"
      data-variant={variant}
      className={
        "border-b border-white/5 bg-[var(--fintech-surface,#0b1223)]/60 " +
        (className ?? "")
      }
    >
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--fintech-ink-muted,#94a3b8)]">
            {eyebrow}
          </p>
          {activeOrder != null && (
            <p className="text-[11px] text-[var(--fintech-ink-muted,#94a3b8)]">
              Phase {activeOrder} of {phases.length}
              {" — "}
              <span className="text-[var(--fintech-ink,#e2e8f0)]">
                {phases[activeOrder - 1]?.title}
              </span>
            </p>
          )}
        </div>

        {variant === "menu" ? (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {phases.map((phase) => {
              const isActive = activeOrder === phase.order;
              const label = (
                <span
                  className={
                    "flex items-center gap-2 rounded px-2 py-1 text-xs " +
                    (isActive
                      ? "bg-white/10 text-[var(--fintech-ink,#e2e8f0)] font-semibold"
                      : "text-[var(--fintech-ink-muted,#94a3b8)] hover:text-[var(--fintech-ink,#e2e8f0)]")
                  }
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                    style={{
                      backgroundColor: isActive ? phase.color : "rgba(255,255,255,0.08)",
                      color: isActive ? "white" : "var(--fintech-ink-muted,#94a3b8)",
                    }}
                  >
                    {phase.order}
                  </span>
                  <span className="truncate">{phase.title}</span>
                </span>
              );
              return (
                <li key={phase.id} data-phase={phase.order}>
                  {hrefFor ? (
                    <a href={hrefFor(phase.id)} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
                      {label}
                    </a>
                  ) : (
                    label
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <ol className="flex flex-wrap items-center gap-1.5">
            {phases.map((phase) => {
              const isActive = activeOrder === phase.order;
              const isPast = activeOrder != null && phase.order < activeOrder;
              return (
                <li
                  key={phase.id}
                  data-phase={phase.order}
                  data-state={isActive ? "current" : isPast ? "past" : "upcoming"}
                  className="group"
                >
                  <span
                    title={`Phase ${phase.order}: ${phase.title} — ${phase.subtitle}`}
                    className={
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors " +
                      (isActive
                        ? "border-transparent text-white shadow-sm"
                        : isPast
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : "border-white/10 bg-white/5 text-[var(--fintech-ink-muted,#94a3b8)]")
                    }
                    style={
                      isActive
                        ? { backgroundColor: phase.color }
                        : undefined
                    }
                  >
                    <span aria-hidden="true" className="font-mono text-[10px]">
                      {isPast ? "✓" : phase.order}
                    </span>
                    <span className="hidden sm:inline">{phase.title}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
