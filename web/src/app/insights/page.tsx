import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Clock } from "lucide-react";
import { getAllArticles } from "@/lib/insights";

export const metadata: Metadata = {
  title: "Insights — Startup Valuation, Equity & Fundraising | BlockID.au",
  description:
    "Expert guides for Australian founders: startup valuation, cap table management, equity splits, investor readiness, and fundraising strategies.",
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

export default function InsightsPage() {
  const articles = getAllArticles();

  return (
    <div className="min-h-svh bg-white text-ink-800">
      <header className="border-b border-surface-200">
        <div className="mx-auto max-w-4xl px-6 py-5 flex items-center justify-between">
          <Link href="/" className="text-sm text-ink-600 hover:text-ink-800 transition-colors">
            ← BlockID.au
          </Link>
          <Link href="/score" className="text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors">
            Get Your SVI Score →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            <span className="text-xs uppercase tracking-[0.2em] text-brand-600 font-medium">
              Founder Insights
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-ink-900">
            Startup Guides & Analysis
          </h1>
          <p className="mt-3 text-base text-ink-600 leading-relaxed max-w-2xl">
            Practical guides for Australian founders on valuation, equity, fundraising,
            and building investor-ready companies. Powered by data and AI.
          </p>
        </div>

        {articles.length === 0 ? (
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
        ) : (
          <div className="space-y-6">
            {articles.map((article) => {
              const cat = CATEGORY_LABELS[article.category] ?? CATEGORY_LABELS.growth;
              return (
                <Link
                  key={article.slug}
                  href={`/insights/${article.slug}`}
                  className="block rounded-xl border border-surface-200 bg-white p-6 hover:border-brand-500/40 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${cat.color}`}>
                      {cat.label}
                    </span>
                    <span className="text-xs text-ink-500 flex items-center gap-1">
                      <Clock strokeWidth={1.75} className="h-3 w-3" />
                      {article.readingTime} min read
                    </span>
                    <span className="text-xs text-ink-500">
                      {new Date(article.publishedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold text-ink-900 group-hover:text-brand-700">
                    {article.title}
                  </h2>
                  <p className="mt-1.5 text-sm text-ink-600 leading-relaxed line-clamp-2">
                    {article.description}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600">
                    Read more <ArrowRight strokeWidth={1.75} className="h-3.5 w-3.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <div className="mt-16 rounded-2xl bg-brand-50 border border-brand-200 p-8 text-center">
          <h2 className="text-xl font-bold text-ink-900 mb-2">Know your startup value today</h2>
          <p className="text-sm text-ink-600 mb-6">
            Free AI-powered Startup Value Index — 10-page analysis in under 60 seconds.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Get Your Free SVI Score
            <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
