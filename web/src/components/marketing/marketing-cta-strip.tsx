/**
 * MarketingCtaStrip — final-fold call-to-action band for every marketing
 * page. Uses the cyan / violet fintech accent gradient as the background
 * layer, keeps the headline on the ink-strong colour for contrast, and
 * pairs one primary pill CTA with an optional secondary ghost link.
 *
 * Server component. Pure presentation. All colours read from the shared
 * `--fintech-*` token set so the visual language stays identical across
 * pages that mount this component.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface CtaLink {
  href: string;
  label: string;
}

interface MarketingCtaStripProps {
  headline: string;
  primary: CtaLink;
  secondary?: CtaLink;
}

export function MarketingCtaStrip({
  headline,
  primary,
  secondary,
}: MarketingCtaStripProps) {
  return (
    <section
      aria-labelledby="marketing-cta-strip-heading"
      className="mx-auto my-16 max-w-5xl px-6"
    >
      <div
        className="relative overflow-hidden rounded-3xl border border-[var(--fintech-border-strong)] bg-[var(--fintech-bg-elevated)] p-8 shadow-2xl sm:p-12"
      >
        {/* Cyan/violet accent glow — decorative, non-interactive */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(60% 80% at 20% 0%, rgba(34, 211, 238, 0.22) 0%, rgba(34, 211, 238, 0) 60%), radial-gradient(50% 80% at 100% 100%, rgba(168, 85, 247, 0.18) 0%, rgba(168, 85, 247, 0) 65%)",
          }}
        />
        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <h2
            id="marketing-cta-strip-heading"
            className="font-display text-2xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-3xl"
          >
            {headline}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={primary.href}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--fintech-accent)] px-6 text-sm font-semibold text-[var(--fintech-bg-primary)] transition-colors duration-200 ease-out hover:bg-[var(--fintech-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
            >
              {primary.label}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            {secondary ? (
              <Link
                href={secondary.href}
                className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--fintech-border-strong)] px-6 text-sm font-semibold text-[var(--fintech-ink)] transition-colors duration-200 ease-out hover:bg-[var(--fintech-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
              >
                {secondary.label}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export default MarketingCtaStrip;
