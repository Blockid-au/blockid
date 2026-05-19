import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Clock } from "lucide-react";
import { getAllArticles, getArticleBySlug, getArticleContent } from "@/lib/insights";
import { InsightBody } from "./insight-body";

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
    title: `${article.title} | BlockID.au`,
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

  return (
    <div className="min-h-svh bg-white text-ink-800">
      <header className="border-b border-surface-200">
        <div className="mx-auto max-w-3xl px-6 py-5 flex items-center justify-between">
          <Link href="/insights" className="text-sm text-ink-600 hover:text-ink-800 transition-colors flex items-center gap-1">
            <ArrowLeft strokeWidth={1.75} className="h-3.5 w-3.5" />
            All Insights
          </Link>
          <Link href="/" className="text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors">
            Get Your SVI Score →
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-12">
        {/* Meta */}
        <div className="flex items-center gap-3 mb-4 text-xs text-ink-500">
          <BookOpen strokeWidth={1.75} className="h-3.5 w-3.5" />
          <span>{new Date(article.publishedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</span>
          <span className="flex items-center gap-1">
            <Clock strokeWidth={1.75} className="h-3 w-3" />
            {article.readingTime} min read
          </span>
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-ink-900 leading-tight">
          {article.title}
        </h1>
        <p className="mt-3 text-lg text-ink-600 leading-relaxed">
          {article.description}
        </p>

        <hr className="my-8 border-surface-200" />

        {/* Rendered markdown content */}
        <InsightBody content={content} />

        {/* CTA */}
        <div className="mt-12 rounded-2xl bg-brand-50 border border-brand-200 p-6 text-center">
          <h2 className="text-lg font-bold text-ink-900 mb-2">{article.cta.label}</h2>
          <Link
            href={article.cta.href}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            {article.cta.label}
            <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
          </Link>
        </div>

        {/* Back link */}
        <div className="mt-8 text-center">
          <Link href="/insights" className="text-sm text-ink-600 hover:text-ink-800 transition-colors">
            ← Back to all insights
          </Link>
        </div>
      </article>
    </div>
  );
}
