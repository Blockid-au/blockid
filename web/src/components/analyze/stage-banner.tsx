"use client";

// StageBanner — sticky top chip that shows the detected canonical stage
// and its supporting evidence. The colour comes from the mapped
// GROWTH_PHASES entry so the banner stays visually consistent with the
// journey map elsewhere in the app.

import * as React from "react";
import {
  CANONICAL_STAGE_LABELS,
  CANONICAL_STAGES,
  type StageKey,
} from "@/lib/journey-vocabulary";
import { GROWTH_PHASES, getCurrentPhase } from "@/lib/startup-growth-phases";
import { GROWTH_PHASE_TO_STAGE } from "@/lib/journey-map";
import { cn } from "@/lib/utils";
import { ChevronDown, Info } from "lucide-react";

export type StageSignalSource = "slide" | "url" | "text" | "signal";

export interface StageSignal {
  /** Short human-readable reason (e.g. "traction slide mentions 12 paying pilots"). */
  label: string;
  /** Where the signal came from — drives icon in the popover. */
  source: StageSignalSource;
  /** Optional pointer back to the evidence (slide #, URL, text excerpt). */
  reference?: string;
}

export interface StageBannerProps {
  /** Canonical stage the classifier landed on. */
  stage: StageKey;
  /** 0-1 detector confidence. */
  confidence?: number;
  /** Evidence bullets shown in the "Why this stage?" popover. */
  signals?: StageSignal[];
  /** Optional override link — user tells us "not right?". */
  onOverride?: () => void;
  className?: string;
}

/** Look up a display colour for the canonical stage via the growth-phase bridge. */
export function colorForStage(stage: StageKey): string {
  // Find a growth phase whose canonical mapping equals `stage` — that
  // phase's colour is what the journey map uses today, so the banner
  // stays visually consistent with the SVG timeline.
  const phaseId = Object.entries(GROWTH_PHASE_TO_STAGE).find(
    ([, canonical]) => canonical === stage,
  )?.[0];
  const phase = GROWTH_PHASES.find((p) => p.id === phaseId);
  if (phase) return phase.color;
  // Fallback: pick by SVI-stage index for stages without a direct mapping.
  const idx = CANONICAL_STAGES.indexOf(stage);
  const scaledSvi = idx <= 0 ? 0 : Math.min(11, idx * 1.5);
  return getCurrentPhase(scaledSvi).color;
}

const SOURCE_ICON: Record<StageSignalSource, string> = {
  slide: "SL",
  url: "URL",
  text: "TXT",
  signal: "•",
};

export function StageBanner({
  stage,
  confidence,
  signals = [],
  onOverride,
  className,
}: StageBannerProps) {
  const [open, setOpen] = React.useState(false);
  const labels = CANONICAL_STAGE_LABELS[stage] ?? CANONICAL_STAGE_LABELS.idea;
  const color = colorForStage(stage);
  const confidencePct =
    typeof confidence === "number" ? Math.round(confidence * 100) : null;

  return (
    <div
      className={cn(
        "sticky top-0 z-30 w-full border-b border-line-subtle bg-surface/90 backdrop-blur",
        className,
      )}
      data-testid="stage-banner"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-white shadow-sm"
          style={{ backgroundColor: color }}
          data-testid="stage-banner-chip"
        >
          <span aria-hidden>●</span>
          <span>{labels.label_en}</span>
        </span>
        {confidencePct !== null && (
          <span className="text-xs text-muted tabular-nums">
            {confidencePct}% confidence
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-line-subtle bg-surface-raised px-2.5 py-1 text-xs text-primary transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
          aria-expanded={open}
          aria-controls="stage-banner-reasons"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
          Why this stage?
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              open ? "rotate-180" : "rotate-0",
            )}
            aria-hidden
          />
        </button>
        {onOverride && (
          <button
            type="button"
            onClick={onOverride}
            className="text-xs font-medium text-action hover:underline"
          >
            Not right?
          </button>
        )}
      </div>
      {open && (
        <div
          id="stage-banner-reasons"
          className="mx-auto max-w-6xl px-4 pb-3 text-xs text-secondary"
        >
          {signals.length === 0 ? (
            <p className="italic text-muted">
              No source signals recorded for this classification yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {signals.map((sig, i) => (
                <li
                  key={`${sig.label}-${i}`}
                  className="flex items-start gap-2"
                >
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex h-4 items-center rounded-sm bg-surface-hover px-1 text-[10px] font-semibold uppercase text-tertiary"
                  >
                    {SOURCE_ICON[sig.source]}
                  </span>
                  <span>
                    <span className="font-medium text-primary">
                      {sig.label}
                    </span>
                    {sig.reference && (
                      <span className="ml-1 text-muted">
                        — {sig.reference}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default StageBanner;
