/**
 * /how-it-works — public "how the SVI works" explainer.
 *
 * Linked from the marketing footer. The 4-step arc and the eight dimension
 * cards both render from `how-it-works-content.ts`.
 *
 * G14-S36: the eight dimension cards are rendered from DIMENSION_OWNERS —
 * the engine's single table — so the names here are the names in the
 * report. `page.test.tsx` pins the parity.
 *
 * G17 P2-A: on the unicorn template — PageHero → Section (steps, numbered
 * FeatureGrid, the page's one dark band) → Section (dimensions) → CtaBand.
 */

import type { Metadata } from "next";
import { Gauge, Route, ScanSearch, Upload, type LucideIcon } from "lucide-react";
import { pageMetadata } from "@/lib/seo/page-meta";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/marketing/template";
import { HOW_IT_WORKS_DIMENSIONS, HOW_IT_WORKS_STEPS } from "./how-it-works-content";

export const metadata: Metadata = pageMetadata({
  title: "How BlockID and the Startup Value Index work",
  description: "The 3-step arc from paste-an-idea to investor-ready — how the Startup Value Index scores 8 SVI dimensions, benchmarks real AU cohorts and drives the roadmap.",
  path: "/how-it-works",
});

export const revalidate = 300;

const ICONS: Record<(typeof HOW_IT_WORKS_STEPS)[number]["icon"], LucideIcon> = {
  upload: Upload,
  scan: ScanSearch,
  gauge: Gauge,
  route: Route,
};

export default function HowItWorksPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="How it works"
        title="From paste-an-idea to investor-ready in 3 steps"
        sub="BlockID scores 8 SVI dimensions, benchmarks you against real AU cohorts, and turns the gap into a guided roadmap."
        ctas={[
          { href: "/analyze", label: "Score a startup", ctaId: "hiw_hero_score" },
          { href: "/samples", label: "See sample results" },
        ]}
        align="start"
      />

      <Section
        id="how"
        eyebrow="How it works"
        title="What happens after you press the button"
        tone="dark"
        align="center"
      >
        <FeatureGrid
          numbered
          columns={4}
          ariaLabel="How it works"
          items={HOW_IT_WORKS_STEPS.map((s) => ({ icon: ICONS[s.icon], title: s.title, body: s.body }))}
        />
      </Section>

      <Section
        id="dimensions"
        eyebrow="The 8 dimensions"
        title="What the Startup Value Index measures"
        lede="Every SVI score is a weighted composite of these eight dimensions. Move any lever and the roadmap re-plans against the current cohort benchmark."
        align="center"
        actions={[
          { href: "/methodology", label: "Scoring & verification methodology", variant: "link" },
          { href: "/guide/01-vision", label: "The 12-chapter startup guide", variant: "link" },
        ]}
      >
        <ul className="grid gap-4 sm:grid-cols-2 sm:gap-6" data-testid="how-it-works-dimensions">
          {HOW_IT_WORKS_DIMENSIONS.map((d) => (
            <li
              key={d.code}
              className="rounded-xl border border-line-subtle bg-surface p-6 shadow-1"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                  {d.code}
                </span>
                <h3 className="font-display text-lg font-semibold tracking-tight text-primary">
                  {d.title}
                </h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-secondary">
                {d.body}
              </p>
              <p className="mt-2 text-xs text-muted">
                Owner agent: <span className="font-medium text-primary">{d.owner}</span>
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand
        title="Ready to score your own startup?"
        sub="The first run is free and needs no card. Paste a name, a deck or a URL."
        primary={{ href: "/svi", label: "Analyse an idea", ctaId: "hiw_final_score" }}
        secondary={{ href: "/guide/01-vision", label: "Read the guide" }}
      />
    </MarketingShell>
  );
}
