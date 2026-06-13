"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BENCHMARKS,
  STAGES,
  METRIC_LABELS,
  getPercentile,
  type StageBenchmarks,
} from "@/lib/benchmarks";
import { formatAud, formatNumber, formatPercent } from "@/lib/utils";

type StageKey = keyof typeof BENCHMARKS;

const SECTORS = [
  { id: "saas", label: "SaaS / B2B Software" },
  { id: "marketplace", label: "Marketplace" },
  { id: "fintech", label: "Fintech" },
  { id: "consumer", label: "Consumer / D2C" },
  { id: "deeptech", label: "Deeptech / Hardware" },
  { id: "healthtech", label: "Healthtech" },
];

interface Inputs {
  stage: StageKey;
  sector: string;
  arr: number;
  mrr: number;
  growthMonthPct: number;
  headcount: number;
  burnRate: number;
  cashOnHand: number;
  cac: number;
  ltv: number;
  monthlyChurn: number;
}

interface MetricResult {
  key: keyof StageBenchmarks;
  label: string;
  userValue: number;
  band: { p25: number; p50: number; p75: number };
  percentile: number;
  unit: "aud" | "pct" | "months" | "number";
  higherIsBetter: boolean;
}

function formatMetric(value: number, unit: MetricResult["unit"]): string {
  switch (unit) {
    case "aud":
      return formatAud(value);
    case "pct":
      return formatPercent(value);
    case "months":
      return `${formatNumber(value, 1)} mo`;
    default:
      return formatNumber(value);
  }
}

function badgeForPercentile(p: number): { label: string; tone: string } {
  if (p >= 75) return { label: "Top quartile", tone: "bg-emerald-100 text-emerald-700" };
  if (p >= 50) return { label: "Above median", tone: "bg-brand-100 text-brand-700" };
  if (p >= 25) return { label: "Below median", tone: "bg-gold-100 text-gold-800" };
  return { label: "Bottom quartile", tone: "bg-rose-100 text-rose-700" };
}

