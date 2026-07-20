// /dataset — public marketing surface for the SVI Index dataset (CDO).
//
// Server component. Fetches aggregates directly through the helper (no HTTP
// round-trip) and renders them into simple, indexable tables. This is the
// human-readable half of the "S&P 500 for Australian startups" dataset
// moat — the JSON/CSV API at /api/index/svi is the machine-readable half.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database, Download, Info, ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import {
  getOverallAggregates,
  getSectorAggregates,
  getStageAggregates,
  type OverallRow,
  type SectorRow,
  type StageRow,
} from "@/lib/svi-index-aggregates";

const TITLE = "SVI Index — Public Dataset of Australian Startup Valuations | BlockID";
const DESCRIPTION =
  "Free, anonymised dataset of Australian startup valuations from the BlockID Startup Value Index. Percentiles by sector and stage, JSON + CSV downloads, no signup.";
const CANONICAL = "https://blockid.au/dataset";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "australian startup dataset",
    "startup valuation dataset australia",
    "SVI index dataset",
    "australian startup benchmarks CSV",
    "open startup data australia",
    "startup index dataset download",
  ],
  robots: { index: true, follow: true },
  alternates: {
    canonical: CANONICAL,
    types: {
      "application/json": "/api/index/svi?bucket=overall",
    },
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: CANONICAL,
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 300;

const STAGE_LABELS: Record<number, string> = {
  0: "Idea",
  1: "Pre-seed",
  2: "Seed",
  3: "Series A",
  4: "Series B",
  5: "Series C",
  6: "Growth",
  7: "Pre-IPO / Late",
};

function fmtNum(n: number): string {
  return n.toLocaleString("en-AU", { maximumFractionDigits: 1 });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "—";
  return d.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function DatasetPage() {
  const [overall, sectors, stages] = await Promise.all([
    getOverallAggregates(),
    getSectorAggregates(),
    getStageAggregates(),
  ]);

  return (
    <div className="min-h-screen bg-white text-ink-900">
      <Navbar />

      <main>
        <Hero overall={overall} />
        <OverallSection overall={overall} />
        <SectorSection rows={sectors} />
        <StageSection rows={stages} />
        <MethodologySection />
        <ApiSection />
        <DisclaimerSection />
      </main>

      <Footer />
    </div>
  );
}

// ─── Sections ──────────────────────────────────────────────────────────

function Hero({ overall }: { overall: OverallRow }) {
  return (
    <section className="border-b border-ink-100 bg-gradient-to-br from-brand-50 via-white to-emerald-50">
      <div className="max-w-6xl mx-auto px-6 py-16 sm:py-20">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1 text-xs font-semibold text-brand-700">
          <Database className="h-3.5 w-3.5" />
          Open dataset · No signup · CC BY 4.0 attribution
        </div>
        <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight">
          The Startup Value Index — Public Dataset
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-ink-600">
          Anonymised, aggregate valuation statistics from Australian startups
          running the SVI on blockid.au. Percentiles by sector and stage. Free
          to download as JSON or CSV. Zero personally identifiable information.
        </p>
        <dl className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Startups indexed" value={fmtNum(overall.count)} />
          <Stat label="Median SVI" value={fmtNum(overall.medianSvi)} />
          <Stat label="Sectors" value="see table" />
          <Stat label="Last updated" value={fmtDate(overall.updatedAt)} />
        </dl>
        <div className="mt-8 flex flex-wrap gap-3">
          <DownloadLink bucket="overall" label="Overall CSV" />
          <DownloadLink bucket="sector" label="By sector CSV" />
          <DownloadLink bucket="stage" label="By stage CSV" />
          <Link
            href="/api/index/svi?bucket=overall"
            className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
          >
            <ArrowRight className="h-4 w-4" />
            JSON API
          </Link>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-white/80 px-4 py-3 shadow-sm">
      <dt className="text-xs uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 text-2xl font-bold text-ink-900">{value}</dd>
    </div>
  );
}

function DownloadLink({
  bucket,
  label,
}: {
  bucket: "overall" | "sector" | "stage";
  label: string;
}) {
  return (
    <a
      href={`/api/index/svi?bucket=${bucket}&format=csv`}
      className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
      download
    >
      <Download className="h-4 w-4" />
      {label}
    </a>
  );
}

function OverallSection({ overall }: { overall: OverallRow }) {
  const percentileRows: Array<{ label: string; value: number }> = [
    { label: "P10 (bottom decile)", value: overall.p10 },
    { label: "P25 (lower quartile)", value: overall.p25 },
    { label: "P50 (median)", value: overall.p50 },
    { label: "P75 (upper quartile)", value: overall.p75 },
    { label: "P90 (top decile)", value: overall.p90 },
    { label: "Mean", value: overall.mean },
  ];
  return (
    <section className="border-b border-ink-100 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold">Overall percentiles</h2>
        <p className="mt-2 text-ink-600">
          Distribution of the SVI score across the full Australian cohort.
        </p>
        <div className="mt-6 overflow-x-auto rounded-lg border border-ink-200">
          <table className="min-w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Statistic</th>
                <th className="px-4 py-3 text-right">SVI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {percentileRows.map((r) => (
                <tr key={r.label}>
                  <td className="px-4 py-3 font-medium text-ink-800">{r.label}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtNum(r.value)}</td>
                </tr>
              ))}
              <tr className="bg-ink-50/50">
                <td className="px-4 py-3 font-semibold text-ink-900">Sample size</td>
                <td className="px-4 py-3 text-right font-mono">{fmtNum(overall.count)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SectorSection({ rows }: { rows: SectorRow[] }) {
  return (
    <section className="border-b border-ink-100 bg-ink-50/40">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold">By sector</h2>
            <p className="mt-2 text-ink-600">
              Cohorts of fewer than 5 startups are suppressed to protect
              anonymity (k-anonymity ≥ 5).
            </p>
          </div>
          <DownloadLink bucket="sector" label="CSV" />
        </div>
        <div className="mt-6 overflow-x-auto rounded-lg border border-ink-200 bg-white">
          {rows.length === 0 ? (
            <EmptyState message="Not enough sector-tagged snapshots yet — check back once the index grows." />
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3">Sector</th>
                  <th className="px-4 py-3 text-right">n</th>
                  <th className="px-4 py-3 text-right">Median SVI</th>
                  <th className="px-4 py-3 text-right">P25</th>
                  <th className="px-4 py-3 text-right">P75</th>
                  <th className="px-4 py-3 text-right">Median stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r) => (
                  <tr key={r.sector}>
                    <td className="px-4 py-3 font-medium text-ink-800">
                      {titleCase(r.sector)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmtNum(r.count)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtNum(r.medianSvi)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtNum(r.p25)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtNum(r.p75)}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {STAGE_LABELS[r.medianStage] ?? r.medianStage}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

function StageSection({ rows }: { rows: StageRow[] }) {
  return (
    <section className="border-b border-ink-100 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold">By stage</h2>
            <p className="mt-2 text-ink-600">
              Stage buckets follow the SVI 0–7 lifecycle (Idea → Pre-IPO).
            </p>
          </div>
          <DownloadLink bucket="stage" label="CSV" />
        </div>
        <div className="mt-6 overflow-x-auto rounded-lg border border-ink-200">
          {rows.length === 0 ? (
            <EmptyState message="Not enough stage-tagged snapshots yet — check back once the index grows." />
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3 text-right">n</th>
                  <th className="px-4 py-3 text-right">Median SVI</th>
                  <th className="px-4 py-3 text-right">P25</th>
                  <th className="px-4 py-3 text-right">P75</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r) => (
                  <tr key={r.stage}>
                    <td className="px-4 py-3 font-medium text-ink-800">
                      {STAGE_LABELS[r.stage] ?? `Stage ${r.stage}`}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmtNum(r.count)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtNum(r.medianSvi)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtNum(r.p25)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtNum(r.p75)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

function MethodologySection() {
  return (
    <section className="border-b border-ink-100 bg-ink-50/40">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="inline-flex items-center gap-2 text-brand-700">
          <Info className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">Methodology</span>
        </div>
        <h2 className="mt-2 text-2xl font-bold">How the dataset is built</h2>
        <div className="mt-4 space-y-4 text-ink-700">
          <p>
            Every SVI analysis run on blockid.au appends one anonymised row to
            <code className="mx-1 rounded bg-ink-100 px-1.5 py-0.5 text-sm">svi_index_snapshots</code>
            — the aggregate score, the sector, the stage, the state, and coarse
            operating metrics (runway months, burn rate). No company name, no
            founder identifier, no email address, and no free-text describing
            the business is written to this table, and none of it is exposed by
            this dataset or API.
          </p>
          <p>
            Aggregates on this page and the JSON API are computed from
            snapshots created in the last 18 months. Percentiles are computed
            with a linear-interpolation estimator equivalent to Postgres&apos;
            <code className="mx-1 rounded bg-ink-100 px-1.5 py-0.5 text-sm">percentile_cont</code>.
            Any bucket with fewer than 5 startups is suppressed so no cohort in
            the released data represents a re-identifiable group (k-anonymity
            ≥ 5).
          </p>
          <p>
            The SVI score is unbounded and Nikkei-styled — higher is better
            but there is no fixed ceiling. Compare within a stage bucket for
            an apples-to-apples read. The dataset is refreshed at least every
            5 minutes; the &quot;last updated&quot; date reflects the most
            recent snapshot in the window.
          </p>
        </div>
      </div>
    </section>
  );
}

function ApiSection() {
  return (
    <section className="border-b border-ink-100 bg-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold">JSON API</h2>
        <p className="mt-2 text-ink-600">
          Same data, machine-readable. Cache headers set for 5-minute edge
          caching. Attribute &ldquo;BlockID Startup Value Index&rdquo; when
          you republish.
        </p>
        <div className="mt-4 space-y-2 text-sm">
          <ApiRow href="/api/index/svi?bucket=overall" label="Overall percentiles" />
          <ApiRow href="/api/index/svi?bucket=sector" label="Per-sector aggregates" />
          <ApiRow href="/api/index/svi?bucket=stage" label="Per-stage aggregates" />
          <ApiRow
            href="/api/index/svi?bucket=sector&format=csv"
            label="Per-sector aggregates (CSV)"
          />
        </div>
      </div>
    </section>
  );
}

function ApiRow({ href, label }: { href: string; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-ink-100 bg-ink-50/50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-ink-700">{label}</div>
        <code className="block text-xs sm:text-sm text-ink-800 truncate">{href}</code>
      </div>
      <Link
        href={href}
        className="ml-3 inline-flex items-center gap-1 text-brand-700 hover:text-brand-800 text-xs font-semibold"
      >
        Open <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function DisclaimerSection() {
  return (
    <section className="bg-ink-50 border-t border-ink-100">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-ink-500" />
          <div className="text-xs text-ink-600 leading-relaxed">
            <p className="font-semibold text-ink-800">General information only</p>
            <p className="mt-1">
              This dataset is provided for informational and research purposes.
              Nothing on this page or in the API constitutes financial,
              investment, tax, or legal advice. Blockid.au is operated by
              Auschain Pty Ltd (ACN 659 615 111, Sydney NSW). Auschain Pty Ltd
              does not hold an Australian Financial Services Licence and does
              not provide personal financial advice. Consult a licensed
              professional before making investment decisions.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-6 py-10 text-center text-sm text-ink-500">{message}</div>
  );
}
