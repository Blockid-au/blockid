"use client";

// IdeaLabPanel — renders the founder's typed idea as a "manuscript"
// card and then flips to a stage-classification card before the
// dimension deep-dive opens.
//
// Modes:
//   1. Legacy — pass `ideaText` + `phase` + `classification` explicitly
//      (used by tests and callers with their own classifier state).
//   2. `intake` prop — read `intake.rawText` and derive the classification
//      from `intake.context` (stage/maturity/evidenceCompleteness). The
//      panel shows the stage card BEFORE running any deep-dive, honouring
//      the "explain what we saw before charging credits" principle. Fires
//      `onDone(intake)` after a short pause so the founder can read the
//      classification before the results view mounts.

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  CANONICAL_STAGE_LABELS,
  sviStageToCanonical,
  type StageKey,
} from "@/lib/journey-vocabulary";
import { Sparkles } from "lucide-react";
import type { IntakeResult } from "@/lib/intake/analyze-input";
import type { IntakeContext } from "@/lib/intake/detect-context";

export type IdeaLabPhase = "manuscript" | "classifying" | "classified";

export interface IdeaClassification {
  stage: StageKey;
  confidence: number;
  reasons: string[];
}

export interface IdeaLabPanelProps {
  /** Legacy — pass everything explicitly. */
  ideaText?: string;
  phase?: IdeaLabPhase;
  classification?: IdeaClassification | null;
  /**
   * Preferred — drive the panel off the /api/intake result. The panel
   * reads intake.rawText for the manuscript body and intake.context for
   * the stage classification card.
   */
  intake?: IntakeResult;
  /** Fired after the classification card has rendered for `holdMs`. */
  onDone?: (intake: IntakeResult) => void;
  /** How long to hold the classification card before firing onDone. */
  holdMs?: number;
  className?: string;
}

/** Human-readable reasons pulled from an IntakeContext. */
function reasonsFromContext(ctx: IntakeContext): string[] {
  const out: string[] = [];
  out.push(
    `Maturity heuristics point at ${ctx.maturity} (${Math.round(
      ctx.evidenceCompleteness * 100,
    )}% signal completeness).`,
  );
  if (ctx.missingSignals.length > 0) {
    out.push(`Missing: ${ctx.missingSignals.slice(0, 3).join(", ")}`);
  }
  out.push(`Growth phase: ${ctx.growthPhaseId.replace(/_/g, " ")}`);
  return out;
}

/** Confidence proxy from IntakeContext.evidenceCompleteness (0..1). */
function confidenceFromContext(ctx: IntakeContext): number {
  // Floor at 0.35 so even a bare idea shows a visible confidence bar.
  return Math.max(0.35, ctx.evidenceCompleteness);
}

export function IdeaLabPanel({
  ideaText: ideaTextProp,
  phase: phaseProp,
  classification: classificationProp,
  intake,
  onDone,
  holdMs = 1400,
  className,
}: IdeaLabPanelProps) {
  const doneRef = React.useRef(false);
  React.useEffect(() => {
    if (!intake) return;
    doneRef.current = false;
    const t = window.setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone?.(intake);
    }, holdMs);
    return () => window.clearTimeout(t);
  }, [intake, onDone, holdMs]);

  // Derive props from intake when in intake mode.
  const derivedIdeaText = intake?.rawText ?? ideaTextProp ?? "";
  const derivedClassification: IdeaClassification | null = intake?.context
    ? {
        stage: sviStageToCanonical(intake.context.stage),
        confidence: confidenceFromContext(intake.context),
        reasons: reasonsFromContext(intake.context),
      }
    : classificationProp ?? null;
  const derivedPhase: IdeaLabPhase =
    phaseProp ?? (intake ? "classified" : "manuscript");

  const ideaText = derivedIdeaText;
  const phase = derivedPhase;
  const classification = derivedClassification;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line-subtle bg-surface-raised p-4",
        className,
      )}
      data-testid="idea-lab-panel"
      data-phase={phase}
    >
      <header>
        <p className="text-xs uppercase tracking-[0.14em] text-tertiary">
          Idea lab
        </p>
        <p className="text-sm text-primary">
          {phase === "manuscript" && "Read: your idea"}
          {phase === "classifying" && "Classifying your idea…"}
          {phase === "classified" && "Stage classified"}
        </p>
      </header>

      {/* Manuscript card — always visible so the founder sees what we read. */}
      <article
        className={cn(
          "relative overflow-hidden rounded-xl border p-3 transition-colors",
          phase === "classified"
            ? "border-line-subtle bg-surface text-muted"
            : "border-line-subtle bg-surface text-primary",
        )}
      >
        <p className="mb-1 text-[11px] uppercase tracking-wider text-tertiary">
          Your submission
        </p>
        <p className="whitespace-pre-wrap text-sm leading-snug">
          {ideaText.trim().length === 0
            ? "(no text yet)"
            : ideaText.slice(0, 800)}
          {ideaText.length > 800 && "…"}
        </p>
      </article>

      {phase !== "manuscript" && (
        <article
          className={cn(
            "rounded-xl border p-3",
            classification
              ? "border-svi-500 bg-svi-500/5"
              : "border-line-subtle bg-surface",
          )}
          data-testid="stage-classification-card"
        >
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-svi-500" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider text-svi-500">
              Stage classification
            </span>
          </div>
          {classification ? (
            <>
              <p className="text-lg font-semibold text-primary">
                {CANONICAL_STAGE_LABELS[classification.stage].label_en}
              </p>
              <div
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover"
                aria-label="confidence"
              >
                <div
                  className="h-full bg-svi-500 transition-all"
                  style={{
                    width: `${Math.max(3, Math.min(100, Math.round(classification.confidence * 100)))}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                {Math.round(classification.confidence * 100)}% confidence
              </p>
              {classification.reasons.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-secondary">
                  {classification.reasons.slice(0, 5).map((r, i) => (
                    <li key={`${r}-${i}`}>· {r}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-xs italic text-muted">
              Waiting on the classifier…
            </p>
          )}
        </article>
      )}
    </div>
  );
}

export default IdeaLabPanel;
