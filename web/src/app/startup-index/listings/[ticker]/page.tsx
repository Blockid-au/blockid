// /index/listings/[ticker] — per-startup detail page (T0230, v2.15).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Minus, Sparkles, TrendingUp } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { computeListingDetail } from "@/lib/startup-index-listings";

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface PageProps {
  params: Promise<{ ticker: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  return {
    title: `${ticker} · BlockID Startup Listing`,
    description: `Live SVI score, blended valuation, growth chart and Antler signals for ${ticker} on the BlockID Startup Value Index.`,
  };
}

function fmtAud(v: number): string {
  if (v >= 1_000_000_000) return `A$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(0)}K`;
  if (v <= 0) return "—";
  return `A$${Math.round(v).toLocaleString("en-AU")}`;
}

function HistoryChart({ data }: { data: Array<{ date: string; svi: number }> }) {
  if (data.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-ink-400 border border-dashed border-ink-200 rounded-xl">
        Only 1 analysis on record — chart needs ≥2 data points.
      </div>
    );
  }
  const min = Math.min(...data.map((d) => d.svi)) - 5;
  const max = Math.max(...data.map((d) => d.svi)) + 5;
  const range = max - min || 1;
  const points = data
    .map((d, i) => `${(i / (data.length - 1)) * 100},${100 - ((d.svi - min) / range) * 100}`)
    .join(" ");
  const areaPoints = `0,100 ${points} 100,100`;
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-48">
        <polygon points={areaPoints} fill="rgb(59 130 246 / 0.10)" />
        <polyline points={points} fill="none" stroke="rgb(59 130 246)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => (
          <circle
            key={i}
            cx={(i / (data.length - 1)) * 100}
            cy={100 - ((d.svi - min) / range) * 100}
            r="1.5"
            fill="rgb(37 99 235)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-ink-400 mt-2 uppercase tracking-wider">
        <span>{data[0].date}</span>
        <span>{data[data.length - 1].date}</span>
      </div>
    </div>
  );
}

function DeltaPill({ delta }: { delta: number }) {
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const cls = delta > 0
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : delta < 0
      ? "bg-rose-100 text-rose-700 border-rose-200"
      : "bg-ink-50 text-ink-500 border-ink-100";
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-bold px-2 py-0.5 rounded border ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {delta > 0 ? "+" : ""}{delta.toFixed(1)} 7d
    </span>
  );
}

