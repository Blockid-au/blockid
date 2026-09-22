// /startup-index/listings — the "Markets" view of startupvalueindex.com (T0230, v2.15).
//
// Server-rendered ranked table of every analysed startup. Sort + filter +
// pagination handled via query params so the URL is shareable. The filtered
// / sorted variants canonicalise to the bare listing (release QA-1 #5).

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, BarChart3, Filter, Minus, Sparkles } from "lucide-react";
import { NavV2 } from "@/components/landing/nav-v2";
import { Footer } from "@/components/marketing/footer";
import { AbnBadge } from "@/components/verification/abn-badge";
import type { ListingSort, ListingsResult } from "@/lib/startup-index-listings";
import { cachedListings } from "@/lib/startup-index-cache";
import { isSampleBand } from "@/lib/startup-index-aggregator";
import { formatDelta } from "@/lib/startup-index-movers";
import { benchmarkBand } from "@/lib/benchmarks/publication-rules";
import { getMessagesSync, t } from "@/lib/i18n/t";
import { pageMetadata } from "@/lib/seo/page-meta";
import { FOCUS_RING } from "@/components/marketing/template/primitives";

export const metadata: Metadata = pageMetadata({
  title: "Startup Listings · Startup Value Index",
  description: "Ranked listing of every AU startup analysed by BlockID. Filter by sector, stage, revenue status — sort by SVI, weekly delta, valuation.",
  path: "/startup-index/listings",
});

export const dynamic = "force-dynamic";
export const revalidate = 300;

