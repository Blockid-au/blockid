import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { getAllArticles } from "@/lib/insights";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CTA_CLASS, CtaBand, PageHero, Section } from "@/components/marketing/template";
import { InsightsCategoryFilter } from "./category-filter";

// B3 Task 10 — ISR (1h). Insights index is read from disk via `getAllArticles`
// (no per-request state). Revalidating hourly means a new .md article shows up
// without a redeploy, while keeping the page CDN-cacheable between revalidations.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Insights — Valuation, Equity & Fundraising",
  description:
    "Expert guides for Australian founders: startup valuation, cap table management, equity splits, investor readiness, and fundraising strategies.",
  alternates: {
    canonical: "https://blockid.au/insights",
  },
};

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  valuation: { label: "Valuation", color: "" },
  "cap-table": { label: "Cap Table", color: "" },
  fundraising: { label: "Fundraising", color: "" },
  equity: { label: "Equity", color: "" },
  compliance: { label: "Compliance", color: "" },
  tools: { label: "Tools", color: "" },
  growth: { label: "Growth", color: "" },
};

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "valuation", label: "Valuation" },
  { key: "cap-table", label: "Cap Table" },
  { key: "fundraising", label: "Fundraising" },
  { key: "equity", label: "Equity" },
  { key: "compliance", label: "Compliance" },
  { key: "growth", label: "Growth" },
];

export default function InsightsPage() {
  const articles = getAllArticles();

  // Serialise articles for client component. Descriptions are shown in card
  // teasers only — cap at 160 chars so the RSC payload does not carry the
  // full body prose for all 80+ articles into every /insights response.
  const serialised = articles.map((a) => ({
    slug: a.slug,
    title: a.title,
    description:
      a.description.length > 160
        ? a.description.slice(0, 157).trimEnd() + "..."
        : a.description,
    category: a.category,
    publishedAt: a.publishedAt,
    readingTime: a.readingTime,
  }));

  return (
    <MarketingShell>
      <PageHero
        eyebrow="Founder resources"
        title="Insights and guides for Australian founders."
        sub="Expert resources on valuation, ownership, fundraising and growth — written for the Australian rules, not adapted from somewhere else."
        ctas={[
          { href: "/analyze", label: "Score a startup", ctaId: "insights_hero_score" },
          { href: "/benchmarks", label: "AU startup benchmarks" },
        ]}
        align="start"
      />

      {/* Category filter + article grid (client component). The nested <main>
          that used to sit here is gone — MarketingShell owns #main-content. */}
      <Section id="articles" ariaLabel="Articles" spacing="sm" divider={false}>
        <InsightsCategoryFilter
          categories={CATEGORIES}
          categoryLabels={CATEGORY_LABELS}
          articles={serialised}
        />

        {/* Empty state (server-rendered fallback) */}
        {articles.length === 0 && (
          <div className="rounded-xl border border-line-subtle bg-surface-sunken px-8 py-16 text-center">
            <BookOpen strokeWidth={1.75} aria-hidden className="mx-auto mb-4 h-10 w-10 text-secondary" />
            <h2 className="mb-2 font-display text-lg font-semibold text-primary">Guides are on the way</h2>
            <p className="mx-auto mb-6 max-w-md text-sm text-secondary">
              We are preparing expert guides on startup valuation, cap table management,
              and fundraising strategies for Australian founders.
            </p>
            <Link href="/analyze" className={CTA_CLASS.primary}>
              Get your free SVI score
              <ArrowRight strokeWidth={1.75} aria-hidden className="h-4 w-4" />
            </Link>
          </div>
        )}
      </Section>

      {/* Benchmarks teaser */}
      <Section
        id="benchmarks"
        eyebrow="Free data"
        title="AU startup benchmarks"
        lede="MRR, ARR, burn rate, churn and SVI scores by stage — compare your startup against 2,700+ AU peers."
        tone="sunken"
        spacing="sm"
        actions={[{ href: "/benchmarks", label: "View benchmarks", variant: "secondary" }]}
      />

      <CtaBand
        title="Know your startup's value today."
        sub="The first run is free and needs no card."
        primary={{ href: "/analyze", label: "Get your free SVI score", ctaId: "insights_final_score" }}
        secondary={{ href: "/pricing", label: "View pricing" }}
      />
    </MarketingShell>
  );
}
