import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Clock } from "lucide-react";
import { getAllArticles } from "@/lib/insights";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
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
  valuation: { label: "Valuation", color: "bg-brand-100 text-brand-700" },
  "cap-table": { label: "Cap Table", color: "bg-teal-100 text-teal-700" },
  fundraising: { label: "Fundraising", color: "bg-amber-100 text-amber-700" },
  equity: { label: "Equity", color: "bg-emerald-100 text-emerald-700" },
  compliance: { label: "Compliance", color: "bg-red-100 text-red-700" },
  tools: { label: "Tools", color: "bg-blue-100 text-blue-700" },
  growth: { label: "Growth", color: "bg-purple-100 text-purple-700" },
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

  // Serialise articles for client component
  const serialised = articles.map((a) => ({
    slug: a.slug,
    title: a.title,
    description: a.description,
    category: a.category,
    publishedAt: a.publishedAt,
    readingTime: a.readingTime,
  }));

  return (
    <div className="min-h-svh bg-white text-ink-800">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-ink-900 pt-32 pb-20 md:pt-40 md:pb-28">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(255,255,255,0.12),transparent)]" />
        <div className="relative mx-auto max-w-7xl px-6 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 backdrop-blur-sm mb-6">
            <BookOpen strokeWidth={1.75} className="h-4 w-4 text-brand-200" />
            <span className="text-xs font-medium tracking-wide text-brand-100">
              Founder Resources
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Insights &amp; Guides
          </h1>
          <p className="mt-4 text-lg md:text-xl text-brand-100/90 max-w-2xl mx-auto leading-relaxed">
            Expert resources for Australian founders — valuation, ownership,
            fundraising, and growth.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-6 py-12 md:py-16">
        {/* Category filter + article grid (client component) */}
        <InsightsCategoryFilter
          categories={CATEGORIES}
          categoryLabels={CATEGORY_LABELS}
          articles={serialised}
        />

        {/* Empty state (server-rendered fallback) */}
        {articles.length === 0 && (
          <div className="rounded-2xl border border-surface-200 bg-surface-50 px-8 py-16 text-center">
            <BookOpen strokeWidth={1.75} className="h-10 w-10 text-ink-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-ink-800 mb-2">Coming Soon</h2>
            <p className="text-sm text-ink-600 mb-6 max-w-md mx-auto">
              We are preparing expert guides on startup valuation, cap table management,
              and fundraising strategies for Australian founders.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Get Your Free SVI Score
              <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* CTA */}
        <div className="mt-20 rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100/60 border border-brand-200 p-10 md:p-14 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-ink-900 mb-3">
            Know your startup&apos;s value today
          </h2>
          <p className="text-base text-ink-600 mb-8 max-w-lg mx-auto">
            Free AI-powered Startup Value Index — a comprehensive analysis in under 60 seconds.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-7 py-3.5 text-sm font-semibold text-white hover:bg-brand-700 shadow-lg shadow-brand-600/25 transition-all hover:shadow-xl hover:shadow-brand-600/30"
          >
            Get Your Free SVI Score
            <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
