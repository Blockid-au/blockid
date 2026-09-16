// Founder landing grid + block frame — G13-W3-IA3 (spec §B.1).
//
// A 12-col grid: blocks 1–2 full width on mobile, 2-up on desktop; blocks
// 3–5 in a 3-up row that stacks. Every block is a `<LandingBlock>` with a
// stable `data-landing-block="<name>"` (the live-qa lane and the hydrated
// smoke assert on it) and a `data-landing-empty` flag when it renders its
// §B.4 empty state.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LandingBlockName } from "./landing-blocks";

export { LandingCta, LandingViewedTracker, landingClickPayload, landingViewedPayload } from "./landing-tracker";
// Server-safe catalogue (plain module — see landing-blocks.ts).
export { LANDING_BLOCKS } from "./landing-blocks";
export type { LandingBlockName } from "./landing-blocks";
export type { LandingContext } from "./landing-tracker";

export function LandingGrid({ children }: { children: ReactNode }) {
  return (
    <section data-landing-grid className="grid grid-cols-1 gap-6 lg:grid-cols-12" aria-label="Your startup at a glance">
      {children}
    </section>
  );
}

export interface LandingBlockProps {
  name: LandingBlockName;
  /** 1-based benefit order — rendered as the eyebrow prefix. */
  order: 1 | 2 | 3 | 4 | 5;
  title: string;
  icon: LucideIcon;
  empty?: boolean;
  /** Grid span: wide (lg:6) for blocks 1–2, third (lg:4) for blocks 3–5. */
  span: "wide" | "third";
  /** Right-aligned header slot (a pill, a delta). */
  aside?: ReactNode;
  /** Footer slot — the block's ONE primary CTA. */
  cta?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function LandingBlock({ name, order, title, icon: Icon, empty = false, span, aside, cta, children, className }: LandingBlockProps) {
  const headingId = `landing-${name}-heading`;
  return (
    <article
      data-landing-block={name}
      data-landing-empty={empty ? "true" : undefined}
      aria-labelledby={headingId}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-line-subtle bg-surface p-5 transition-colors hover:border-action/25",
        span === "wide" ? "lg:col-span-6" : "lg:col-span-4",
        className,
      )}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-action" aria-hidden="true">
            <Icon strokeWidth={1.75} className="h-4 w-4" />
          </span>
          <h2 id={headingId} className="truncate text-sm font-semibold text-primary">
            <span className="sr-only">{order}. </span>
            {title}
          </h2>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </header>
      <div className="flex-1 min-w-0">{children}</div>
      {cta ? <footer className="mt-4">{cta}</footer> : null}
    </article>
  );
}