export default async function TickerDetailPage({ params }: PageProps) {
  const { ticker } = await params;
  const detail = await computeListingDetail(ticker);
  if (!detail) notFound();

  const lastUpdatedRel = relativeTime(detail.lastAnalysisAt);

  return (
    <div className="min-h-svh bg-surface-50 text-ink-800">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-16">
        {/* Breadcrumb */}
        <div className="mb-4 text-xs text-ink-500">
          <Link href="/index" className="hover:text-brand-700">Index</Link>
          <span className="mx-1">/</span>
          <Link href="/index/listings" className="hover:text-brand-700">Listings</Link>
          <span className="mx-1">/</span>
          <span className="text-ink-700 font-mono">{detail.ticker}</span>
        </div>

        {/* Hero */}
        <section className="rounded-2xl border border-brand-200 bg-white p-6 sm:p-8 mb-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 mb-3">
                <Sparkles className="h-3 w-3 text-amber-600" />
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-[0.15em]">Beta · Live listing</span>
              </div>
              <h1 className="text-3xl font-bold font-mono text-ink-900 tracking-tight">{detail.ticker}</h1>
              {detail.publicName && (
                <p className="text-base text-ink-700 mt-1">{detail.publicName}</p>
              )}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-xs bg-brand-50 border border-brand-200 text-brand-700 px-2 py-0.5 rounded font-medium">{detail.sectorLabel}</span>
                <span className="text-xs bg-ink-50 border border-ink-200 text-ink-700 px-2 py-0.5 rounded">Stage {detail.stage} · {detail.stageLabel}</span>
                {detail.hasRevenue && <span className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded">Revenue-bearing</span>}
                {detail.inputSummaryProjectName && (
                  <span className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded">
                    {detail.inputSummaryProjectName}
                  </span>
                )}
              </div>
              {!detail.publicVisible && (
                <p className="text-[11px] text-ink-400 mt-2">
                  Founder hasn&apos;t opted in to display name publicly. <Link href="/workspace/founder-profile" className="text-brand-700 hover:underline">Opt in here</Link>.
                </p>
              )}
            </div>

            <div className="text-right">
              <p className="text-[10px] text-ink-500 uppercase tracking-wider font-medium">SVI</p>
              <p className="text-5xl font-bold text-ink-900 tabular-nums leading-none">{detail.svi}</p>
              <div className="mt-2"><DeltaPill delta={detail.deltaWeek} /></div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-brand-100">
            <div>
              <p className="text-[10px] text-ink-500 uppercase tracking-wider font-medium">Blended valuation</p>
              <p className="text-xl font-bold text-ink-900 tabular-nums">{fmtAud(detail.valuationAud)}</p>
            </div>
            <div>
              <p className="text-[10px] text-ink-500 uppercase tracking-wider font-medium">Analyses on record</p>
              <p className="text-xl font-bold text-ink-900 tabular-nums">{detail.analysesCount}</p>
            </div>
            <div>
              <p className="text-[10px] text-ink-500 uppercase tracking-wider font-medium">Last analysis</p>
              <p className="text-base font-bold text-ink-900">{lastUpdatedRel}</p>
            </div>
            <div>
              <p className="text-[10px] text-ink-500 uppercase tracking-wider font-medium">Public share page</p>
              <Link href={`/s/${detail.slug}`} className="inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:underline">
                Open <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </section>

        {/* SVI history chart */}
        <section className="mb-6">
          <h2 className="text-lg font-bold text-ink-900 mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-brand-600" />
            SVI history
          </h2>
          <HistoryChart data={detail.sviHistory} />
        </section>

        {/* Antler signals */}
        {detail.antlerSignals && detail.antlerSignals.length > 0 && (
          <section className="rounded-2xl border border-ink-200 bg-white p-5 mb-6">
            <h2 className="text-sm font-bold text-ink-900 uppercase tracking-wider mb-3">Antler signals (latest)</h2>
            <div className="space-y-2">
              {detail.antlerSignals.map((s) => {
                const cls = s.score >= 70 ? "bg-emerald-500" : s.score >= 45 ? "bg-blue-500" : "bg-amber-500";
                return (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-ink-700 w-32">{s.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-ink-100 overflow-hidden">
                      <div className={`h-full ${cls}`} style={{ width: `${s.score}%` }} />
                    </div>
                    <span className="text-xs font-bold text-ink-900 w-10 text-right tabular-nums">{s.score}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Accelerator readiness */}
        {detail.acceleratorReadiness && (
          <section className="rounded-2xl border border-ink-200 bg-white p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-ink-900 uppercase tracking-wider">Accelerator readiness</h2>
              <span className="text-2xl font-bold text-brand-700 tabular-nums">{detail.acceleratorReadiness.overallPct}%</span>
            </div>
            {detail.acceleratorReadiness.topGaps.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-1">Top 3 gaps to close</p>
                <ul className="space-y-1">
                  {detail.acceleratorReadiness.topGaps.map((g, i) => (
                    <li key={i} className="text-xs text-ink-700 flex items-start gap-2">
                      <span className="text-amber-600 mt-0.5">○</span>
                      <span><strong>{g.criterion}</strong> <span className="text-ink-500">· {g.source}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Valuation perspectives */}
        {detail.perspectives && detail.perspectives.length > 0 && (
          <section className="rounded-2xl border border-ink-200 bg-white p-5 mb-6">
            <h2 className="text-sm font-bold text-ink-900 uppercase tracking-wider mb-3">Valuation — 4 lens triangulation</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100">
                  <th className="py-1 text-left text-[10px] uppercase tracking-wider font-semibold text-ink-400">Lens</th>
                  <th className="py-1 text-right text-[10px] uppercase tracking-wider font-semibold text-ink-400">Low</th>
                  <th className="py-1 text-right text-[10px] uppercase tracking-wider font-semibold text-ink-400">Mid</th>
                  <th className="py-1 text-right text-[10px] uppercase tracking-wider font-semibold text-ink-400">High</th>
                  <th className="py-1 text-right text-[10px] uppercase tracking-wider font-semibold text-ink-400">Weight</th>
                </tr>
              </thead>
              <tbody>
                {detail.perspectives.map((p, i) => (
                  <tr key={i} className="border-b border-ink-50 last:border-0">
                    <td className="py-1.5 text-xs text-ink-700">{p.label}</td>
                    <td className="py-1.5 text-xs text-right font-mono tabular-nums">{fmtAud(p.lowAud)}</td>
                    <td className="py-1.5 text-xs font-bold text-right font-mono tabular-nums">{fmtAud(p.midAud)}</td>
                    <td className="py-1.5 text-xs text-right font-mono tabular-nums">{fmtAud(p.highAud)}</td>
                    <td className="py-1.5 text-xs text-right tabular-nums text-ink-500">{Math.round(p.weight * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* CTA */}
        <section className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-600 to-amber-600 text-white p-6 text-center">
          <h2 className="text-xl font-bold mb-2">Want your startup on this index?</h2>
          <p className="text-sm opacity-90 mb-4">A fresh SVI analysis updates your ticker in real time.</p>
          <Link href="/score" className="inline-block bg-white text-brand-700 px-5 py-2 rounded-xl font-bold text-sm hover:bg-amber-50 transition-colors">
            Get my SVI score
          </Link>
        </section>

        {/* Methodology + JSON link */}
        <p className="text-[11px] text-ink-400 mt-6 text-center">
          Data refreshes every 5 minutes &middot; <Link href={`/api/index/listing/${detail.ticker}`} className="text-brand-600 hover:underline font-mono">JSON</Link> &middot; Methodology: median SVI of all analyses in last 90 days · Anonymous-by-default
        </p>
      </main>

      <Footer />
    </div>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
