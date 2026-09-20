/**
 * SequenceFlow — the product in one horizontal flow (G21 P0-B): Founder
 * application → Evidence extracted → SVI + confidence → Evaluator dossier →
 * Cohort table → Progress over time. One row of icon tiles joined by the
 * shared `FlowArrow` on `lg`, a compact vertical list with down arrows
 * below it — never a 15-card wall and never a sideways scroll at 375 px.
 *
 * The WHOLE block links to one page (`href`, `/product` on the home) with
 * the stretched-link pattern: the list stays ordinary content for screen
 * readers and the one `<a>` at the foot carries the accessible name; its
 * `after:` box covers the block so a pointer can click anywhere on it. The
 * link is ≥ 44 px tall and carries the shared focus ring.
 *
 * Server component. Tokens only.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FlowArrow } from "./ProblemFlow";
import { FOCUS_RING, MOTION } from "./primitives";

export interface SequenceStep {
  icon: LucideIcon;
  title: string;
  /** One short clause (≤ 8 words) under the title. */
  caption?: ReactNode;
}

export interface SequenceFlowProps {
  steps: readonly SequenceStep[];
  /** Where the whole block goes (the stretched link). */
  href: string;
  /** The visible link label at the foot of the block. */
  linkLabel: string;
  ctaId?: string;
  ariaLabel?: string;
  className?: string;
}

export function SequenceFlow({
  steps,
  href,
  linkLabel,
  ctaId,
  ariaLabel = "How it works",
  className,
}: SequenceFlowProps) {
  return (
    <div
      data-testid="sequence-flow"
      className={cn(
        "relative rounded-2xl border border-line-subtle bg-surface p-5 shadow-1 sm:p-8",
        "hover:border-line hover:shadow-2",
        MOTION,
        className,
      )}
    >
      <ol
        aria-label={ariaLabel}
        className="flex flex-col gap-1 lg:flex-row lg:items-stretch lg:gap-0"
      >
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className="flex flex-col lg:flex-1 lg:flex-row lg:items-stretch">
              {i > 0 ? <FlowArrow className="lg:px-0" /> : null}
              <div className="flex w-full items-center gap-4 rounded-lg px-2 py-2 lg:flex-col lg:items-center lg:gap-3 lg:px-1 lg:text-center">
                <span
                  aria-hidden
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"
                >
                  <Icon size={22} strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <span className="block font-display text-sm font-semibold tracking-tight text-primary sm:text-base">
                    <span className="sr-only">Step {i + 1}: </span>
                    {step.title}
                  </span>
                  {step.caption ? (
                    <span className="mt-0.5 block text-xs leading-snug text-muted sm:text-sm">{step.caption}</span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-6 flex justify-center border-t border-line-subtle pt-5">
        <Link
          href={href}
          data-cta-id={ctaId}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-action hover:text-action-hover",
            "after:absolute after:inset-0 after:rounded-2xl after:content-['']",
            MOTION,
            FOCUS_RING,
          )}
        >
          {linkLabel}
          <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
