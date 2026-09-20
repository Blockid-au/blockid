/**
 * ProblemFlow — three (or more) linked problem steps joined by inline SVG
 * arrows (G21 P0-B, docs/plans/g21-fi-upgrade-2026-09-20.md § P0-B). The
 * homepage uses it for "Startup screening was not designed to scale":
 * Different inputs → Subjective review → Weak feedback.
 *
 * Each step is a card with a two-digit index, a title, one sentence and a
 * short list of concrete examples (rendered as quiet chips). The arrow
 * between steps is one inline `<svg>` that points right in the row layout
 * (`lg` and up) and down when the steps stack (375 px) — the same glyph,
 * rotated, so nothing is duplicated and the flow reads top-to-bottom on a
 * phone without a horizontal scroll.
 *
 * Tokens only (no raw hex — template.test.tsx pins it); Lucide is not
 * needed here because the arrow is the one glyph. Server component.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ProblemStep {
  title: string;
  body: ReactNode;
  /** Concrete examples shown as chips under the sentence (≤ 6 keeps the card short). */
  examples?: readonly string[];
}

export interface ProblemFlowProps {
  steps: readonly ProblemStep[];
  /** Accessible name for the ordered list. */
  ariaLabel?: string;
  className?: string;
}

/** The connector: right-pointing on a row, down-pointing when stacked. */
export function FlowArrow({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-flow-arrow
      className={cn(
        "flex shrink-0 items-center justify-center py-1 text-accent lg:px-1 lg:py-0",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6 rotate-90 lg:rotate-0"
      >
        <path d="M4 12h15" />
        <path d="m13 6 6 6-6 6" />
      </svg>
    </span>
  );
}

const CARD =
  "flex h-full w-full flex-col gap-3 rounded-xl border border-line-subtle bg-surface p-6 shadow-1";

export function ProblemFlow({ steps, ariaLabel = "The problem", className }: ProblemFlowProps) {
  return (
    <ol
      aria-label={ariaLabel}
      data-testid="problem-flow"
      className={cn("flex flex-col lg:flex-row lg:items-stretch", className)}
    >
      {steps.map((step, i) => (
        <li key={step.title} className="flex flex-col lg:flex-1 lg:flex-row lg:items-stretch">
          {i > 0 ? <FlowArrow /> : null}
          <div className={CARD}>
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="font-display text-lg font-semibold tracking-tight text-primary">
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed text-secondary">{step.body}</p>
            {step.examples && step.examples.length > 0 ? (
              <ul aria-label={`${step.title} — examples`} className="mt-auto flex flex-wrap gap-1.5 pt-1">
                {step.examples.map((ex) => (
                  <li
                    key={ex}
                    className="rounded-md bg-surface-sunken px-2 py-1 text-xs font-medium text-secondary"
                  >
                    {ex}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
