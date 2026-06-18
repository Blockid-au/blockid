// /index/listings — the "Markets" view of startupvalueindex.com (T0230, v2.15).
//
// Server-rendered ranked table of every analysed startup. Sort + filter +
// pagination handled via query params so the URL is shareable.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, BarChart3, Filter, Minus, Sparkles } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { computeListings, type ListingSort } from "@/lib/startup-index-listings";

export const metadata: Metadata = {
  title: "Startup Listings · BlockID Startup Value Index",
  description: "Ranked listing of every AU startup analysed by BlockID. Filter by sector, stage, revenue status — sort by SVI, weekly delta, valuation.",
};

export const dynamic = "force-dynamic";
export const revalidate = 300;

const SECTOR_OPTS = ["all", "saas", "fintech", "ai", "healthtech", "marketplace", "deeptech", "ecommerce"];
const STAGE_OPTS = ["all", "0", "1", "2", "3", "4", "5", "6", "7"];

function fmtAud(v: number): string {
  if (v >= 1_000_000_000) return `A$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(0)}K`;
  if (v <= 0) return "—";
  return `A$${Math.round(v).toLocaleString("en-AU")}`;
}

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <span className="text-ink-300 text-xs">—</span>;
  const min = Math.min(...data) - 1;
  const max = Math.max(...data) + 1;
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / range) * 100}`)
    .join(" ");
  const lastDelta = data[data.length - 1] - data[0];
  const color = lastDelta >= 0 ? "stroke-emerald-500" : "stroke-rose-500";
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-20 h-6">
      <polyline points={points} fill="none" strokeWidth="2.5" className={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DeltaCell({ delta }: { delta: number }) {
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const cls = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-ink-400";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold tabular-nums ${cls}`}>
      <Icon className="h-3 w-3" />
      {delta > 0 ? "+" : ""}{delta.toFixed(1)}
    </span>
  );
}

interface PageProps {
  searchParams: Promise<{
    sector?: string;
    stage?: string;
    sort?: ListingSort;
    order?: "asc" | "desc";
    page?: string;
    public_only?: string;
    revenue_only?: string;
  }>;
}

