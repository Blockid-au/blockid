/**
 * WhyNotChatGPT — the two-column comparison (G21 P0-B, docs/plans/
 * g21-fi-upgrade-2026-09-20.md § 0): what a general chat assistant gives an
 * evaluator versus what an assessment infrastructure keeps. The point is
 * the RECORD, the rubric and the workflow — never "our AI is better", so the
 * left column is described neutrally (a dash, not a cross) and the right
 * column lists capabilities, not superlatives. One closing line under the
 * columns carries the institutional sentence.
 *
 * Both columns are `<ul>`s with an `<h3>`; the right column is the one with
 * the accent hairline so the eye lands on the record, not on the rival.
 * Stacks on phones, two columns from `md`. Tokens only. Server component.
 */

import type { ReactNode } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComparisonColumn {
  title: string;
  /** One quiet clause under the title ("analyses what you paste"). */
  sub?: ReactNode;
  items: readonly string[];
}

export interface WhyNotChatGPTProps {
  /** The general tool (left). */
  other: ComparisonColumn;
  /** BlockID (right, highlighted). */
  ours: ComparisonColumn;
  /** The one sentence under the columns. */
  line: ReactNode;
  className?: string;
}

const COLUMN = "flex h-full flex-col gap-4 rounded-xl border p-6 shadow-1";

export function WhyNotChatGPT({ other, ours, line, className }: WhyNotChatGPTProps) {
  return (
    <div data-testid="why-not-chatgpt" className={cn("flex flex-col gap-6", className)}>
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <div className={cn(COLUMN, "border-line-subtle bg-surface-sunken")}>
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight text-primary">{other.title}</h3>
            {other.sub ? <p className="mt-1 text-sm text-muted">{other.sub}</p> : null}
          </div>
          <ul aria-label={other.title} className="flex flex-col gap-2.5">
            {other.items.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-secondary">
                <span aria-hidden className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                  <Minus size={14} strokeWidth={2} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className={cn(COLUMN, "border-accent-600/30 bg-surface ring-1 ring-accent-600/10")}>
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight text-primary">{ours.title}</h3>
            {ours.sub ? <p className="mt-1 text-sm text-muted">{ours.sub}</p> : null}
          </div>
          <ul aria-label={ours.title} className="grid gap-2.5 sm:grid-cols-2">
            {ours.items.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-primary">
                <span aria-hidden className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Check size={14} strokeWidth={2.25} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mx-auto max-w-3xl text-center text-base leading-relaxed text-secondary sm:text-lg">{line}</p>
    </div>
  );
}
