/**
 * FundingGuides — the directory ↔ insights internal-link strip (S8-A).
 *
 * The funding insight articles carry a "See which of these you qualify for
 * → /funding" callout; this is the return link from the free directories and
 * the detail pages back to the guides, so neither side is an orphan. Slugs
 * come from `lib/funding/seo.ts` (pinned against the insights manifest in
 * seo.test.ts). Server component, no data fetch.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { InsightCallout } from "@/lib/funding/seo";

export function FundingGuides({
  guides,
  heading = "Guides",
  compact = false,
}: {
  guides: ReadonlyArray<InsightCallout>;
  heading?: string;
  /** Inline list (detail-page aside) instead of the boxed strip. */
  compact?: boolean;
}) {
  if (guides.length === 0) return null;
  if (compact) {
    return (
      <div data-funding-guides="compact">
        <p className="text-xs font-semibold uppercase tracking-wide text-secondary">{heading}</p>
        <ul className="mt-2 space-y-1.5 text-sm">
          {guides.map((g) => (
            <li key={g.slug}>
              <Link href={`/insights/${g.slug}`} className="text-action underline-offset-2 hover:underline">
                {g.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <section className="mx-auto max-w-5xl px-6 pb-12" aria-labelledby="funding-guides-heading" data-funding-guides="strip">
      <h2 id="funding-guides-heading" className="font-display text-xl font-semibold text-primary">
        {heading}
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {guides.map((g) => (
          <li key={g.slug}>
            <Link
              href={`/insights/${g.slug}`}
              className="flex h-full items-center justify-between gap-3 rounded-2xl border border-line-subtle bg-surface-raised px-4 py-3 text-sm font-medium text-primary hover:border-action"
            >
              <span>{g.label}</span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-action" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default FundingGuides;
