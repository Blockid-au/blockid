"use client";

import * as React from "react";
import { METRIC_LABELS, getPercentile, STAGES } from "@/lib/benchmarks";

/** One row from the startup_metrics table (flat columns). */
export interface MetricRow {
  id: string;
  metric_date: string;
  mrr_aud: number | null;
  arr_aud: number | null;
  revenue_growth_pct: number | null;
  mau: number | null;
  dau: number | null;
  monthly_churn_pct: number | null;
  nrr_pct: number | null;
  cac_aud: number | null;
  ltv_aud: number | null;
  burn_rate_aud: number | null;
  runway_months: number | null;
  source: string;
  created_at: string;
}

interface MetricsDashboardProps {
  metrics: MetricRow[];
  stage?: string;
}

// ---------------------------------------------------------------------------
// Key metric card
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  unit,
  percentile,
  stage,
}: {
  label: string;
  value: number | null;
  unit?: string;
  percentile?: number;
  stage?: string;
}) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-500 font-medium mb-1">
        {label}
      </p>
      {value != null ? (
        <>
          <p className="text-2xl font-bold text-ink-800 tabular-nums">
            {unit === "$" ? `$${value.toLocaleString()}` : value.toLocaleString()}
            {unit && unit !== "$" ? (
              <span className="text-sm font-normal text-ink-500 ml-0.5">
                {unit}
              </span>
            ) : null}
          </p>
          {percentile != null && stage && (
            <p className="text-xs text-ink-500 mt-1">
              <span
                className={
                  percentile >= 75
                    ? "text-emerald-600 font-medium"
                    : percentile >= 50
                      ? "text-brand-600 font-medium"
                      : percentile >= 25
                        ? "text-amber-600 font-medium"
                        : "text-red-500 font-medium"
                }
              >
                {percentile}th percentile
              </span>{" "}
              for {STAGES[stage] ?? stage}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-400 mt-1">No data yet</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini line chart (reuses SVIChart pattern with inline SVG)
// ---------------------------------------------------------------------------

function MiniChart({
  data,
  label,
}: {
  data: Array<{ date: string; value: number }>;
  label: string;
}) {
  if (data.length < 2) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        <h3 className="text-base font-semibold text-ink-800 mb-4">{label}</h3>
        <p className="text-sm text-ink-500">
          At least two data points are needed to display a chart.
        </p>
      </div>
    );
  }

  const width = 600;
  const height = 180;
  const padding = 40;

  const values = data.map((d) => d.value);
  const minVal = Math.min(...values) - Math.abs(Math.min(...values)) * 0.1;
  const maxVal = Math.max(...values) + Math.abs(Math.max(...values)) * 0.1;
  const range = maxVal - minVal || 1;

  const xAt = (i: number) =>
    padding + (i / (data.length - 1)) * (width - 2 * padding);
  const yAt = (v: number) =>
    height - padding - ((v - minVal) / range) * (height - 2 * padding);

  const points = data.map((d, i) => `${xAt(i)},${yAt(d.value)}`).join(" ");

  const areaPath = [
    `M ${xAt(0)},${yAt(data[0].value)}`,
    ...data.slice(1).map((d, i) => `L ${xAt(i + 1)},${yAt(d.value)}`),
    `L ${xAt(data.length - 1)},${height - padding}`,
    `L ${xAt(0)},${height - padding}`,
    "Z",
  ].join(" ");

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-6">
      <h3 className="text-base font-semibold text-ink-800 mb-4">{label}</h3>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${label} chart`}
      >
        <defs>
          <linearGradient id="metricsAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B7DD8" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#3B7DD8" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* X-axis labels */}
        {data.map((d, i) => {
          const show =
            i === 0 ||
            i === data.length - 1 ||
            (data.length > 4 && i === Math.floor(data.length / 2));
          if (!show) return null;
          const dateStr = new Date(d.date).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
          });
          return (
            <text
              key={`label-${i}`}
              x={xAt(i)}
              y={height - padding + 16}
              textAnchor="middle"
              fill="#94A3B8"
              fontSize="9"
              fontFamily="monospace"
            >
              {dateStr}
            </text>
          );
        })}

        <path d={areaPath} fill="url(#metricsAreaGrad)" />

        <polyline
          points={points}
          fill="none"
          stroke="#3B7DD8"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {data.map((d, i) => (
          <g key={`point-${i}`}>
            <circle cx={xAt(i)} cy={yAt(d.value)} r="8" fill="transparent">
              <title>
                {new Date(d.date).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
                : {d.value.toLocaleString()}
              </title>
            </circle>
            <circle
              cx={xAt(i)}
              cy={yAt(d.value)}
              r="3.5"
              fill="#3B7DD8"
              stroke="white"
              strokeWidth="1.5"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connected sources status
// ---------------------------------------------------------------------------

function ConnectedSources() {
  const sources = [
    { name: "GitHub", connected: false },
    { name: "Google Analytics", connected: false },
    { name: "Stripe", connected: false },
  ];

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-6">
      <h3 className="text-base font-semibold text-ink-800 mb-4">
        Connected Sources
      </h3>
      <div className="space-y-2">
        {sources.map((s) => (
          <div key={s.name} className="flex items-center justify-between text-sm">
            <span className="text-ink-700">{s.name}</span>
            <span
              className={
                s.connected
                  ? "text-emerald-600 font-medium"
                  : "text-ink-400"
              }
            >
              {s.connected ? "Connected" : "Not connected"}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-500 mt-4">
        Connect data sources for automatic metric tracking. Coming soon.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard component
// ---------------------------------------------------------------------------

type MetricField = keyof Omit<
  MetricRow,
  "id" | "metric_date" | "source" | "created_at"
>;

export function MetricsDashboard({
  metrics,
  stage = "pre-seed",
}: MetricsDashboardProps) {
  const [selectedMetric, setSelectedMetric] =
    React.useState<MetricField>("mrr_aud");

  // Get latest non-null value for a given metric column
  function getLatestValue(field: MetricField): number | null {
    for (let i = metrics.length - 1; i >= 0; i--) {
      const v = metrics[i][field];
      if (v != null) return v as number;
    }
    return null;
  }

  // Extract time-series for the selected metric column
  const chartData = metrics
    .map((row) => {
      const v = row[selectedMetric];
      return v != null
        ? { date: row.metric_date, value: v as number }
        : null;
    })
    .filter((d): d is { date: string; value: number } => d !== null);

  const keyMetrics: Array<{
    field: MetricField;
    label: string;
    unit?: string;
  }> = [
    { field: "mrr_aud", label: "MRR", unit: "$" },
    { field: "mau", label: "MAU" },
    { field: "monthly_churn_pct", label: "Churn", unit: "%" },
    { field: "nrr_pct", label: "NRR", unit: "%" },
  ];

  return (
    <div className="space-y-6">
      {/* Key metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {keyMetrics.map(({ field, label, unit }) => {
          const latest = getLatestValue(field);
          const percentile =
            latest != null ? getPercentile(stage, field, latest) : undefined;
          return (
            <MetricCard
              key={field}
              label={label}
              value={latest}
              unit={unit}
              percentile={percentile}
              stage={stage}
            />
          );
        })}
      </div>

      {/* Chart metric selector */}
      <div className="flex items-center gap-3">
        <label
          htmlFor="chart-metric"
          className="text-xs font-medium text-ink-600"
        >
          Chart metric:
        </label>
        <select
          id="chart-metric"
          value={selectedMetric}
          onChange={(e) => setSelectedMetric(e.target.value as MetricField)}
          className="rounded-lg border border-surface-200 bg-surface-50 px-2.5 py-1.5 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-300"
        >
          {Object.entries(METRIC_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Line chart */}
      <MiniChart
        data={chartData}
        label={METRIC_LABELS[selectedMetric] ?? selectedMetric}
      />

      {/* Connected sources */}
      <ConnectedSources />
    </div>
  );
}
