"use client";

// The one client component on the evaluator landing — a Link that fires
// `landing_block_click` with the persona (G13-W4-IA4 §E metrics:
// evaluator time-to-first-action = login → first landing_block_click).
// Mirrors `LandingCta` on the founder landing, keyed by the evaluator
// block names instead of the founder five.

import * as React from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { InvestorLandingBlock } from "@/lib/investors/landing-data";

export interface InvestorLandingContext {
  persona: string;
  plan: string;
}

/** Pure payload builder — pinned by investor-landing.test.tsx. */
export function investorLandingClickPayload(block: InvestorLandingBlock, href: string, ctx: InvestorLandingContext, action?: string) {
  return { block, href, phase: "evaluator", action: action ?? href, persona: ctx.persona };
}

export interface InvestorLandingCtaProps {
  block: InvestorLandingBlock;
  href: string;
  ctx: InvestorLandingContext;
  action?: string;
  variant?: "primary" | "secondary" | "link";
  className?: string;
  children: React.ReactNode;
  testId?: string;
}

const VARIANT: Record<NonNullable<InvestorLandingCtaProps["variant"]>, string> = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-action px-4 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line-subtle bg-surface px-3 text-xs font-semibold text-primary transition-colors hover:border-action/40",
  link: "inline-flex min-h-6 items-center gap-1 text-xs font-medium text-action underline-offset-2 hover:underline",
};

export function InvestorLandingCta({ block, href, ctx, action, variant = "primary", className, children, testId }: InvestorLandingCtaProps) {
  const onClick = React.useCallback(() => {
    trackEvent("landing_block_click", investorLandingClickPayload(block, href, ctx, action));
  }, [block, href, ctx, action]);
  return (
    <Link href={href} onClick={onClick} data-landing-cta={block} data-testid={testId} className={cn(VARIANT[variant], "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action", className)}>
      {children}
    </Link>
  );
}
