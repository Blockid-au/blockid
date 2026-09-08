/**
 * MarketingCtaStrip — final-fold call-to-action band for every marketing
 * page. A sunken panel with a subtle border on the light page ground,
 * one primary pill CTA and an optional secondary ghost link.
 *
 * 2026-09-08: the cyan/violet radial glow that used to sit behind the
 * headline was a dark-ground device (two raw rgba stops over deep navy).
 * On the light ground it read as a muddy wash, so it is gone; the panel
 * now separates from the page with `bg-surface-sunken` + `border-line`.
 *
 * Server component. Pure presentation. Semantic tokens only.
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
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface-sunken p-8 shadow-sm sm:p-12">
        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <h2
            id="marketing-cta-strip-heading"
            className="font-display text-2xl font-semibold tracking-tight text-primary sm:text-3xl"
          >
            {headline}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={primary.href}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-action px-6 text-sm font-semibold text-on-action transition-colors duration-200 ease-out hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {primary.label}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            {secondary ? (
              <Link
                href={secondary.href}
                className="inline-flex h-11 items-center justify-center rounded-full border border-line px-6 text-sm font-semibold text-primary transition-colors duration-200 ease-out hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
