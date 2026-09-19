/**
 * /samples — the sample results gallery (G17 D4, 2026-09-19).
 *
 * Everything a visitor can look at before they type: the three anonymised
 * runs side by side (`RunComparison`, moved off the homepage), the public
 * Investor Dossier demo, the sample Trusted Business Report, the sample
 * funding report and the six showcase journeys. Every card links to a real
 * page; nothing here is a screenshot.
 *
 * Template (D5): PageHero → Section (runs) → Section (dossiers + reports)
 * → Section (journeys) → CtaBand, inside MarketingShell.
 */

import { BookOpen, FileText, Landmark, Route, ScrollText, Search } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import {
  CtaBand,
  FeatureGrid,
  PageHero,
  Section,
} from "@/components/marketing/template";
import {
  RunComparison,
  RunComparisonLegend,
} from "@/components/marketing/homepage/run-comparison";
import { pageMetadata } from "@/lib/seo/page-meta";
import { SAMPLE_DOSSIERS, SAMPLE_JOURNEYS } from "./samples-content";

export const metadata = pageMetadata({
  title: "Sample results — dossiers, reports and real runs",
  description:
    "See what a Startup Value Index run produces before you type: three anonymised runs side by side, the public Investor Dossier demo and sample reports.",
  path: "/samples",
});

export const revalidate = 300;

const ICONS = { search: Search, file: FileText, scroll: ScrollText, landmark: Landmark, route: Route, book: BookOpen } as const;

export default function SamplesPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Samples"
        title="See the output before you type."
        sub="Three real runs, anonymised. A full Investor Dossier. The written report a founder gets for a few dollars. Nothing here is a mock-up — every card opens the actual page."
        ctas={[
          { href: "/tbr/demo", label: "Open the sample dossier", ctaId: "samples_hero_dossier" },
          { href: "/analyze", label: "Score a startup" },
        ]}
        align="start"
      />

      {/* 1. Three anonymised runs, so a visitor can locate themselves. */}
      <Section
        id="runs"
        eyebrow="Three real runs"
        title="Same box, same eight dimensions, three very different companies."
        lede="Nothing here is invented — these are the numbers the analysis returned for an idea-stage, an MVP-stage and a revenue-stage company, with the identifying details removed."
        tone="sunken"
      >
        <RunComparison />
        <div className="mt-8">
          <RunComparisonLegend />
        </div>
      </Section>

      {/* 2. The documents a run produces. */}
      <Section
        id="dossiers"
        eyebrow="What you get"
        title="The dossier, the report, the funding plan."
        lede="Each of these is a live page, rendered from a real (anonymised or demo) run. Open one to see exactly what an evaluator receives and what a founder is emailed."
      >
        <FeatureGrid
          columns={3}
          ariaLabel="Sample documents"
          items={SAMPLE_DOSSIERS.map((d) => ({ ...d, icon: ICONS[d.icon] }))}
        />
      </Section>

      {/* 3. Showcase journeys — the Atlassian walkthrough leads (G7 Q2). */}
      <Section
        id="journeys"
        eyebrow="Journeys"
        title="Walk a company through all twelve phases."
        lede="Public-record showcases of Australian companies that finished the journey, step by step. The Atlassian walkthrough is interactive — start at step 1."
        tone="sunken"
        actions={[{ href: "/showcase", label: "All case studies", variant: "link" }]}
      >
        <FeatureGrid
          columns={3}
          ariaLabel="Showcase journeys"
          items={SAMPLE_JOURNEYS.map((j) => ({ ...j, icon: ICONS[j.icon] }))}
        />
      </Section>

      <CtaBand
        title="Now run your own."
        sub="Paste a name, a deck or a URL. The free score takes sixty seconds and needs no card."
        primary={{ href: "/analyze", label: "Score a startup", ctaId: "samples_cta_score" }}
        secondary={{ href: "/product", label: "How it works" }}
      />
    </MarketingShell>
  );
}
