import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { TrustStrip } from "./trust-strip";
import { ValueProps } from "./value-props";

/**
 * HeroV2 — luxury dark hero for W2 homepage v2.
 *
 * Server component. Composes:
 *  - Overline + primary H1 ("Get Fundable in 7 Days") + subhead.
 *  - Triple-CTA row (trial / demo / see pricing).
 *  - <TrustStrip /> — accelerator logo row.
 *  - <ValueProps /> — 3-column segment cards.
 *
 * The legacy <Hero /> in ./hero.tsx is untouched; page.tsx picks
 * between them via NEXT_PUBLIC_UPGRADE_V2.
 */
export function HeroV2() {
  return (
    <section
      aria-labelledby="hero-v2-title"
      className="relative isolate overflow-hidden bg-brand-navy bg-lux-radial text-brand-ink"
    >
      {/* Subtle gold divider at the very top edge */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-lux-gold-line opacity-40"
      />

      <div className="mx-auto max-w-7xl px-6 py-24 lg:py-32">
        {/* ── Headline block ─────────────────────────────────── */}
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-gold">
            AI-powered startup verification · Sydney AU
          </p>

          <h1
            id="hero-v2-title"
            className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight text-brand-ink md:text-6xl lg:text-7xl"
          >
            Get{" "}
            <span className="lux-heading">Fundable</span>
            <br className="hidden sm:block" />{" "}
            in 7 Days
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-xl leading-relaxed text-brand-ink-muted">
            Verified Profile + AI copilot + investor-ready reports. Ship a
            fundable startup faster than a pitch deck.
          </p>

          {/* Triple-CTA row */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
            <Link
              href="/signup?trial=7d"
              className="lux-glow-gold inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-brand-gold px-8 text-base font-semibold text-brand-navy transition duration-200 hover:bg-brand-gold-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              Start 7-Day Free Trial
              <ArrowRight strokeWidth={2} className="h-5 w-5" aria-hidden="true" />
            </Link>

            <Link
              href="/demo"
              className="inline-flex h-14 items-center justify-center rounded-xl border border-brand-cyan px-8 text-base font-semibold text-brand-cyan transition duration-200 hover:bg-brand-cyan hover:text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              Book Demo
            </Link>

            <Link
              href="/pricing"
              className="inline-flex h-14 items-center justify-center gap-1 px-2 text-sm font-medium text-brand-ink-muted underline decoration-brand-ink-muted/40 underline-offset-4 transition duration-200 hover:text-brand-ink hover:decoration-brand-gold"
            >
              See Pricing
              <ArrowRight strokeWidth={2} className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          {/* Free-trial reassurance */}
          <p className="mt-4 text-xs text-brand-ink-muted/70">
            No credit card to browse pricing · Card required at checkout
          </p>
        </div>

        {/* ── Trust strip ────────────────────────────────────── */}
        <TrustStrip className="mt-16" />

        {/* ── Value-prop grid ────────────────────────────────── */}
        <ValueProps className="mt-20" />
      </div>

      {/* Soft bottom fade into next section */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-brand-navy"
      />
    </section>
  );
}
