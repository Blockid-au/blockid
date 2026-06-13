"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, TrendingUp, Users, DollarSign, Zap } from "lucide-react";
import { BENCHMARKS, SVI_STAGE_BENCHMARKS, type StageBenchmarks } from "@/lib/benchmarks";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "pre-seed", label: "Pre-Seed", color: "bg-violet-100 text-violet-700 border-violet-200" },
  { key: "seed", label: "Seed", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { key: "series-a", label: "Series A", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { key: "series-b", label: "Series B+", color: "bg-amber-100 text-amber-700 border-amber-200" },
];

const METRIC_GROUPS = [
  {
    icon: DollarSign,
    label: "Revenue",
    color: "text-emerald-600",
    metrics: [
      { key: "mrr_aud", label: "Monthly Recurring Revenue", format: "aud", invert: false },
      { key: "arr_aud", label: "Annual Recurring Revenue", format: "aud", invert: false },
      { key: "revenue_growth_pct", label: "Revenue Growth", format: "pct", invert: false },
    ],
  },
  {
    icon: Users,
    label: "Users",
    color: "text-blue-600",
    metrics: [
      { key: "mau", label: "Monthly Active Users", format: "number", invert: false },
      { key: "dau", label: "Daily Active Users", format: "number", invert: false },
      { key: "monthly_churn_pct", label: "Monthly Churn", format: "pct", invert: true },
      { key: "nrr_pct", label: "Net Revenue Retention", format: "pct", invert: false },
    ],
  },
  {
    icon: TrendingUp,
    label: "Unit Economics",
    color: "text-amber-600",
    metrics: [
      { key: "cac_aud", label: "Customer Acquisition Cost", format: "aud", invert: true },
      { key: "ltv_aud", label: "Customer Lifetime Value", format: "aud", invert: false },
    ],
  },
  {
    icon: Zap,
    label: "Runway",
    color: "text-rose-600",
    metrics: [
      { key: "burn_rate_aud", label: "Monthly Burn Rate", format: "aud", invert: true },
      { key: "runway_months", label: "Runway", format: "months", invert: false },
    ],
  },
];

function fmt(value: number, format: string): string {
  if (format === "aud") {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value}`;
  }
  if (format === "pct") return `${value}%`;
  if (format === "months") return `${value}mo`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

interface MetricBarProps {
  label: string;
  p25: number;
  p50: number;
  p75: number;
  format: string;
  invert: boolean;
}

function MetricBar({ label, p25, p50, p75, format, invert }: MetricBarProps) {
  const good = invert ? p75 : p75;
  const badLabel = invert ? "Higher is worse" : "Lower is worse";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink-700">{label}</span>
        <span className="text-[10px] text-ink-400">{invert ? "↓ lower is better" : "↑ higher is better"}</span>
      </div>
      {/* Percentile bar */}
      <div className="relative h-6 rounded-lg bg-surface-100 overflow-hidden">
        {/* p25 block */}
        <div
          className="absolute top-0 left-0 h-full bg-red-200"
          style={{ width: "25%" }}
        />
        {/* p25-p50 block */}
        <div
          className="absolute top-0 h-full bg-amber-200"
          style={{ left: "25%", width: "25%" }}
        />
        {/* p50-p75 block */}
        <div
          className="absolute top-0 h-full bg-emerald-200"
          style={{ left: "50%", width: "25%" }}
        />
        {/* p75+ block */}
        <div
          className="absolute top-0 h-full bg-emerald-300"
          style={{ left: "75%", width: "25%" }}
        />
        {/* Labels */}
        <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-semibold text-ink-600">
          <span>p25: {fmt(p25, format)}</span>
          <span>p50: {fmt(p50, format)}</span>
          <span>p75: {fmt(p75, format)}</span>
        </div>
      </div>
      <p className="text-[10px] text-ink-400">
        {badLabel} · p25 = bottom quartile · p75 = top quartile
      </p>
    </div>
  );
}

export function BenchmarksWall() {
  const [activeStage, setActiveStage] = React.useState("seed");
  const benchmarks = BENCHMARKS[activeStage] as StageBenchmarks;
  const sviBenchmark = SVI_STAGE_BENCHMARKS.find((s) => {
    const stageMap: Record<string, string> = {
      "pre-seed": "Idea",
      seed: "Launched",
      "series-a": "Revenue",
      "series-b": "Revenue",
    };
    return s.label === (stageMap[activeStage] ?? "Launched");
  }) ?? SVI_STAGE_BENCHMARKS[3];

  return (
    <div className="space-y-10">
      {/* Stage Selector */}
      <div className="flex flex-wrap gap-2">
        {STAGES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setActiveStage(s.key)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-semibold transition-all cursor-pointer",
              activeStage === s.key
                ? s.color + " shadow-sm"
                : "border-surface-200 bg-white text-ink-500 hover:border-surface-300"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* SVI Benchmark card */}
      <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-6">
        <p className="text-xs uppercase tracking-[0.15em] font-semibold text-brand-600 mb-1">
          SVI Score Benchmarks — {STAGES.find((s) => s.key === activeStage)?.label}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          {[
            { label: "Bottom 25%", value: sviBenchmark.p25, color: "text-red-600" },
            { label: "Median", value: sviBenchmark.medianSVI, color: "text-amber-600" },
            { label: "Top 25%", value: sviBenchmark.p75, color: "text-emerald-600" },
            { label: "Top 10%", value: sviBenchmark.topDecile, color: "text-brand-600" },
          ].map((b) => (
            <div key={b.label} className="text-center">
              <p className={cn("text-2xl font-bold tabular-nums", b.color)}>{b.value}</p>
              <p className="text-xs text-ink-500 mt-0.5">{b.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-brand-200">
          <p className="text-xs text-brand-700">
            Avg SVI for {STAGES.find((s) => s.key === activeStage)?.label} stage:{" "}
            <strong>{sviBenchmark.avgSVI}</strong> · Where do you stand?
          </p>
        </div>
      </div>

      {/* Metric Groups */}
      {METRIC_GROUPS.map((group) => {
        const Icon = group.icon;
        return (
          <div key={group.label}>
            <div className="flex items-center gap-2 mb-5">
              <Icon strokeWidth={1.75} className={cn("h-5 w-5", group.color)} />
              <h2 className="text-lg font-semibold text-ink-800">{group.label}</h2>
            </div>
            <div className="space-y-6">
              {group.metrics.map((m) => {
                const band = benchmarks[m.key as keyof StageBenchmarks];
                if (!band) return null;
                return (
                  <MetricBar
                    key={m.key}
                    label={m.label}
                    p25={band.p25}
                    p50={band.p50}
                    p75={band.p75}
                    format={m.format}
                    invert={m.invert}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Industry Distribution callout */}
      <div className="rounded-2xl bg-ink-950 text-white p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-brand-400 font-semibold mb-2">
          Data Source
        </p>
        <h3 className="text-xl font-semibold mb-3">AU Startup Ecosystem Benchmarks</h3>
        <p className="text-sm text-slate-400 leading-relaxed mb-6">
          Benchmark data compiled from Startup Genome, ABS, AVCAL, Cut Through Venture, and
          publicly available AU accelerator cohort data. Covers 2,700+ active Australian
          startups across SaaS, fintech, medtech, and marketplace verticals.
        </p>
        <div className="grid sm:grid-cols-3 gap-4 mb-6 text-center">
          {[
            { stat: "2,700+", label: "AU startups tracked" },
            { stat: "4 stages", label: "Pre-seed → Series B+" },
            { stat: "11 metrics", label: "Revenue, users, efficiency" },
          ].map((s) => (
            <div key={s.stat} className="rounded-xl bg-white/5 p-4">
              <p className="text-2xl font-bold text-white tabular-nums">{s.stat}</p>
              <p className="text-xs text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
        <Link
          href="/"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          Compare your startup → <ArrowRight strokeWidth={2} className="h-4 w-4" />
        </Link>
      </div>

      {/* Dimension breakdown */}
      <div>
        <h2 className="text-lg font-semibold text-ink-800 mb-5">SVI Dimension Benchmarks</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(sviBenchmark.dimensions).map(([key, val]) => {
            const DIM_LABELS: Record<string, string> = {
              ftv: "Founder & Team",
              mpc: "Market & Problem",
              ptd: "Product & Tech",
              tre: "Traction & Revenue",
              cgh: "Growth Potential",
              iri: "Investor Readiness",
              lco: "Legal & Compliance",
              svm: "Scalability",
            };
            const pct = Math.round((val.avg / val.top) * 100);
            return (
              <div key={key} className="rounded-xl border border-surface-200 bg-white p-4">
                <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">
                  {DIM_LABELS[key] ?? key}
                </p>
                <div className="flex items-end gap-1.5 mb-2">
                  <span className="text-xl font-bold text-ink-800">{val.avg}</span>
                  <span className="text-xs text-ink-400 pb-0.5">avg</span>
                  <span className="ml-auto text-xs text-emerald-600 font-semibold">{val.top} top</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-semibold mb-2">
          Free · No login required
        </p>
        <h3 className="text-2xl font-semibold text-ink-900 mb-3">
          How does your startup compare?
        </h3>
        <p className="text-sm text-ink-500 mb-6 max-w-md mx-auto">
          Get your personalised Startup Value Index score and see exactly where you
          land in each benchmark category against AU peers.
        </p>
        <Link
          href="/"
          className="inline-flex h-12 items-center gap-2.5 rounded-2xl bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 transition-colors cta-glow"
        >
          Get your free SVI score <ArrowRight strokeWidth={2} className="h-5 w-5" />
        </Link>
      </div>
    </div>
  );
}
