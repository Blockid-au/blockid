/**
 * MarketingHero — reusable hero band for informational marketing pages.
 *
 * This is deliberately NOT the homepage search hero — it is the top-of-page
 * headline / subtitle / CTA band used by /roadmap, /changelog, /demo,
 * /security-audit, /svi, /for/[segment], /legal/[doc] etc.
 *
 * Design contract (see task brief):
 *   - Eyebrow: small caps, cyan accent.
 *   - Title: `font-display` (Space Grotesk, already wired in layout.tsx).
 *   - Subtitle: muted ink, capped to a readable measure.
 *   - Primary CTA: cyan pill on the deep-navy background.
 *   - Secondary CTA: ghost with border, cyan focus ring.
 *   - Focus visible ring meets the fintech design contract.
 *
 * Server component. Pure presentation.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface MarketingCta {
  href: string;
  label: string;
}

interface MarketingHeroProps {
  eyebrow?: string;
  title: string | ReactNode;
  subtitle?: string;
  primaryCta?: MarketingCta;
  secondaryCta?: MarketingCta;
}

export function MarketingHero({
  eyebrow,
  title,
  subtitle,
  primaryCta,
  secondaryCta,
}: MarketingHeroProps) {
  return (
    <section
      aria-labelledby="marketing-hero-title"
      className="mx-auto max-w-5xl px-6 pt-16 pb-12 sm:pt-24 sm:pb-16"
    >
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]">
          {eyebrow}
        </p>
      ) : null}
      <h1
        id="marketing-hero-title"
        className="mt-4 font-display text-4xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-5xl lg:text-6xl"
      >
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--fintech-ink-muted)]">
          {subtitle}
        </p>
      ) : null}
      {primaryCta || secondaryCta ? (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {primaryCta ? (
            <Link
              href={primaryCta.href}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--fintech-accent)] px-6 text-sm font-semibold text-[var(--fintech-bg-primary)] transition-transform transition-colors duration-200 ease-out hover:bg-[var(--fintech-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
            >
              {primaryCta.label}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          ) : null}
          {secondaryCta ? (
            <Link
              href={secondaryCta.href}
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--fintech-border-strong)] px-6 text-sm font-semibold text-[var(--fintech-ink)] transition-colors duration-200 ease-out hover:bg-[var(--fintech-bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
            >
              {secondaryCta.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default MarketingHero;
