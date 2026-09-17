/**
 * /how-it-works — public "how the SVI works" explainer.
 *
 * Linked from the fintech hero micro-links row (see components/landing/hero-v4)
 * and from the marketing footer. Reuses the existing HowItWorksSection
 * component so the story matches the landing page's 3-step arc, and adds a
 * deeper explanation of the Startup Value Index scoring model.
 *
 * G14-S36: the eight dimension cards are rendered from DIMENSION_OWNERS —
 * the engine's single table — so the names here are the names in the
 * report. This page used to carry its own array with different titles
 * (e.g. TRE "Technology-Readiness Evidence" vs the engine's "Traction &
 * Revenue"); `page.test.tsx` pins the parity.
 */

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-meta";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import { HOW_IT_WORKS_DIMENSIONS } from "./how-it-works-content";

export const metadata: Metadata = pageMetadata({
  title: "How BlockID and the Startup Value Index work",
  description: "The 3-step arc from paste-an-idea to investor-ready — how the Startup Value Index scores 8 SVI dimensions, benchmarks real AU cohorts and drives the roadmap.",
  path: "/how-it-works",
});

export default function HowItWorksPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="How it works"
        title="From paste-an-idea to investor-ready in 3 steps"
        subtitle="BlockID scores 8 SVI dimensions, benchmarks you against real AU cohorts, and turns the gap into a guided roadmap."
      />

      <HowItWorksSection />

      <section
        aria-labelledby="dimensions-heading"
        className="mx-auto max-w-5xl space-y-6 px-6 py-16"
      >
        <div className="text-center">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.28em] text-tertiary">
            The 8 dimensions
          </p>
          <h2
            id="dimensions-heading"
            className="font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl"
          >
            What the Startup Value Index measures
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-tertiary">
            Every SVI score is a weighted composite of these eight dimensions.
            Move any lever and the roadmap re-plans against the current cohort
            benchmark.
          </p>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2" data-testid="how-it-works-dimensions">
          {HOW_IT_WORKS_DIMENSIONS.map((d) => (
            <li
              key={d.code}
              className="rounded-2xl border border-line-subtle bg-white p-6"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
                  {d.code}
                </span>
                <h3 className="text-base font-semibold text-primary">
                  {d.title}
                </h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-tertiary">
                {d.body}
              </p>
              <p className="mt-2 text-xs text-tertiary">
                Owner agent: <span className="font-medium text-primary">{d.owner}</span>
              </p>
            </li>
          ))}
        </ul>

        <div className="pt-4 text-center text-sm text-tertiary">
          Read the{" "}
          <Link
            href="/methodology"
            className="text-brand-700 underline decoration-dotted"
          >
            scoring &amp; verification methodology
          </Link>
          , the{" "}
          <Link
            href="/guide/01-vision"
            className="text-brand-700 underline decoration-dotted"
          >
            12-chapter startup guide
          </Link>
          {" "}or see{" "}
          <Link
            href="/reports/samples"
            className="text-brand-700 underline decoration-dotted"
          >
            sample SVI reports
          </Link>
          .
        </div>
      </section>

      <MarketingCtaStrip
        headline="Ready to score your own startup?"
        primary={{ href: "/svi", label: "Analyse an idea" }}
        secondary={{ href: "/guide/01-vision", label: "Read the guide" }}
      />
    </MarketingShell>
  );
}
