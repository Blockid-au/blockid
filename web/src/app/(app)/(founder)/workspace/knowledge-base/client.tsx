"use client";

import * as React from "react";
import Markdown from "react-markdown";
import { BookOpen, Download, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KBArticleLite {
  id: string;
  slug: string;
  title: string;
  category: string;
  content: string;
  author: string;
  updated_at: string;
}

const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "valuation", label: "Valuation" },
  { id: "svi", label: "SVI" },
  { id: "equity", label: "Equity" },
  { id: "market", label: "Market" },
  { id: "financial", label: "Financial" },
  { id: "legal", label: "Legal" },
  { id: "strategy", label: "Strategy" },
  { id: "benchmark", label: "Benchmark" },
];

const CATEGORY_TONE: Record<string, string> = {
  valuation: "bg-brand-50 text-brand-700 border-brand-100",
  svi: "bg-emerald-50 text-emerald-700 border-emerald-100",
  equity: "bg-amber-50 text-amber-700 border-amber-100",
  market: "bg-sky-50 text-sky-700 border-sky-100",
  financial: "bg-purple-50 text-purple-700 border-purple-100",
  legal: "bg-rose-50 text-rose-700 border-rose-100",
  strategy: "bg-indigo-50 text-indigo-700 border-indigo-100",
  benchmark: "bg-teal-50 text-teal-700 border-teal-100",
};

export function KnowledgeBaseClient({
  initialArticles,
  isAdmin,
}: {
  initialArticles: KBArticleLite[];
  isAdmin: boolean;
}) {
  const [articles] = React.useState<KBArticleLite[]>(initialArticles);
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");
  const [serverResults, setServerResults] = React.useState<KBArticleLite[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [openArticle, setOpenArticle] = React.useState<KBArticleLite | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [exportUrl, setExportUrl] = React.useState<string | null>(null);

  // Debounced server search when query gets non-trivial. We deliberately keep
  // all setState calls inside the async timeout callback so this effect does
  // not perform synchronous renders.
  React.useEffect(() => {
    const q = search.trim();
    if (q.length < 3) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/kb/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (Array.isArray(json.results)) setServerResults(json.results);
      } catch {
        // ignore — fall back to client-side filter
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const useServer = q.length >= 3 && serverResults !== null;
    const base = useServer ? (serverResults as KBArticleLite[]) : articles;
    return base.filter((a) => {
      if (category !== "all" && a.category !== category) return false;
      if (!q || useServer) return true;
      return a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q);
    });
  }, [articles, serverResults, search, category]);

  async function handleExport() {
    setExporting(true);
    setExportUrl(null);
    try {
      const res = await fetch("/api/kb/export", { method: "POST" });
      const json = await res.json();
      if (json.url) setExportUrl(json.url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BookOpen strokeWidth={1.75} className="h-6 w-6 text-brand-600" />
            Knowledge Base
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            BlockID Startup Index™ proprietary KB. Read-only methodologies, SVI dimensions, and AU market benchmarks that every C-Level AI agent learns from.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              <Download strokeWidth={1.75} className="h-4 w-4" />
              {exporting ? "Exporting…" : "Export KB"}
            </button>
            {exportUrl && (
              <a href={exportUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 underline">
                Download export
              </a>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
        <input
          type="text"
          placeholder="Search articles, methodologies, benchmarks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-surface-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">searching…</span>}
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={cn(
              "px-3 py-1.5 text-xs rounded-full border transition-colors",
              category === c.id
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-ink-700 border-surface-200 hover:bg-surface-50",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Articles grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-ink-500 text-sm">
          No articles found. Try a different search or category.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setOpenArticle(a)}
              className="text-left rounded-xl border border-surface-200 bg-white p-4 hover:shadow-md hover:border-brand-200 transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wide font-semibold", CATEGORY_TONE[a.category] ?? "bg-surface-100 text-ink-600 border-surface-200")}>
                  {a.category}
                </span>
                <span className="text-[10px] text-ink-400">{formatDate(a.updated_at)}</span>
              </div>
              <h3 className="text-sm font-semibold text-ink-800 mb-1 line-clamp-2">{a.title}</h3>
              <p className="text-xs text-ink-500 line-clamp-3">{a.content.slice(0, 200)}</p>
              <p className="text-[10px] text-ink-400 mt-2 italic">by {a.author}</p>
            </button>
          ))}
        </div>
      )}

      {/* Slide-over drawer */}
      {openArticle && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setOpenArticle(null)}>
          <div className="flex-1 bg-black/30 backdrop-blur-sm" />
          <div
            className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-surface-200 px-6 py-4 flex items-start justify-between gap-4">
              <div>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wide font-semibold", CATEGORY_TONE[openArticle.category] ?? "bg-surface-100 text-ink-600 border-surface-200")}>
                  {openArticle.category}
                </span>
                <h2 className="text-lg font-semibold mt-2">{openArticle.title}</h2>
                <p className="text-xs text-ink-500 mt-1">by {openArticle.author} · updated {formatDate(openArticle.updated_at)}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpenArticle(null)}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-surface-100"
                aria-label="Close"
              >
                <X strokeWidth={1.75} className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-6 prose prose-sm max-w-none">
              <Markdown>{openArticle.content}</Markdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}
