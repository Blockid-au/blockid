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
  nrrPct: number;
  grossMarginPct: number;
}

interface MetricResult {
  key: string;
  label: string;
  userValue: number;
  band: { p25: number; p50: number; p75: number };
  percentile: number;
  unit: "aud" | "pct" | "months" | "number" | "ratio";
  higherIsBetter: boolean;
}

// Universal SaaS bands for derived metrics where stage-specific data
// is not yet warehoused. Sources: Bessemer Cloud Index, OpenView SaaS
// Benchmarks, KeyBanc Capital Markets SaaS Survey — adapted for AU.
const DERIVED_BANDS: Record<string, Record<StageKey, { p25: number; p50: number; p75: number }>> = {
  ltv_cac_ratio: {
    "pre-seed": { p25: 1, p50: 2, p75: 3.5 },
    seed: { p25: 1.5, p50: 3, p75: 5 },
    "series-a": { p25: 2, p50: 3.5, p75: 6 },
    "series-b": { p25: 2.5, p50: 4, p75: 7 },
  },
  // months (lower is better — p25 > p75)
  cac_payback_months: {
    "pre-seed": { p25: 30, p50: 18, p75: 9 },
    seed: { p25: 24, p50: 15, p75: 7 },
    "series-a": { p25: 18, p50: 12, p75: 6 },
    "series-b": { p25: 15, p50: 10, p75: 5 },
  },
  // % (growth + margin) — Rule of 40 from SaaS public comparables
  rule_of_40: {
    "pre-seed": { p25: -20, p50: 10, p75: 40 },
    seed: { p25: -10, p50: 20, p75: 50 },
    "series-a": { p25: 0, p50: 30, p75: 60 },
    "series-b": { p25: 10, p50: 40, p75: 70 },
  },
};

function percentileFromBand(
  band: { p25: number; p50: number; p75: number },
  value: number,
): number {
  let { p25, p50, p75 } = band;
  const inverted = p25 > p75;
  if (inverted) {
    [p25, p75] = [p75, p25];
    value = p25 + p75 - value;
  }
  if (value <= p25) {
    if (p25 <= 0) return value <= p25 ? 25 : 0;
    return Math.max(0, Math.round((value / p25) * 25));
  }
  if (value <= p50) {
    const range = p50 - p25;
    return range === 0 ? 37 : Math.round(25 + ((value - p25) / range) * 25);
  }
  if (value <= p75) {
    const range = p75 - p50;
    return range === 0 ? 62 : Math.round(50 + ((value - p50) / range) * 25);
  }
  const extra = p75 - p50;
  if (extra === 0) return 100;
  return Math.min(100, Math.round(75 + ((value - p75) / extra) * 25));
}

function formatMetric(value: number, unit: MetricResult["unit"]): string {
  switch (unit) {
    case "aud":
      return formatAud(value);
    case "pct":
      return formatPercent(value);
    case "months":
      return `${formatNumber(value, 1)} mo`;
    case "ratio":
      return `${formatNumber(value, 1)}x`;
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
    nrrPct: 105,
    grossMarginPct: 72,
  });

  const set = <K extends keyof Inputs>(k: K, v: Inputs[K]) =>
    setInputs((s) => ({ ...s, [k]: v }));

  const setNum = (k: keyof Inputs) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, Number(e.target.value) as Inputs[typeof k]);

  const stageBench = BENCHMARKS[inputs.stage];

  const runwayMonths = inputs.burnRate > 0 ? inputs.cashOnHand / inputs.burnRate : 0;
  const ltvCacRatio = inputs.cac > 0 ? inputs.ltv / inputs.cac : 0;

  // CAC payback (months) = CAC / monthly gross profit per customer.
  // Monthly ARPU is derived from LTV and monthly churn (LTV = ARPU / churn).
  // Monthly gross profit per customer = ARPU × gross margin.
  const monthlyArpu = inputs.monthlyChurn > 0 ? inputs.ltv * (inputs.monthlyChurn / 100) : 0;
  const monthlyGrossProfit = monthlyArpu * (inputs.grossMarginPct / 100);
  const cacPaybackMonths = monthlyGrossProfit > 0 ? inputs.cac / monthlyGrossProfit : 0;

  // Rule of 40 = annualised revenue growth (%) + EBITDA margin (%).
  // EBITDA margin is approximated from monthly burn vs MRR (negative when burning).
  const annualGrowthPct = (Math.pow(1 + inputs.growthMonthPct / 100, 12) - 1) * 100;
  const monthlyEbitda = inputs.mrr - inputs.burnRate;
  const ebitdaMarginPct = inputs.mrr > 0 ? (monthlyEbitda / inputs.mrr) * 100 : 0;
  const ruleOf40Score = annualGrowthPct + ebitdaMarginPct;

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
    {
      key: "nrr_pct",
      label: METRIC_LABELS.nrr_pct,
      userValue: inputs.nrrPct,
      band: stageBench.nrr_pct,
      percentile: getPercentile(inputs.stage, "nrr_pct", inputs.nrrPct),
      unit: "pct",
      higherIsBetter: true,
    },
    {
      key: "ltv_cac_ratio",
      label: "LTV / CAC Ratio",
      userValue: ltvCacRatio,
      band: DERIVED_BANDS.ltv_cac_ratio[inputs.stage],
      percentile: percentileFromBand(DERIVED_BANDS.ltv_cac_ratio[inputs.stage], ltvCacRatio),
      unit: "ratio",
      higherIsBetter: true,
    },
    {
      key: "cac_payback_months",
      label: "CAC Payback (months)",
      userValue: cacPaybackMonths,
      band: DERIVED_BANDS.cac_payback_months[inputs.stage],
      percentile: percentileFromBand(DERIVED_BANDS.cac_payback_months[inputs.stage], cacPaybackMonths),
      unit: "months",
      higherIsBetter: false,
    },
    {
      key: "rule_of_40",
      label: "Rule of 40 (growth + EBITDA margin)",
      userValue: ruleOf40Score,
      band: DERIVED_BANDS.rule_of_40[inputs.stage],
      percentile: percentileFromBand(DERIVED_BANDS.rule_of_40[inputs.stage], ruleOf40Score),
      unit: "pct",
      higherIsBetter: true,
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="churn">Monthly churn (%)</Label>
              <Input id="churn" type="number" value={inputs.monthlyChurn} onChange={setNum("monthlyChurn")} />
            </div>
            <div>
              <Label htmlFor="nrr">NRR (%)</Label>
              <Input id="nrr" type="number" value={inputs.nrrPct} onChange={setNum("nrrPct")} />
            </div>
          </div>
          <div>
            <Label htmlFor="gm">Gross margin (%)</Label>
            <Input id="gm" type="number" value={inputs.grossMarginPct} onChange={setNum("grossMarginPct")} />
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
