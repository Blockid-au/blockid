import type { Metadata } from "next";
import { brandedOrAbsolute, fitDescription } from "@/lib/seo/page-meta";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Calendar, Clock, User } from "lucide-react";
import { getAllArticles, getArticleBySlug, getArticleContent, getArticlesByCategory } from "@/lib/insights";
import { InsightBody } from "./insight-body";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, FOCUS_RING, MOTION, PageHero, Prose, Section } from "@/components/marketing/template";
import { ArticleJsonLd } from "@/components/seo/json-ld";
import { InsightTracker } from "@/components/analytics/insight-tracker";

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  valuation: { label: "Valuation", color: "bg-brand-100 text-brand-700" },
  "cap-table": { label: "Cap Table", color: "bg-teal-100 text-teal-700" },
  fundraising: { label: "Fundraising", color: "bg-amber-100 text-amber-700" },
  equity: { label: "Equity", color: "bg-emerald-100 text-emerald-700" },
  compliance: { label: "Compliance", color: "bg-red-100 text-red-700" },
  tools: { label: "Tools", color: "bg-blue-100 text-blue-700" },
  growth: { label: "Growth", color: "bg-purple-100 text-purple-700" },
};

// B3 Task 10 — ISR (1h). Articles are pre-rendered via generateStaticParams;
// setting `revalidate` lets edits to the underlying .md content propagate
// without a full deploy. Combined with the static-params list this becomes a
// hybrid SSG + ISR page (Next 16 App Router).
export const revalidate = 3600;

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
    title: brandedOrAbsolute(article.title),
    description: fitDescription([article.description], { min: 70, max: 165 }),
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

  // G17 P2-A: MarketingShell + PageHero (the article header) + Prose around
  // the body + CtaBand + a related-articles Section. Category chips keep
  // their colour classes from CATEGORY_LABELS.
  return (
    <MarketingShell>
      <ArticleJsonLd
        title={article.title}
        description={article.description}
        url={`https://blockid.au/insights/${slug}`}
        publishedAt={article.publishedAt}
        updatedAt={article.updatedAt}
      />
      <InsightTracker
        slug={slug}
        category={article.category}
        keywords={article.keywords}
        readingTime={article.readingTime}
        title={article.title}
      />

      <PageHero
        eyebrow={cat.label}
        title={article.title}
        sub={article.description}
        ctas={[{ href: "/insights", label: "All insights", variant: "secondary" }]}
        footnote={
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Calendar strokeWidth={1.75} aria-hidden className="h-3.5 w-3.5" />
              {new Date(article.publishedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock strokeWidth={1.75} aria-hidden className="h-3.5 w-3.5" />
              {article.readingTime} min read
            </span>
            <span className="inline-flex items-center gap-1.5">
              <User strokeWidth={1.75} aria-hidden className="h-3.5 w-3.5" />
              BlockID Team
            </span>
          </span>
        }
        align="start"
      />

      {/* Article body */}
      <Section id="article" ariaLabel={article.title} divider={false}>
        <article>
          <Prose measure="wide">
            <InsightBody content={content} title={article.title} />
          </Prose>
        </article>
      </Section>

      <CtaBand
        title="Get your Startup Value Index score free"
        sub="Eight dimensions, an evidence-backed valuation range and a full report — in 60 seconds."
        primary={{ href: "/analyze", label: "Get your score free", ctaId: "insight_final_score" }}
        secondary={{ href: "/insights", label: "Back to all insights" }}
        tone="dark"
      />

      {/* Related articles */}
      {related.length > 0 && (
        <Section
          id="related"
          title="Related articles"
          lede={`More insights on ${cat.label.toLowerCase()} for founders`}
          align="center"
          tone="sunken"
        >
          <ul className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3" aria-label="Related articles">
            {related.map((rel) => {
              const relCat = CATEGORY_LABELS[rel.category] ?? CATEGORY_LABELS.growth;
              return (
                <li key={rel.slug} className="flex">
                  <Link
                    href={`/insights/${rel.slug}`}
                    className={`group flex h-full w-full flex-col rounded-xl border border-line-subtle bg-surface p-6 shadow-1 hover:border-line hover:shadow-2 ${MOTION} ${FOCUS_RING}`}
                  >
                    <span className={`mb-3 self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${relCat.color}`}>
                      {relCat.label}
                    </span>
                    <h3 className="font-display text-lg font-semibold leading-snug tracking-tight text-primary line-clamp-2">
                      {rel.title}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-secondary line-clamp-2">
                      {rel.description}
                    </p>
                    <div className="mt-4 flex items-center gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <Clock strokeWidth={1.75} aria-hidden className="h-3 w-3" />
                        {rel.readingTime} min
                      </span>
                      <span>
                        {new Date(rel.publishedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-action">
                      Read more <ArrowRight strokeWidth={1.75} aria-hidden className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </MarketingShell>
  );
}
