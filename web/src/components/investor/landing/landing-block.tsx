// Block frame for the evaluator landing — G13-W4-IA4 (spec §C.1).
//
// Same contract as the founder `LandingBlock`: a stable
// `data-landing-block="<name>"` (e2e + live-qa assert on it) and
// `data-landing-empty="true"` when the block renders its empty state.
// Blocks 1–2 are wide (lg:6), 3–4 a third each; the grid stacks on mobile.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InvestorLandingBlock } from "@/lib/investors/landing-data";

export interface InvestorBlockProps {
  name: InvestorLandingBlock;
  /** 1-based slot the block occupies this render (block 4 can sit in slot 2). */
  slot: 1 | 2 | 3 | 4;
  title: string;
  icon: LucideIcon;
  empty?: boolean;
  span: "wide" | "third";
  aside?: ReactNode;
  cta?: ReactNode;
  children: ReactNode;
}

export function InvestorBlock({ name, slot, title, icon: Icon, empty = false, span, aside, cta, children }: InvestorBlockProps) {
  const headingId = `landing-${name}-heading`;
  return (
    <article
      data-landing-block={name}
      data-landing-slot={slot}
      data-landing-empty={empty ? "true" : undefined}
      aria-labelledby={headingId}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-line-subtle bg-surface p-5 transition-colors hover:border-action/25",
        span === "wide" ? "lg:col-span-6" : "lg:col-span-4",
      )}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-action" aria-hidden="true">
            <Icon strokeWidth={1.75} className="h-4 w-4" />
          </span>
          <h2 id={headingId} className="truncate text-sm font-semibold text-primary">
            <span className="sr-only">{slot}. </span>
            {title}
          </h2>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </header>
      <div className="min-w-0 flex-1">{children}</div>
      {cta ? <footer className="mt-4">{cta}</footer> : null}
    </article>
  );
}

export function SviPill({ score }: { score: number | null }) {
  if (score == null) return <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-tertiary">Not scored</span>;
  const tone = score >= 80 ? "bg-bull/15 text-bull" : score >= 60 ? "bg-warn/15 text-warn" : "bg-surface-sunken text-secondary";
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", tone)}>SVI {Math.round(score)}</span>;
}

export function DeltaText({ delta }: { delta: number }) {
  const up = delta > 0;
  return (
    <span className={cn("text-xs font-semibold tabular-nums", up ? "text-bull" : "text-bear")} data-landing-delta={delta}>
      {up ? "+" : ""}
      {Math.round(delta * 10) / 10}
    </span>
  );
}
