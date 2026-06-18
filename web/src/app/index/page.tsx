// /index — Startup Value Index Exchange (T0228, v2.14).
//
// Public-facing brand surface at startupvalueindex.com (proxied via nginx since
// v2.4 / T0212). Investing.com aesthetic: hero index, sector heatmap, top
// movers, stage indices, live counters, methodology, big CTA.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Clock, Minus, Sparkles, Zap } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { computeIndexHeadlines } from "@/lib/startup-index-aggregator";

export const metadata: Metadata = {
  title: "BlockID Startup Value Index — Real-time Australian Startup Valuations",
  description: "The BSI-AU index, sector heatmap, top movers, and stage indices — the live exchange view of Australian startup valuations.",
  openGraph: {
    title: "BlockID Startup Value Index™",
    description: "The live exchange view of Australian startup valuations. BSI-AU, sector heatmap, top movers.",
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 300;

// ─── Helpers ────────────────────────────────────────────────────────────

function fmtAud(v: number): string {
  if (v >= 1_000_000_000) return `A$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(0)}K`;
  return `A$${Math.round(v).toLocaleString("en-AU")}`;
}

function deltaColor(delta: number): string {
  if (delta > 0) return "text-emerald-600";
  if (delta < 0) return "text-rose-600";
  return "text-ink-400";
}

function deltaBg(delta: number): string {
  if (delta > 2) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (delta > 0) return "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (delta < -2) return "bg-rose-100 text-rose-700 border-rose-200";
  if (delta < 0) return "bg-rose-50 text-rose-700 border-rose-100";
  return "bg-ink-50 text-ink-500 border-ink-100";
}

function deltaHeatBg(delta: number): string {
  if (delta > 5) return "bg-emerald-500/90 text-white";
  if (delta > 2) return "bg-emerald-400/80 text-white";
  if (delta > 0) return "bg-emerald-200 text-emerald-900";
  if (delta < -5) return "bg-rose-500/90 text-white";
  if (delta < -2) return "bg-rose-400/80 text-white";
  if (delta < 0) return "bg-rose-200 text-rose-900";
  return "bg-ink-100 text-ink-700";
}

function Sparkline({ data, color = "stroke-brand-600" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data) - 1;
  const max = Math.max(...data) + 1;
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / range) * 100}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-12">
      <polyline points={points} fill="none" strokeWidth="2.5" className={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DeltaPill({ delta, suffix = "" }: { delta: number; suffix?: string }) {
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded border ${deltaBg(delta)}`}>
      <Icon className="h-3 w-3" />
      {delta > 0 ? "+" : ""}{delta.toFixed(1)}{suffix}
    </span>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export default async function IndexExchangePage() {
  const data = await computeIndexHeadlines(90);
  const updatedAt = new Date(data.generatedAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

  return (
    <div className="min-h-svh bg-surface-50 text-ink-800">
      <PageViewTracker event="index_viewed" params={{}} />
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-16">
        {/* ── HERO — BSI-AU index banner ─────────────────────────────── */}
        <section className="rounded-2xl border border-brand-200 bg-gradient-to-br from-white via-brand-50/40 to-amber-50/40 p-6 sm:p-8 mb-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 mb-3">
                <Sparkles className="h-3 w-3 text-amber-600" />
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-[0.15em]">BlockID Startup Value Index™ &middot; Beta</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink-900">
                BSI-AU
              </h1>
              <p className="text-sm text-ink-600 mt-1">
                Australian startup market index — median SVI across {data.bsiAu.totalCompanies.toLocaleString()} companies tracked
              </p>
            </div>

            <div className="text-right">
              <p className="text-5xl sm:text-6xl font-bold text-ink-900 tabular-nums leading-none">
                {data.bsiAu.value}
              </p>
              <div className="flex items-center justify-end gap-2 mt-2">
                <DeltaPill delta={data.bsiAu.deltaDay} suffix=" 1d" />
                <DeltaPill delta={data.bsiAu.deltaWeek} suffix=" 7d" />
              </div>
            </div>
          </div>

          {/* Sparkline */}
          <div className="mt-6">
            <Sparkline data={data.bsiAu.sparkline7d} />
            <div className="flex justify-between text-[10px] text-ink-400 mt-1 uppercase tracking-wider">
              <span>7 days ago</span>
              <span>Today</span>
            </div>
          </div>

          {/* Stat row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-brand-100">
            <div>
              <p className="text-[10px] text-ink-500 uppercase tracking-wider font-medium">Companies</p>
              <p className="text-xl font-bold text-ink-900 tabular-nums">{data.bsiAu.totalCompanies.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-ink-500 uppercase tracking-wider font-medium">Coverage</p>
              <p className="text-xl font-bold text-ink-900 tabular-nums">{fmtAud(data.bsiAu.totalCoverageAud)}</p>
            </div>
            <div>
              <p className="text-[10px] text-ink-500 uppercase tracking-wider font-medium">Analyses today</p>
              <p className="text-xl font-bold text-emerald-600 tabular-nums">{data.bsiAu.analysesToday}</p>
            </div>
            <div>
              <p className="text-[10px] text-ink-500 uppercase tracking-wider font-medium">vs yesterday</p>
              <p className="text-xl font-bold text-ink-900 tabular-nums">{data.bsiAu.analysesYesterday}</p>
            </div>
          </div>

          {/* View all listings CTA */}
          <div className="mt-5 pt-5 border-t border-brand-100 text-center">
            <Link
              href="/index/listings"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 hover:text-brand-800 hover:underline"
            >
              Browse all {data.bsiAu.totalCompanies.toLocaleString()} listings →
            </Link>
          </div>
        </section>

        {/* ── SECTOR HEATMAP ─────────────────────────────────────────── */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-ink-900 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-brand-600" />
              Sector heatmap
            </h2>
            <p className="text-xs text-ink-500">Colour = 7-day delta</p>
          </div>
          {data.sectorIndices.length === 0 ? (
            <div className="rounded-xl border border-ink-200 bg-white p-8 text-center text-sm text-ink-400">
              Not enough sector data yet. Run an SVI analysis to start populating the heatmap.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {data.sectorIndices.map((s) => (
                <div key={s.sector} className={`rounded-xl p-3 text-center transition-transform hover:scale-105 ${deltaHeatBg(s.deltaWeek)}`}>
                  <p className="text-base">{s.emoji}</p>
                  <p className="text-[11px] font-bold uppercase tracking-wider mt-1 truncate">{s.label}</p>
                  <p className="text-2xl font-bold mt-1 tabular-nums">{s.value}</p>
                  <p className="text-[10px] opacity-90 mt-0.5 tabular-nums">
                    {s.deltaWeek > 0 ? "+" : ""}{s.deltaWeek.toFixed(1)} &middot; n={s.count}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── TOP MOVERS ─────────────────────────────────────────────── */}
        <section className="grid lg:grid-cols-2 gap-4 mb-6">
          {/* Winners */}
          <div className="rounded-2xl border border-emerald-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-3">
              <ArrowUpRight className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-ink-900 uppercase tracking-wider">Top winners (7d)</h2>
            </div>
            {data.topMovers.winners.length === 0 ? (
              <p className="text-xs text-ink-400 py-4 text-center">Need multiple analyses per company for week-over-week comparison.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-emerald-100">
                    <th className="text-left py-1 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Ticker</th>
                    <th className="text-left py-1 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Sector</th>
                    <th className="text-right py-1 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">SVI</th>
                    <th className="text-right py-1 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Δ 7d</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topMovers.winners.map((m) => (
                    <tr key={m.ticker} className="border-b border-emerald-50/60 last:border-0">
                      <td className="py-1.5">
                        <Link href={`/s/${m.slug}`} className="font-mono text-xs text-brand-700 hover:underline">{m.ticker}</Link>
                      </td>
                      <td className="py-1.5 text-xs text-ink-600 capitalize">{m.sector}</td>
                      <td className="py-1.5 text-xs text-right font-mono">{m.svi}</td>
                      <td className="py-1.5 text-right">
                        <span className="text-xs font-bold text-emerald-600 tabular-nums">+{m.deltaWeek}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Losers */}
          <div className="rounded-2xl border border-rose-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-3">
              <ArrowDownRight className="h-4 w-4 text-rose-600" />
              <h2 className="text-sm font-bold text-ink-900 uppercase tracking-wider">Biggest drops (7d)</h2>
            </div>
            {data.topMovers.losers.length === 0 ? (
              <p className="text-xs text-ink-400 py-4 text-center">No companies with material weekly drops detected.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rose-100">
                    <th className="text-left py-1 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Ticker</th>
                    <th className="text-left py-1 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Sector</th>
                    <th className="text-right py-1 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">SVI</th>
                    <th className="text-right py-1 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Δ 7d</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topMovers.losers.map((m) => (
                    <tr key={m.ticker} className="border-b border-rose-50/60 last:border-0">
                      <td className="py-1.5">
                        <Link href={`/s/${m.slug}`} className="font-mono text-xs text-brand-700 hover:underline">{m.ticker}</Link>
                      </td>
                      <td className="py-1.5 text-xs text-ink-600 capitalize">{m.sector}</td>
                      <td className="py-1.5 text-xs text-right font-mono">{m.svi}</td>
                      <td className="py-1.5 text-right">
                        <span className={`text-xs font-bold tabular-nums ${deltaColor(m.deltaWeek)}`}>{m.deltaWeek}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* ── STAGE INDICES ─────────────────────────────────────────── */}
        <section className="rounded-2xl border border-ink-200 bg-white p-5 mb-6">
          <h2 className="text-sm font-bold text-ink-900 uppercase tracking-wider mb-3">Stage indices</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {data.stageIndices.map((st) => (
              <div key={st.stage} className="rounded-lg border border-ink-100 bg-ink-50/40 p-2.5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Stage {st.stage}</p>
                <p className="text-xs text-ink-700 truncate">{st.label}</p>
                <p className="text-xl font-bold text-ink-900 mt-1 tabular-nums">{st.value}</p>
                <p className="text-[10px] text-ink-400 tabular-nums">n={st.count}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ────────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-600 to-amber-600 text-white p-8 mb-6 text-center shadow-md">
          <Zap className="h-8 w-8 mx-auto mb-3 opacity-90" />
          <h2 className="text-2xl font-bold mb-2">Where does your startup sit on the index?</h2>
          <p className="text-sm opacity-90 mb-5 max-w-xl mx-auto">
            Get a free SVI analysis in under 60 seconds. AI-powered evaluation against {data.bsiAu.totalCompanies} AU companies + 30 accelerator criteria.
          </p>
          <Link href="/score" className="inline-flex items-center gap-1.5 bg-white text-brand-700 px-6 py-3 rounded-xl font-bold text-sm hover:bg-amber-50 transition-colors">
            Get my SVI score
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        {/* ── METHODOLOGY + CITATION ───────────────────────────────── */}
        <section className="rounded-2xl border border-ink-200 bg-white p-5 mb-6">
          <h2 className="text-sm font-bold text-ink-900 uppercase tracking-wider mb-3">Methodology &amp; citation</h2>
          <div className="grid sm:grid-cols-2 gap-4 text-xs text-ink-600 leading-relaxed">
            <div>
              <p className="font-bold text-ink-700 mb-1">How BSI-AU is computed</p>
              <p>Median SVI score across every analysis run in the last 90 days. Each identity (hashed email) contributes only their most recent score.</p>
            </div>
            <div>
              <p className="font-bold text-ink-700 mb-1">Sector + stage indices</p>
              <p>Same median computation, bucketed by sector / stage detected by the SVI engine. Sectors with fewer than 1 entry are hidden until they accumulate enough cohort size.</p>
            </div>
            <div>
              <p className="font-bold text-ink-700 mb-1">Top movers</p>
              <p>Per identity hash, compares latest analysis vs the most recent analysis older than 7 days. Movements smaller than ±1 SVI are excluded as noise.</p>
            </div>
            <div>
              <p className="font-bold text-ink-700 mb-1">Citation</p>
              <p className="font-mono bg-ink-50 px-2 py-1 rounded text-[11px] mt-1">{data.citation}</p>
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between text-xs text-ink-400">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> Updated {updatedAt} UTC &middot; refreshes every 5 minutes
          </span>
          <Link href="/api/index/headlines" className="text-brand-700 hover:underline font-mono">/api/index/headlines (JSON)</Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
