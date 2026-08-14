import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { getAllArticles } from "@/lib/insights";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";
import { InsightsCategoryFilter } from "./category-filter";

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
      <MarketingHero
        eyebrow="Founder Resources"
        title={
          <>
            Insights &amp;{" "}
            <span className="bg-gradient-to-r from-[#00D4FF] to-[#0066FF] bg-clip-text text-transparent">
              Guides
            </span>
          </>
        }
        subtitle="Expert resources for Australian founders — valuation, ownership, fundraising, and growth."
      />

      <main className="mx-auto max-w-7xl px-6 py-12 md:py-16">
        {/* Category filter + article grid (client component) */}
        <InsightsCategoryFilter
          categories={CATEGORIES}
          categoryLabels={CATEGORY_LABELS}
          articles={serialised}
        />

        {/* Empty state (server-rendered fallback) */}
        {articles.length === 0 && (
          <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] backdrop-blur-sm px-8 py-16 text-center">
            <BookOpen strokeWidth={1.75} className="h-10 w-10 text-[#94A3B8] mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-[#F8FAFC] mb-2">Coming Soon</h2>
            <p className="text-sm text-[#94A3B8] mb-6 max-w-md mx-auto">
              We are preparing expert guides on startup valuation, cap table management,
              and fundraising strategies for Australian founders.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#00D4FF] to-[#0066FF] px-5 py-2.5 text-sm font-semibold text-[#0A0F1E] hover:opacity-90 transition-opacity"
            >
              Get Your Free SVI Score
              <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* Benchmarks teaser */}
        <div className="mt-14 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] backdrop-blur-sm p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#00D4FF] font-semibold mb-1">Free Data</p>
            <h2 className="text-xl font-semibold text-[#F8FAFC]">AU Startup Benchmarks</h2>
            <p className="mt-1 text-sm text-[#94A3B8]">
              MRR, ARR, burn rate, churn and SVI scores by stage — compare your startup against 2,700+ AU peers.
            </p>
          </div>
          <Link
            href="/benchmarks"
            className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#00D4FF] to-[#0066FF] px-6 py-3 text-sm font-semibold text-[#0A0F1E] hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            View Benchmarks <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
          </Link>
        </div>
      </main>

      <MarketingCtaStrip
        headline="Know your startup's value today."
        primary={{ href: "/", label: "Get Your Free SVI Score" }}
        secondary={{ href: "/pricing", label: "View Pricing" }}
      />
    </MarketingShell>
  );
}
