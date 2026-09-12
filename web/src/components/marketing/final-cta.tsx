/**
 * FinalCTA — the last section on the fintech v2 homepage. Reinforces the
 * 70/30 weight ratio by making the AI-analyse route the primary button
 * and the pricing/tokenize route a subordinate text link — never a
 * competing button.
 *
 * Server component. Uses design tokens (`bg-action`, `text-on-action`,
 * `bg-surface`, `border-line-DEFAULT`) so both themes retint.
 * Reduced-motion respected: no animation beyond hover elevation.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function FinalCTA({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className={cn("border-t border-line-subtle bg-surface py-12 sm:py-14", className)}
    >
      <div className="mx-auto max-w-3xl px-6 text-center">
        <div className="rounded-2xl border border-line-subtle bg-surface-sunken px-6 py-10 shadow-sm sm:px-12">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.28em] text-muted">
            Ready when you are
          </p>

          <h2
            id="final-cta-heading"
            className="mb-4 font-display text-3xl font-bold tracking-tight text-primary sm:text-4xl"
          >
            Your first number costs nothing.
          </h2>

          {/* De-duplicated 2026-09-08: this line previously repeated the H2
              verbatim ("Ready when you are. No credit card. 30 seconds to
              your first SVI."), so the heading and body said the same
              sentence twice. The body now adds what the heading cannot. */}
          <p className="mb-7 text-base leading-relaxed text-secondary">
            Paste a deck, a link, or a sentence about the idea. You get the
            score, the valuation range and the ranked next moves on screen, and
            a five-page summary by email if you want one.
          </p>

          <div className="flex flex-col items-center gap-4">
            {/* PRIMARY — AI-analyse (70% of the story). */}
            <Link
              href="/analyze"
              className="inline-flex items-center gap-2 rounded-xl bg-action px-8 py-3.5 text-sm font-semibold text-on-action transition-all duration-200 hover:-translate-y-0.5 hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transform-none motion-reduce:transition-none"
            >
              Analyse my startup — free
              <ArrowRight size={16} aria-hidden />
            </Link>

            {/* SECONDARY — text links, deliberately not buttons, so both the
                paid ladder and the investor side read as ancillary. The
                investor entry moved here when AudienceSplit was removed in
                the 2026-09-09 funnel pass; it is a real audience and must
                keep a way in, but it is not what this page is arguing for. */}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-1.5 text-sm text-secondary transition-colors duration-200 hover:text-action focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                See plans and pricing
                <ArrowRight size={14} aria-hidden />
              </Link>
              <Link
                href="/investors"
                className="inline-flex items-center gap-1.5 text-sm text-secondary transition-colors duration-200 hover:text-action focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                For investors
                <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
