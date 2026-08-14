"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";

interface ArticleSummary {
  slug: string;
  title: string;
  description: string;
  category: string;
  publishedAt: string;
  readingTime: number;
}

interface CategoryDef {
  key: string;
  label: string;
}

interface Props {
  categories: CategoryDef[];
  categoryLabels: Record<string, { label: string; color: string }>;
  articles: ArticleSummary[];
}

export function InsightsCategoryFilter({ categories, categoryLabels, articles }: Props) {
  const [active, setActive] = React.useState("all");

  const filtered = active === "all"
    ? articles
    : articles.filter((a) => a.category === active);

  const featured = filtered[0];
  const rest = filtered.slice(1);

  if (articles.length === 0) return null;

  return (
    <>
      {/* Category tabs */}
      <div className="mb-10 flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => setActive(cat.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
              active === cat.key
                ? "bg-gradient-to-r from-[#00D4FF] to-[#0066FF] text-[#0A0F1E] shadow-md shadow-[rgba(0,212,255,0.25)]"
                : "border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-[#94A3B8] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#F8FAFC]"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Featured article (first one) */}
      {featured && (
        <Link
          href={`/insights/${featured.slug}`}
          className="group block rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] backdrop-blur-sm hover:border-[rgba(0,212,255,0.3)] hover:scale-[1.01] transition-all duration-300 mb-10 overflow-hidden"
        >
          <div className="p-8 md:p-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-[#00D4FF] bg-[rgba(0,212,255,0.1)] px-2.5 py-1 rounded-full">
                Featured
              </span>
              <CategoryBadge category={featured.category} labels={categoryLabels} />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#F8FAFC] group-hover:text-[#00D4FF] transition-colors leading-tight">
              {featured.title}
            </h2>
            <p className="mt-3 text-base text-[#94A3B8] leading-relaxed max-w-3xl line-clamp-3">
              {featured.description}
            </p>
            <div className="mt-5 flex items-center gap-4">
              <span className="text-xs text-[#94A3B8] flex items-center gap-1.5">
                <Clock strokeWidth={1.75} className="h-3.5 w-3.5" />
                {featured.readingTime} min read
              </span>
              <span className="text-xs text-[#94A3B8]">
                {new Date(featured.publishedAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#00D4FF] group-hover:gap-2.5 transition-all">
              Read more <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
            </span>
          </div>
        </Link>
      )}

      {/* Article grid */}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rest.map((article) => {
            return (
              <Link
                key={article.slug}
                href={`/insights/${article.slug}`}
                className="group flex flex-col rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] backdrop-blur-sm hover:border-[rgba(0,212,255,0.3)] hover:scale-[1.02] transition-all duration-300 overflow-hidden"
              >
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <CategoryBadge category={article.category} labels={categoryLabels} />
                  </div>
                  <h3 className="text-lg font-bold text-[#F8FAFC] group-hover:text-[#00D4FF] transition-colors leading-snug line-clamp-2">
                    {article.title}
                  </h3>
                  <p className="mt-2 text-sm text-[#94A3B8] leading-relaxed line-clamp-2 flex-1">
                    {article.description}
                  </p>
                  <div className="mt-4 flex items-center gap-3 text-xs text-[#94A3B8]">
                    <span className="flex items-center gap-1">
                      <Clock strokeWidth={1.75} className="h-3 w-3" />
                      {article.readingTime} min
                    </span>
                    <span>
                      {new Date(article.publishedAt).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#00D4FF] group-hover:gap-2.5 transition-all">
                    Read more <ArrowRight strokeWidth={1.75} className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function CategoryBadge({
  category,
  labels,
}: {
  category: string;
  labels: Record<string, { label: string; color: string }>;
}) {
  const cat = labels[category] ?? { label: category, color: "" };
  return (
    <span className="text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-[rgba(0,212,255,0.1)] text-[#00D4FF]">
      {cat.label}
    </span>
  );
}
