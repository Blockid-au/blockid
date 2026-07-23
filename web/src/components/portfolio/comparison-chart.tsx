// Cross-project SVI comparison chart — Q4 Multi-project #2
// (feature-upgrade-roadmap-v2.md:52).
//
// Rendered above the /dashboard/portfolio table. One line per project
// showing the last 30 days of daily SVI scores, capped at
// PORTFOLIO_COMPARISON_MAX_SERIES so the legend stays legible.
//
// Pure derivation lives in `@/lib/portfolio#deriveComparisonSeries` — this
// component only handles rendering, so the wide-format transform stays
// unit-testable from vitest without React.

"use client";

import * as React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import {
  deriveComparisonSeries,
  PORTFOLIO_COMPARISON_MAX_SERIES,
  type PortfolioRow,
} from "@/lib/portfolio";

/**
 * Deterministic color palette — same length as the series cap so we can
 * key off the series index directly. Colors chosen to stay legible in
 * both light and dark surfaces on the dashboard.
 */
const SERIES_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"] as const;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export interface PortfolioComparisonChartProps {
  rows: Pick<PortfolioRow, "id" | "name" | "current_svi_score" | "svi_history">[];
}

export function PortfolioComparisonChart({ rows }: PortfolioComparisonChartProps) {
  const derived = React.useMemo(() => deriveComparisonSeries(rows), [rows]);

  if (!derived) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <LineChartIcon strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-ink-800">SVI comparison — 30 days</h3>
        </div>
        <p className="text-sm text-ink-500">
          SVI history will appear after your first analysis.
        </p>
      </div>
    );
  }

  const { series, data, total_projects_with_history } = derived;
  const hiddenCount = Math.max(0, total_projects_with_history - series.length);
  // Recharts needs at least 2 x-values to draw a segment; when we only
  // have 1 day of data the chart still renders as a marker dot.
  const isSinglePoint = data.length === 1;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LineChartIcon strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-ink-800">SVI comparison — 30 days</h3>
        </div>
        {hiddenCount > 0 ? (
          <span className="text-xs text-ink-500">
            Showing first {series.length} of {total_projects_with_history} projects
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3 mb-3">
        {series.map((s, i) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1.5 text-xs text-ink-700"
          >
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
            />
            <span className="font-medium truncate max-w-[160px]">{s.name}</span>
            <span className="text-ink-500 tabular-nums">
              · {s.last_score ?? "—"}
            </span>
          </span>
        ))}
      </div>

      <div className="w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickFormatter={formatDate}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value, key) => {
                const s = series.find((x) => x.id === String(key));
                return [value as number, s?.name ?? String(key)];
              }}
            />
            <Legend
              verticalAlign="top"
              height={0}
              content={() => null}
            />
            {series.map((s, i) => (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.name}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={2}
                dot={{
                  fill: SERIES_COLORS[i % SERIES_COLORS.length],
                  r: isSinglePoint ? 5 : 3,
                  strokeWidth: 0,
                }}
                activeDot={{
                  fill: SERIES_COLORS[i % SERIES_COLORS.length],
                  r: 5,
                  strokeWidth: 2,
                  stroke: "#fff",
                }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {isSinglePoint ? (
        <p className="mt-2 text-xs text-ink-500">
          More history will accumulate as you re-run the SVI analysis.
        </p>
      ) : null}
    </div>
  );
}

// Re-export the cap so callers can key logic on the same number the
// derivation helper uses. Keeps the "5" magic number single-sourced.
export { PORTFOLIO_COMPARISON_MAX_SERIES };
