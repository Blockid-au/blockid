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
    "The 3-step arc from paste-an-idea to investor-ready — how the Startup Value Index scores 8 SVI dimensions, benchmarks against real AU cohorts, and drives the guided roadmap.",
  alternates: { canonical: `${SITE_URL}/how-it-works` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "How BlockID and the Startup Value Index work",
    description:
      "The 3-step arc from paste-an-idea to investor-ready — how the SVI scores 8 SVI dimensions and drives the guided roadmap.",
    url: `${SITE_URL}/how-it-works`,
  },
  twitter: {
    card: "summary_large_image",
    title: "How BlockID and the Startup Value Index work",
    description:
      "The 3-step arc from paste-an-idea to investor-ready — how the SVI scores 8 SVI dimensions and drives the guided roadmap.",
  },
};

interface Dimension {
  code: string;
  title: string;
  body: string;
}

const DIMENSIONS: Dimension[] = [
  {
    code: "FTV",
    title: "Founder-Team Value (FTV)",
    body: "Serial vs experienced vs first-time founder, whether a co-founder team is in place, and whether advisors are identified. Signals the team's ability to execute.",
  },
  {
    code: "MPC",
    title: "Market-Pull Clarity (MPC)",
    body: "Market clarity and problem validation — is the problem validated with customer evidence, merely clear, or still needing clarification? Weighted by addressable market size.",
  },
  {
    code: "PTD",
    title: "Product-Traction Depth (PTD)",
    body: "Whether a product is built or described, whether a demo or prototype is available, and whether source code is linked for verification.",
  },
  {
    code: "TRE",
    title: "Technology-Readiness Evidence (TRE)",
    body: "Revenue band and hard proof of traction — customer proof, analytics in place, and observable engagement instead of self-reported claims.",
  },
  {
    code: "CGH",
    title: "Cap-table Governance Health (CGH)",
    body: "Whether a cap table is present, whether a Shareholders' Agreement is confirmed, and whether founder and employee vesting is in place.",
  },
  {
    code: "IRI",
    title: "Investor-Readiness Indicators (IRI)",
    body: "Pitch deck present, financial model available, and data room prepared — the diligence artefacts an investor asks for on day one.",
  },
  {
    code: "LCO",
    title: "Legal-Compliance Openness (LCO)",
    body: "ABN/ASIC registered, IP protection in place, and executed contracts referenced — the AU legal baseline plus ESIC/R&D and Essential Eight overlays.",
  },
  {
    code: "SVM",
    title: "Sector-Velocity Momentum (SVM)",
    body: "Competitive moat identified, network effects present, and data advantage established — the durability of the position over time.",
  },
];

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

        <ul className="grid gap-4 sm:grid-cols-2">
          {DIMENSIONS.map((d) => (
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
            </li>
          ))}
        </ul>

        <div className="pt-4 text-center text-sm text-tertiary">
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