const CHIP = `inline-flex min-h-11 items-center rounded-full border px-3 text-xs font-medium transition-colors ${FOCUS_RING}`;
const CHIP_ON = "bg-action text-on-action border-action";
const CHIP_OFF = "bg-surface text-secondary border-line-subtle hover:border-line hover:bg-surface-hover";

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
  if (data.length < 2) return <span className="text-muted text-xs">—</span>;
  const min = Math.min(...data) - 1;
  const max = Math.max(...data) + 1;
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / range) * 100}`)
    .join(" ");
  const lastDelta = data[data.length - 1] - data[0];
  const color = lastDelta >= 0 ? "stroke-bull" : "stroke-bear";
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-20 h-6">
      <polyline points={points} fill="none" strokeWidth="2.5" className={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** G29-D: `delta` null = no prior close → "new" (never 0.0 / −99). */
function DeltaCell({ delta, newLabel, newTitle }: { delta: number | null; newLabel: string; newTitle: string }) {
  if (delta === null) {
    return (
      <span
        className="inline-flex items-center rounded border border-line-subtle bg-surface-sunken px-1 text-xs font-bold uppercase tracking-wider text-muted"
        title={newTitle}
        data-testid="delta-new"
      >
        {newLabel}
      </span>
    );
  }
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const cls = delta > 0 ? "text-bull" : delta < 0 ? "text-bear" : "text-muted";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold tabular-nums ${cls}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {formatDelta(delta)}
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

  // Fail-soft: if the aggregator throws (e.g. Supabase env missing at build
  // or transient DB error) we render an empty-listings state instead of a
  // 500. The page still serves the filter chrome so crawlers see something.
  let data: ListingsResult;
  try {
    data = await cachedListings({ filter, sort, order, page, pageSize: 50 });
  } catch (err) {
    console.error("[/index/listings] cachedListings failed:", err);
    data = {
      rows: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
      generatedAt: new Date().toISOString(),
    };
  }

  const msgs = getMessagesSync("en");
  const newLabel = t(msgs, "index.movers.new");
  const newTitle = t(msgs, "index.movers.new.title");
  // Same threshold as the index hero: below the basic benchmark band (n < 30) the table is a sample.
  const isSample = isSampleBand(benchmarkBand(data.total));

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
    return `/startup-index/listings?${next.toString()}`;
  }

  function sortHeader({ field, label, align = "left" }: { field: ListingSort; label: string; align?: "left" | "right" }) {
    const active = sort === field;
    const nextOrder = active && order === "desc" ? "asc" : "desc";
    return (
      <th aria-sort={active ? (order === "desc" ? "descending" : "ascending") : undefined} className={`px-2 text-xs uppercase tracking-wider font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
        <Link href={urlWith({ sort: field, order: nextOrder, page: 1 })} className={`inline-flex min-h-11 items-center rounded-md hover:text-action ${active ? "text-primary" : "text-muted"} ${FOCUS_RING}`}>
          {label}{active ? (order === "desc" ? " ↓" : " ↑") : ""}
        </Link>
      </th>
    );
  }

  return (
    <div className="min-h-svh bg-surface text-primary">
      <NavV2 />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-16">
        {/* Header */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-line-subtle bg-accent-soft px-3 py-1 mb-3">
            <Sparkles className="h-3 w-3 text-accent" />
            <span className="text-xs font-bold text-accent uppercase tracking-[0.15em]">Markets · Beta</span>
          </div>
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
                <BarChart3 className="h-7 w-7 text-action" />
                Startup Listings
              </h1>
              <p className="text-sm text-secondary mt-1">
                {data.total.toLocaleString()} AU startups analysed by BlockID — ranked by SVI score. Anonymous tickers protect founder identity unless they opt in.
              </p>
              {isSample ? (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-secondary" data-testid="index-sample-note">
                  <span className="inline-flex items-center rounded-full border border-line bg-accent-soft px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary" data-testid="index-sample-chip">
                    {t(msgs, "index.sample.chip")}
                  </span>
                  <span>{t(msgs, "index.sample.listings")}</span>
                </p>
              ) : null}
            </div>
            <Link href="/startup-index" className={`inline-flex min-h-11 items-center rounded-md text-sm text-action underline-offset-2 hover:underline ${FOCUS_RING}`}>← Back to Index</Link>
          </div>
        </div>

        {/* Filter bar */}
        <div className="rounded-xl border border-line-subtle bg-surface p-3 mb-4 flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted" />
          <span className="text-xs font-bold text-muted uppercase tracking-wider">Filter:</span>

          <div className="flex flex-wrap gap-1.5">
            <span className="self-center text-xs text-muted">Sector:</span>
            {SECTOR_OPTS.map((s) => (
              <Link
                key={s}
                href={urlWith({ sector: s, page: 1 })}
                className={`${CHIP} ${filter.sector === s ? CHIP_ON : CHIP_OFF}`}
              >
                {s === "all" ? "All" : s}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 ml-2">
            <span className="self-center text-xs text-muted">Stage:</span>
            {STAGE_OPTS.map((s) => (
              <Link
                key={s}
                href={urlWith({ stage: s, page: 1 })}
                className={`${CHIP} ${String(filter.stage) === s ? CHIP_ON : CHIP_OFF}`}
              >
                {s === "all" ? "All" : `S${s}`}
              </Link>
            ))}
          </div>

          <div className="flex gap-1.5 ml-2">
            <Link
              href={urlWith({ public_only: filter.publicOnly ? undefined : "true", page: 1 })}
              className={`${CHIP} ${filter.publicOnly ? CHIP_ON : CHIP_OFF}`}
            >
              Public only
            </Link>
            <Link
              href={urlWith({ revenue_only: filter.revenueOnly ? undefined : "true", page: 1 })}
              className={`${CHIP} ${filter.revenueOnly ? CHIP_ON : CHIP_OFF}`}
            >
              Revenue only
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-line-subtle bg-surface overflow-x-auto">
          {data.rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">
              No startups match the current filters.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle bg-surface-sunken">
                  <th className="py-2 px-2 text-xs uppercase tracking-wider font-semibold text-muted text-left">#</th>
                  <th className="py-2 px-2 text-xs uppercase tracking-wider font-semibold text-muted text-left">Ticker</th>
                  <th className="py-2 px-2 text-xs uppercase tracking-wider font-semibold text-muted text-left">Sector</th>
                  {sortHeader({ field: "stage", label: "Stage" })}
                  {sortHeader({ field: "svi", label: "SVI", align: "right" })}
                  {sortHeader({ field: "delta", label: "Δ 7d", align: "right" })}
                  {sortHeader({ field: "valuation", label: "Valuation", align: "right" })}
                  <th className="py-2 px-2 text-xs uppercase tracking-wider font-semibold text-muted text-right">Trend</th>
                  <th className="py-2 px-2 text-xs uppercase tracking-wider font-semibold text-muted text-right">Analyses</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={row.ticker + row.identityHash} className="border-b border-line-subtle last:border-0 hover:bg-surface-hover transition-colors">
                    <td className="h-11 py-2 px-2 text-xs text-muted tabular-nums">{(data.page - 1) * data.pageSize + i + 1}</td>
                    <td className="py-2 px-2">
                      <Link href={`/startup-index/listings/${row.ticker}`} className={`inline-flex min-h-11 items-center rounded-md text-xs font-mono font-bold text-action underline-offset-2 hover:underline ${FOCUS_RING}`}>
                        {row.ticker}
                      </Link>
                      {row.publicName && (
                        <span className="text-xs text-muted ml-1.5 truncate inline-block max-w-[120px] align-middle">{row.publicName}</span>
                      )}
                      {/* S36: "Verified ABN" (L2+) / "ABN not verified" from projects.verification_level */}
                      <AbnBadge level={row.verificationLevel} size="sm" className="ml-1.5 align-middle" />
                    </td>
                    <td className="py-2 px-2 text-xs text-secondary capitalize">{row.sectorLabel}</td>
                    <td className="py-2 px-2 text-xs text-primary">
                      <span className="inline-flex items-center gap-1">
                        <span className="text-xs font-bold text-muted">S{row.stage}</span>
                        {row.stageLabel}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-xs font-bold text-right tabular-nums text-primary">{row.svi}</td>
                    <td className="py-2 px-2 text-right"><DeltaCell delta={row.deltaWeek} newLabel={newLabel} newTitle={newTitle} /></td>
                    <td className="py-2 px-2 text-xs text-right font-mono tabular-nums text-primary">{fmtAud(row.valuationAud)}</td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex justify-end"><MiniSparkline data={row.sparkline} /></div>
                    </td>
                    <td className="py-2 px-2 text-xs text-right text-muted tabular-nums">{row.analysesCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {data.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-xs text-secondary">
            <span>Page {data.page} of {data.totalPages} · {data.total} total</span>
            <div className="flex gap-2">
              {data.page > 1 && <Link href={urlWith({ page: data.page - 1 })} className={`inline-flex min-h-11 items-center rounded-md text-action underline-offset-2 hover:underline ${FOCUS_RING}`}>← Prev</Link>}
              {data.page < data.totalPages && <Link href={urlWith({ page: data.page + 1 })} className={`inline-flex min-h-11 items-center rounded-md text-action underline-offset-2 hover:underline ${FOCUS_RING}`}>Next →</Link>}
            </div>
          </div>
        )}

        {/* Methodology */}
        <div className="mt-8 rounded-xl border border-line-subtle bg-surface p-5 text-xs text-secondary">
          <p className="font-bold text-primary mb-1 uppercase tracking-wider">Listing methodology</p>
          <p className="leading-relaxed">
            Every identity hash with at least one SVI analysis in the last 90 days is listed. Ticker = SECTOR-XXX where XXX is the last 3 of the latest analysis slug. The same identity always maps to the same anonymous hash but the ticker may shift sectors if their pitch evolves. Public names appear only when the founder explicitly opts in via{" "}
            <Link href="/workspace/settings/founder" className={`rounded-sm text-action underline-offset-2 hover:underline ${FOCUS_RING}`}>Founder Profile</Link>.
          </p>
          <p className="mt-2 font-mono bg-surface-sunken px-2 py-1 rounded text-xs break-all">
            BSI-AU Listings as of {data.generatedAt.slice(0, 10)}: {data.total} companies, sort={sort} {order}, filter={JSON.stringify(filter)}
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
