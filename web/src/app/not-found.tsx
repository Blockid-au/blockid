// Global App Router 404 page.
//
// Rendered whenever `notFound()` is called from a Server Component or a
// route in this segment cannot be matched. Wrapped in the marketing shell
// so the visitor doesn't feel bounced out — they land on-brand with three
// clearly-labelled next-step cards (SVI score, listings directory, sample
// report) and the standard "not financial advice" footer.

import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";

interface Suggestion {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    href: "/score",
    eyebrow: "Free",
    title: "Try the SVI score",
    body: "Get an on-brand Startup Value Index across the 8 dimensions in under 2 minutes.",
    cta: "Score my startup",
  },
  {
    href: "/listings",
    eyebrow: "Directory",
    title: "Browse Australian startups",
    body: "The public BlockID index — every founder who chose to publish, sortable by SVI grade and sector.",
    cta: "Open the directory",
  },
  {
    href: "/tbr/demo",
    eyebrow: "Sample",
    title: "Read a full trust report",
    body: "See what an investor receives — scoring, evidence, benchmarks, and next-step recommendations.",
    cta: "Preview a sample",
  },
];

export default function NotFound() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="404"
        title="This page does not exist"
        subtitle="It may have moved, been renamed, or never existed. Here are three good next moves."
      />

      <MarketingSection>
        <div className="grid gap-4 sm:grid-cols-3">
          {SUGGESTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group rounded-2xl border border-line-subtle bg-white p-6 shadow-sm hover:border-brand-500 hover:shadow-md transition-all"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600 mb-2">
                {s.eyebrow}
              </p>
              <h2 className="text-lg font-bold text-secondary mb-2">
                {s.title}
              </h2>
              <p className="text-sm text-tertiary mb-4">{s.body}</p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 group-hover:text-brand-700">
                {s.cta}
                <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-tertiary">
          Or return to the{" "}
          <Link href="/" className="text-brand-600 hover:text-brand-700 font-semibold">
            BlockID.au homepage
          </Link>
          .
        </p>
      </MarketingSection>

      <MarketingSection>
        <NotFinancialAdvice kind="not_financial_advice" compact />
      </MarketingSection>
    </MarketingShell>
  );
}
