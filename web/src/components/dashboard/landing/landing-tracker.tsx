"use client";

// Client trackers for the founder landing (G13-W3-IA3 spec §E metrics).
//
//   <LandingViewedTracker/>  fires `landing_viewed` once per mount.
//   <LandingCta/>            a Link that fires `landing_block_click` — the
//                            time-to-first-action marker (login → first
//                            landing_block_click | nav_click).
//
// Both are the only client code on the landing; every block is a server
// component around them.

import * as React from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export type LandingBlockName = "where-you-stand" | "next-best-action" | "money-on-the-table" | "evidence-to-add" | "your-reports";

export const LANDING_BLOCKS: readonly LandingBlockName[] = Object.freeze([
  "where-you-stand",
  "next-best-action",
  "money-on-the-table",
  "evidence-to-add",
  "your-reports",
]);

export interface LandingContext {
  /** Canonical `GrowthPhaseId`, or "none" before a score. */
  phase: string;
  plan: string;
  persona: string;
}

/** Pure payload builders — pinned by landing-grid.test.tsx (no DOM in vitest). */
export function landingViewedPayload(ctx: LandingContext, blocks: readonly string[], emptyBlocks: readonly string[]) {
  return { phase: ctx.phase, plan: ctx.plan, persona: ctx.persona, blocks: blocks.join(","), empty_blocks: emptyBlocks.join(",") };
}

export function landingClickPayload(block: LandingBlockName, href: string, ctx: LandingContext, action?: string) {
  return { block, href, phase: ctx.phase, action: action ?? href, persona: ctx.persona };
}

export function LandingViewedTracker({ ctx, blocks, emptyBlocks }: { ctx: LandingContext; blocks: readonly string[]; emptyBlocks: readonly string[] }) {
  const fired = React.useRef(false);
  React.useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackEvent("landing_viewed", landingViewedPayload(ctx, blocks, emptyBlocks));
  }, [ctx, blocks, emptyBlocks]);
  return null;
}

export interface LandingCtaProps {
  block: LandingBlockName;
  href: string;
  ctx: LandingContext;
  /** Short verb for the event (`see_score`, `start`, …); defaults to the href. */
  action?: string;
  variant?: "primary" | "secondary" | "link";
  className?: string;
  children: React.ReactNode;
  testId?: string;
}

const VARIANT: Record<NonNullable<LandingCtaProps["variant"]>, string> = {
  primary:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-action px-4 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover",
  secondary:
    "inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-line-subtle bg-surface px-3 text-xs font-semibold text-primary transition-colors hover:border-action/40",
  link: "inline-flex min-h-6 items-center gap-1 text-xs font-medium text-action underline-offset-2 hover:underline",
};

export function LandingCta({ block, href, ctx, action, variant = "primary", className, children, testId }: LandingCtaProps) {
  const onClick = React.useCallback(() => {
    trackEvent("landing_block_click", landingClickPayload(block, href, ctx, action));
  }, [block, href, ctx, action]);
  return (
    <Link href={href} onClick={onClick} data-landing-cta={block} data-testid={testId} className={cn(VARIANT[variant], className)}>
      {children}
    </Link>
  );
}