export function FinancialProjectionsCalculator() {
  const [inputs, setInputs] = React.useState<Inputs>({
    stage: "seed",
    sector: "saas",
    arr: 150_000,
    mrr: 12_500,
    growthMonthPct: 12,
    headcount: 6,
    burnRate: 45_000,
    cashOnHand: 600_000,
    cac: 400,
    ltv: 4_500,
    monthlyChurn: 4,
  });

  const set = <K extends keyof Inputs>(k: K, v: Inputs[K]) =>
    setInputs((s) => ({ ...s, [k]: v }));

  const setNum = (k: keyof Inputs) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, Number(e.target.value) as Inputs[typeof k]);

  const stageBench = BENCHMARKS[inputs.stage];

  const runwayMonths = inputs.burnRate > 0 ? inputs.cashOnHand / inputs.burnRate : 0;
  const ltvCacRatio = inputs.cac > 0 ? inputs.ltv / inputs.cac : 0;

  const metrics: MetricResult[] = [
    {
      key: "mrr_aud",
      label: METRIC_LABELS.mrr_aud,
      userValue: inputs.mrr,
      band: stageBench.mrr_aud,
      percentile: getPercentile(inputs.stage, "mrr_aud", inputs.mrr),
      unit: "aud",
      higherIsBetter: true,
    },
    {
      key: "arr_aud",
      label: METRIC_LABELS.arr_aud,
      userValue: inputs.arr,
      band: stageBench.arr_aud,
      percentile: getPercentile(inputs.stage, "arr_aud", inputs.arr),
      unit: "aud",
      higherIsBetter: true,
    },
    {
      key: "revenue_growth_pct",
      label: METRIC_LABELS.revenue_growth_pct,
      userValue: inputs.growthMonthPct,
      band: stageBench.revenue_growth_pct,
      percentile: getPercentile(inputs.stage, "revenue_growth_pct", inputs.growthMonthPct),
      unit: "pct",
      higherIsBetter: true,
    },
    {
      key: "burn_rate_aud",
      label: METRIC_LABELS.burn_rate_aud,
      userValue: inputs.burnRate,
      band: stageBench.burn_rate_aud,
      percentile: getPercentile(inputs.stage, "burn_rate_aud", inputs.burnRate),
      unit: "aud",
      higherIsBetter: false,
    },
    {
      key: "runway_months",
      label: METRIC_LABELS.runway_months,
      userValue: runwayMonths,
      band: stageBench.runway_months,
      percentile: getPercentile(inputs.stage, "runway_months", runwayMonths),
      unit: "months",
      higherIsBetter: true,
    },
    {
      key: "cac_aud",
      label: METRIC_LABELS.cac_aud,
      userValue: inputs.cac,
      band: stageBench.cac_aud,
      percentile: getPercentile(inputs.stage, "cac_aud", inputs.cac),
      unit: "aud",
      higherIsBetter: false,
    },
    {
      key: "ltv_aud",
      label: METRIC_LABELS.ltv_aud,
      userValue: inputs.ltv,
      band: stageBench.ltv_aud,
      percentile: getPercentile(inputs.stage, "ltv_aud", inputs.ltv),
      unit: "aud",
      higherIsBetter: true,
    },
    {
      key: "monthly_churn_pct",
      label: METRIC_LABELS.monthly_churn_pct,
      userValue: inputs.monthlyChurn,
      band: stageBench.monthly_churn_pct,
      percentile: getPercentile(inputs.stage, "monthly_churn_pct", inputs.monthlyChurn),
      unit: "pct",
      higherIsBetter: false,
    },
  ];

  const overall = Math.round(metrics.reduce((s, m) => s + m.percentile, 0) / metrics.length);
  const overallBadge = badgeForPercentile(overall);

  return (
    <div className="grid lg:grid-cols-5 gap-8">
      <section className="lg:col-span-2 rounded-2xl border border-surface-200 bg-white p-6">
        <h2 className="text-base font-semibold text-ink-800 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-brand-500" /> Your inputs
        </h2>
        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="stage">Stage</Label>
            <select
              id="stage"
              value={inputs.stage}
              onChange={(e) => set("stage", e.target.value as StageKey)}
              className="mt-1 w-full rounded-md border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800"
            >
              {Object.entries(STAGES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="sector">Sector</Label>
            <select
              id="sector"
              value={inputs.sector}
              onChange={(e) => set("sector", e.target.value)}
              className="mt-1 w-full rounded-md border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800"
            >
              {SECTORS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="arr">ARR (AUD)</Label>
              <Input id="arr" type="number" value={inputs.arr} onChange={setNum("arr")} />
            </div>
            <div>
              <Label htmlFor="mrr">MRR (AUD)</Label>
              <Input id="mrr" type="number" value={inputs.mrr} onChange={setNum("mrr")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="growth">Growth / month (%)</Label>
              <Input id="growth" type="number" value={inputs.growthMonthPct} onChange={setNum("growthMonthPct")} />
            </div>
            <div>
              <Label htmlFor="headcount">Headcount (FTE)</Label>
              <Input id="headcount" type="number" value={inputs.headcount} onChange={setNum("headcount")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="burn">Monthly burn (AUD)</Label>
              <Input id="burn" type="number" value={inputs.burnRate} onChange={setNum("burnRate")} />
            </div>
            <div>
              <Label htmlFor="cash">Cash on hand (AUD)</Label>
              <Input id="cash" type="number" value={inputs.cashOnHand} onChange={setNum("cashOnHand")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cac">CAC (AUD)</Label>
              <Input id="cac" type="number" value={inputs.cac} onChange={setNum("cac")} />
            </div>
            <div>
              <Label htmlFor="ltv">LTV (AUD)</Label>
              <Input id="ltv" type="number" value={inputs.ltv} onChange={setNum("ltv")} />
            </div>
          </div>
          <div>
            <Label htmlFor="churn">Monthly churn (%)</Label>
            <Input id="churn" type="number" value={inputs.monthlyChurn} onChange={setNum("monthlyChurn")} />
          </div>
        </div>
      </section>

      <section className="lg:col-span-3 space-y-6">
        <div className="rounded-2xl border border-surface-200 bg-gradient-to-br from-brand-50 to-white p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-brand-700 font-medium">
                Overall Position · {STAGES[inputs.stage]}
              </p>
              <p className="mt-2 text-4xl font-semibold text-ink-800">
                {overall}<span className="text-2xl text-ink-400">th percentile</span>
              </p>
              <p className="mt-1 text-sm text-ink-500">
                LTV / CAC = {formatNumber(ltvCacRatio, 1)}x · Runway {formatNumber(runwayMonths, 1)} months
              </p>
            </div>
            <span
              className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${overallBadge.tone}`}
            >
              {overallBadge.label}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-surface-200 bg-white p-6">
          <h2 className="text-base font-semibold text-ink-800">
            Metric-by-metric position
          </h2>
          <div className="mt-5 space-y-5">
            {metrics.map((m) => {
              const badge = badgeForPercentile(m.percentile);
              return (
                <div key={m.key} className="border-b border-surface-100 pb-4 last:border-none last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-ink-800">{m.label}</p>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badge.tone}`}
                    >
                      {m.percentile}th
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between text-xs text-ink-400">
                    <span>You: <span className="text-ink-800 font-medium">{formatMetric(m.userValue, m.unit)}</span></span>
                    <span>
                      p25 {formatMetric(m.band.p25, m.unit)} · p50 {formatMetric(m.band.p50, m.unit)} · p75 {formatMetric(m.band.p75, m.unit)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-surface-100">
                    <div
                      className={`h-1.5 rounded-full ${m.percentile >= 75 ? "bg-emerald-500" : m.percentile >= 50 ? "bg-brand-500" : m.percentile >= 25 ? "bg-gold-500" : "bg-rose-500"}`}
                      style={{ width: `${Math.max(2, Math.min(100, m.percentile))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-brand-700 font-medium">
            Next step
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Want to see how these metrics translate into a full SVI score and an investor-ready PDF? Run a full BlockID analysis — it&apos;s 60 seconds and free for your first idea.
          </p>
          <Link
            href="/score"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            Get my SVI score <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
