/**
 * /how-it-works — public "how the SVI works" explainer.
 *
 * Linked from the fintech hero micro-links row (see components/landing/hero-v4)
 * and from the marketing footer. Reuses the existing HowItWorksSection
 * component so the story matches the landing page's 3-step arc, and adds a
 * deeper explanation of the Startup Value Index scoring model.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";

const SITE_URL = "https://blockid.au";

export const metadata: Metadata = {
  title: "How BlockID and the Startup Value Index work",
  description:
    "The 3-step arc from paste-an-idea to investor-ready — how the Startup Value Index scores 13 criteria, benchmarks against real AU cohorts, and drives the guided roadmap.",
  alternates: { canonical: `${SITE_URL}/how-it-works` },
  robots: { index: true, follow: true },
};

interface Dimension {
  code: string;
  title: string;
  body: string;
}

const DIMENSIONS: Dimension[] = [
  {
    code: "FTV",
    title: "Founder-team velocity",
    body: "How quickly the founding team ships, iterates, and closes loops. Signals: velocity of decisions, prior startup exits, complementarity of skills.",
  },
  {
    code: "MPC",
    title: "Market pull clarity",
    body: "Whether the market is actively pulling the product, or the team is pushing rope. Signals: inbound demand, retention, sales cycle length.",
  },
  {
    code: "PTD",
    title: "Product-tech defensibility",
    body: "The moat around the product — data, technical difficulty, network effects, or unique distribution. Not just IP, but time-to-copy.",
  },
  {
    code: "TRE",
    title: "Traction, revenue, evidence",
    body: "Hard evidence that the business is working — signed contracts, MRR/ARR, active users, letters of intent.",
  },
  {
    code: "CGH",
    title: "Capital & growth headroom",
    body: "How far the current capital gets the team, what the next round needs to look like, and how much runway is left.",
  },
  {
    code: "IRI",
    title: "Investor-readiness index",
    body: "Data-room completeness, cap-table hygiene, compliance posture, and how quickly a diligence request could close.",
  },
  {
    code: "LCO",
    title: "Legal & compliance overlay",
    body: "AU-specific overlays — ESIC, R&D Tax, s708, ASIC filings, and the Essential Eight security baseline.",
  },
  {
    code: "SVM",
    title: "Startup valuation multiple",
    body: "The weighted output — a valuation range and multiple grounded in real AU comparables at your stage and sector.",
  },
];

export default function HowItWorksPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="How it works"
        title="From paste-an-idea to investor-ready in 3 steps"
        subtitle="BlockID scores 13 criteria across 8 startup value dimensions, benchmarks you against real AU cohorts, and turns the gap into a guided roadmap."
      />

      <HowItWorksSection />

      <section
        aria-labelledby="dimensions-heading"
        className="mx-auto max-w-5xl space-y-6 px-6 py-16"
      >
        <div className="text-center">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.28em] text-ink-500">
            The 8 dimensions
          </p>
          <h2
            id="dimensions-heading"
            className="font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl"
          >
            What the Startup Value Index measures
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-ink-500">
            Every SVI score is a weighted composite of these eight dimensions.
            Move any lever and the roadmap re-plans against the current cohort
            benchmark.
          </p>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2">
          {DIMENSIONS.map((d) => (
            <li
              key={d.code}
              className="rounded-2xl border border-surface-200 bg-white p-6"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
                  {d.code}
                </span>
                <h3 className="text-base font-semibold text-ink-900">
                  {d.title}
                </h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {d.body}
              </p>
            </li>
          ))}
        </ul>

        <div className="pt-4 text-center text-sm text-ink-500">
          Read the full methodology in the{" "}
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
