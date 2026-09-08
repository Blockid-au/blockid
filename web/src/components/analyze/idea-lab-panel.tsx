"use client";

// IdeaLabPanel — renders the founder's typed idea as a "manuscript"
// card and then flips to a stage-classification card before dimension
// deep-dive opens. Uses the canonical stage vocabulary so the label
// matches the rest of the app.

import * as React from "react";
import { cn } from "@/lib/utils";
import { CANONICAL_STAGE_LABELS, type StageKey } from "@/lib/journey-vocabulary";
import { Sparkles } from "lucide-react";

export type IdeaLabPhase = "manuscript" | "classifying" | "classified";

export interface IdeaClassification {
  stage: StageKey;
  confidence: number;
  reasons: string[];
}

export interface IdeaLabPanelProps {
  ideaText: string;
  phase: IdeaLabPhase;
  classification?: IdeaClassification | null;
  className?: string;
}

export function IdeaLabPanel({
  ideaText,
  phase,
  classification,
  className,
}: IdeaLabPanelProps) {
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
