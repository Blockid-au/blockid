import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Calendar, Clock, User } from "lucide-react";
import { getAllArticles, getArticleBySlug, getArticleContent, getArticlesByCategory } from "@/lib/insights";
import { InsightBody } from "./insight-body";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { ArticleJsonLd } from "@/components/seo/json-ld";

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  valuation: { label: "Valuation", color: "bg-brand-100 text-brand-700" },
  "cap-table": { label: "Cap Table", color: "bg-teal-100 text-teal-700" },
  fundraising: { label: "Fundraising", color: "bg-amber-100 text-amber-700" },
  equity: { label: "Equity", color: "bg-emerald-100 text-emerald-700" },
  compliance: { label: "Compliance", color: "bg-red-100 text-red-700" },
  tools: { label: "Tools", color: "bg-blue-100 text-blue-700" },
  growth: { label: "Growth", color: "bg-purple-100 text-purple-700" },
};

export async function generateStaticParams() {
  return getAllArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.description,
    keywords: article.keywords,
    openGraph: {
      title: article.title,
      description: article.description,
      type: "article",
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      url: `https://blockid.au/insights/${slug}`,
      images: article.ogImage ? [article.ogImage] : ["/images/logo-full.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
    },
    alternates: {
      canonical: `https://blockid.au/insights/${slug}`,
    },
  };
}

export default async function InsightPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  const content = getArticleContent(slug);

  if (!article || !content) notFound();

  const cat = CATEGORY_LABELS[article.category] ?? CATEGORY_LABELS.growth;

  // Related articles: same category, excluding current, max 3
  const related = getArticlesByCategory(article.category)
    .filter((a) => a.slug !== slug)
    .slice(0, 3);

  return (
    <div className="min-h-svh bg-white text-ink-800">
      <ArticleJsonLd
        title={article.title}
        description={article.description}
        url={`https://blockid.au/insights/${slug}`}
        publishedAt={article.publishedAt}
        updatedAt={article.updatedAt}
      />
      <Navbar />

      {/* Article header */}
      <header className="relative bg-gradient-to-br from-surface-50 via-white to-brand-50/30 pt-32 pb-12 md:pt-40 md:pb-16 border-b border-surface-200">
        <div className="mx-auto max-w-3xl px-6">
          {/* Breadcrumb */}
          <Link
            href="/insights"
            className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-600 transition-colors mb-8"
          >
            <ArrowLeft strokeWidth={1.75} className="h-3.5 w-3.5" />
            All Insights
          </Link>

          {/* Category + Meta */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <span className={`text-[11px] font-semibold rounded-full px-3 py-1 ${cat.color}`}>
              {cat.label}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-ink-400">
              <Calendar strokeWidth={1.75} className="h-3.5 w-3.5" />
              {new Date(article.publishedAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-ink-400">
              <Clock strokeWidth={1.75} className="h-3.5 w-3.5" />
              {article.readingTime} min read
            </span>
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl lg:text-[2.75rem] font-extrabold tracking-tight text-ink-900 leading-tight">
            {article.title}
          </h1>
          <p className="mt-4 text-lg text-ink-500 leading-relaxed max-w-2xl">
            {article.description}
          </p>

          {/* Author */}
          <div className="mt-6 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <User strokeWidth={1.75} className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-800">BlockID Team</p>
              <p className="text-xs text-ink-400">Expert guides for founders</p>
            </div>
          </div>
        </div>
      </header>

      {/* Article body */}
      <article className="mx-auto max-w-3xl px-6 py-12 md:py-16">
        <InsightBody content={content} />
      </article>

      {/* CTA Section */}
      <section className="bg-gradient-to-br from-brand-600 via-brand-700 to-ink-900 py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Get Your Free Startup Value Index
          </h2>
          <p className="text-base text-brand-100/80 mb-8 max-w-lg mx-auto">
            AI-powered valuation, investor-readiness scoring, and a comprehensive report in under 60 seconds.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 shadow-lg transition-all hover:shadow-xl"
          >
            Start Free Analysis
            <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Related articles */}
      {related.length > 0 && (
        <section className="bg-surface-50 border-t border-surface-200 py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-ink-900">Related Articles</h2>
              <p className="mt-2 text-sm text-ink-500">
                More insights on {cat.label.toLowerCase()} for founders
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {related.map((rel) => {
                const relCat = CATEGORY_LABELS[rel.category] ?? CATEGORY_LABELS.growth;
                return (
                  <Link
                    key={rel.slug}
                    href={`/insights/${rel.slug}`}
                    className="group flex flex-col rounded-2xl border border-surface-200 bg-white shadow-sm hover:border-brand-500/40 hover:shadow-lg transition-all overflow-hidden"
                  >
                    <div className="flex flex-1 flex-col p-6">
                      <span className={`self-start text-[11px] font-semibold rounded-full px-2.5 py-0.5 mb-3 ${relCat.color}`}>
                        {relCat.label}
                      </span>
                      <h3 className="text-base font-bold text-ink-900 group-hover:text-brand-700 transition-colors leading-snug line-clamp-2">
                        {rel.title}
                      </h3>
                      <p className="mt-2 text-sm text-ink-500 leading-relaxed line-clamp-2 flex-1">
                        {rel.description}
                      </p>
                      <div className="mt-4 flex items-center gap-3 text-xs text-ink-400">
                        <span className="flex items-center gap-1">
                          <Clock strokeWidth={1.75} className="h-3 w-3" />
                          {rel.readingTime} min
                        </span>
                        <span>
                          {new Date(rel.publishedAt).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 group-hover:gap-2.5 transition-all">
                        Read more <ArrowRight strokeWidth={1.75} className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Back link */}
      <div className="bg-white py-8 text-center border-t border-surface-200">
        <Link
          href="/insights"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-600 transition-colors"
        >
          <ArrowLeft strokeWidth={1.75} className="h-3.5 w-3.5" />
          Back to all insights
        </Link>
      </div>

      <Footer />
    </div>
  );
}