export default async function ListingsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filter = {
    sector: sp.sector ?? "all",
    stage: sp.stage === "all" || sp.stage == null ? ("all" as const) : Number(sp.stage),
    publicOnly: sp.public_only === "true",
    revenueOnly: sp.revenue_only === "true",
  };
  const sort = (sp.sort ?? "svi") as ListingSort;
  const order = (sp.order ?? "desc") as "asc" | "desc";
  const page = Math.max(1, Number(sp.page ?? 1));

  const data = await computeListings({ filter, sort, order, page, pageSize: 50 });

  function urlWith(updates: Record<string, string | number | undefined>): string {
    const next = new URLSearchParams();
    if (filter.sector && filter.sector !== "all") next.set("sector", filter.sector);
    if (filter.stage !== "all") next.set("stage", String(filter.stage));
    if (filter.publicOnly) next.set("public_only", "true");
    if (filter.revenueOnly) next.set("revenue_only", "true");
    next.set("sort", sort);
    next.set("order", order);
    next.set("page", String(page));
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === "" || v === "all") next.delete(k);
      else next.set(k, String(v));
    }
    return `/index/listings?${next.toString()}`;
  }

  function SortHeader({ field, label, align = "left" }: { field: ListingSort; label: string; align?: "left" | "right" }) {
    const active = sort === field;
    const nextOrder = active && order === "desc" ? "asc" : "desc";
    return (
      <th className={`py-2 px-2 text-[10px] uppercase tracking-wider font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
        <Link href={urlWith({ sort: field, order: nextOrder, page: 1 })} className={`hover:text-brand-700 ${active ? "text-ink-900" : "text-ink-400"}`}>
          {label}{active ? (order === "desc" ? " ↓" : " ↑") : ""}
        </Link>
      </th>
    );
  }

  return (
    <div className="min-h-svh bg-surface-50 text-ink-800">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-16">
        {/* Header */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 mb-3">
            <Sparkles className="h-3 w-3 text-amber-600" />
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-[0.15em]">Markets · Beta</span>
          </div>
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-ink-900 flex items-center gap-2">
                <BarChart3 className="h-7 w-7 text-brand-600" />
                Startup Listings
              </h1>
              <p className="text-sm text-ink-600 mt-1">
                {data.total.toLocaleString()} AU startups analysed by BlockID — ranked by SVI score. Anonymous tickers protect founder identity unless they opt in.
              </p>
            </div>
            <Link href="/index" className="text-sm text-brand-700 hover:underline">← Back to Index</Link>
          </div>
        </div>

        {/* Filter bar */}
        <div className="rounded-xl border border-ink-200 bg-white p-3 mb-4 flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-ink-400" />
          <span className="text-xs font-bold text-ink-500 uppercase tracking-wider">Filter:</span>

          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] text-ink-500">Sector:</span>
            {SECTOR_OPTS.map((s) => (
              <Link
                key={s}
                href={urlWith({ sector: s, page: 1 })}
                className={`text-[11px] px-2 py-0.5 rounded-full border ${filter.sector === s ? "bg-brand-600 text-white border-brand-600" : "bg-white text-ink-600 border-ink-200 hover:border-brand-300"}`}
              >
                {s === "all" ? "All" : s}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 ml-2">
            <span className="text-[11px] text-ink-500">Stage:</span>
            {STAGE_OPTS.map((s) => (
              <Link
                key={s}
                href={urlWith({ stage: s, page: 1 })}
                className={`text-[11px] px-2 py-0.5 rounded-full border ${String(filter.stage) === s ? "bg-brand-600 text-white border-brand-600" : "bg-white text-ink-600 border-ink-200 hover:border-brand-300"}`}
              >
                {s === "all" ? "All" : `S${s}`}
              </Link>
            ))}
          </div>

          <div className="flex gap-1.5 ml-2">
            <Link
              href={urlWith({ public_only: filter.publicOnly ? undefined : "true", page: 1 })}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${filter.publicOnly ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-ink-600 border-ink-200 hover:border-emerald-300"}`}
            >
              Public only
            </Link>
            <Link
              href={urlWith({ revenue_only: filter.revenueOnly ? undefined : "true", page: 1 })}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${filter.revenueOnly ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-ink-600 border-ink-200 hover:border-emerald-300"}`}
            >
              Revenue only
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-ink-200 bg-white overflow-x-auto">
          {data.rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-400">
              No startups match the current filters.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/40">
                  <th className="py-2 px-2 text-[10px] uppercase tracking-wider font-semibold text-ink-400 text-left">#</th>
                  <th className="py-2 px-2 text-[10px] uppercase tracking-wider font-semibold text-ink-400 text-left">Ticker</th>
                  <th className="py-2 px-2 text-[10px] uppercase tracking-wider font-semibold text-ink-400 text-left">Sector</th>
                  <SortHeader field="stage" label="Stage" />
                  <SortHeader field="svi" label="SVI" align="right" />
                  <SortHeader field="delta" label="Δ 7d" align="right" />
                  <SortHeader field="valuation" label="Valuation" align="right" />
                  <th className="py-2 px-2 text-[10px] uppercase tracking-wider font-semibold text-ink-400 text-right">Trend</th>
                  <th className="py-2 px-2 text-[10px] uppercase tracking-wider font-semibold text-ink-400 text-right">Analyses</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={row.ticker + row.identityHash} className="border-b border-ink-100 last:border-0 hover:bg-amber-50/30 transition-colors">
                    <td className="py-2 px-2 text-xs text-ink-400 tabular-nums">{(data.page - 1) * data.pageSize + i + 1}</td>
                    <td className="py-2 px-2">
                      <Link href={`/index/listings/${row.ticker}`} className="text-xs font-mono font-bold text-brand-700 hover:underline">
                        {row.ticker}
                      </Link>
                      {row.publicName && (
                        <span className="text-[10px] text-ink-500 ml-1.5 truncate inline-block max-w-[120px] align-middle">{row.publicName}</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-xs text-ink-600 capitalize">{row.sectorLabel}</td>
                    <td className="py-2 px-2 text-xs text-ink-700">
                      <span className="inline-flex items-center gap-1">
                        <span className="text-[10px] font-bold text-ink-400">S{row.stage}</span>
                        {row.stageLabel}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-xs font-bold text-right tabular-nums text-ink-900">{row.svi}</td>
                    <td className="py-2 px-2 text-right"><DeltaCell delta={row.deltaWeek} /></td>
                    <td className="py-2 px-2 text-xs text-right font-mono tabular-nums text-ink-700">{fmtAud(row.valuationAud)}</td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex justify-end"><MiniSparkline data={row.sparkline} /></div>
                    </td>
                    <td className="py-2 px-2 text-xs text-right text-ink-500 tabular-nums">{row.analysesCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {data.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-xs text-ink-600">
            <span>Page {data.page} of {data.totalPages} · {data.total} total</span>
            <div className="flex gap-2">
              {data.page > 1 && <Link href={urlWith({ page: data.page - 1 })} className="text-brand-700 hover:underline">← Prev</Link>}
              {data.page < data.totalPages && <Link href={urlWith({ page: data.page + 1 })} className="text-brand-700 hover:underline">Next →</Link>}
            </div>
          </div>
        )}

        {/* Methodology */}
        <div className="mt-8 rounded-xl border border-ink-200 bg-white p-5 text-xs text-ink-600">
          <p className="font-bold text-ink-700 mb-1 uppercase tracking-wider">Listing methodology</p>
          <p className="leading-relaxed">
            Every identity hash with at least one SVI analysis in the last 90 days is listed. Ticker = SECTOR-XXX where XXX is the last 3 of the latest analysis slug. The same identity always maps to the same anonymous hash but the ticker may shift sectors if their pitch evolves. Public names appear only when the founder explicitly opts in via{" "}
            <Link href="/workspace/founder-profile" className="text-brand-700 hover:underline">Founder Profile</Link>.
          </p>
          <p className="mt-2 font-mono bg-ink-50 px-2 py-1 rounded text-[11px]">
            BSI-AU Listings as of {data.generatedAt.slice(0, 10)}: {data.total} companies, sort={sort} {order}, filter={JSON.stringify(filter)}
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
