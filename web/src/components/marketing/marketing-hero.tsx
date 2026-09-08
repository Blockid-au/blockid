/**
 * MarketingHero — reusable hero band for informational marketing pages.
 *
 * This is deliberately NOT the homepage search hero — it is the top-of-page
 * headline / subtitle / CTA band used by /roadmap, /changelog, /demo,
 * /security-audit, /svi, /for/[segment], /legal/[doc] etc.
 *
 * Design contract (design-system.md rev.4, light-first):
 *   - Eyebrow: small caps, `text-action`.
 *   - Title: `font-display` (Space Grotesk, already wired in layout.tsx).
 *   - Subtitle: `text-secondary`, capped to a readable measure.
 *   - Primary CTA: `bg-action` pill with `text-on-action`.
 *   - Secondary CTA: ghost with `border-line`, `ring-action` focus ring.
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
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-action">
          {eyebrow}
        </p>
      ) : null}
      <h1
        id="marketing-hero-title"
        className="mt-4 font-display text-4xl font-semibold tracking-tight text-primary sm:text-5xl lg:text-6xl"
      >
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">
          {subtitle}
        </p>
      ) : null}
      {primaryCta || secondaryCta ? (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {primaryCta ? (
            <Link
              href={primaryCta.href}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-action px-6 text-sm font-semibold text-on-action transition-transform transition-colors duration-200 ease-out hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {primaryCta.label}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          ) : null}
          {secondaryCta ? (
            <Link
              href={secondaryCta.href}
              className="inline-flex h-11 items-center justify-center rounded-full border border-line px-6 text-sm font-semibold text-primary transition-colors duration-200 ease-out hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
