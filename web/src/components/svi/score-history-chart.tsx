"use client";

import * as React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

export interface ScoreHistoryPoint {
  /** ISO datetime string from svi_analyses.created_at */
  created_at: string;
  /** Raw SVI score */
  total_svi: number;
}

interface ChartDataPoint {
  date: string;       // formatted label e.g. "12 Jun"
  svi: number;
  rawDate: string;    // original ISO string for tooltip
  delta: number | null;
}

interface Props {
  history: ScoreHistoryPoint[];
  startupName?: string;
  className?: string;
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function buildChartData(history: ScoreHistoryPoint[]): ChartDataPoint[] {
  return history.map((h, i) => {
    const prev = history[i - 1];
    const delta = prev != null ? h.total_svi - prev.total_svi : null;
    return {
      date: formatDate(h.created_at),
      svi: h.total_svi,
      rawDate: h.created_at,
      delta,
    };
  });
}

/* ─── Custom Tooltip ────────────────────────────────────────────────────────── */

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const { svi, delta, rawDate } = point;
  return (
    <div className="rounded-xl border border-surface-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-ink-800 mb-1">{formatDateLong(rawDate)}</p>
      <p className="text-ink-700">
        SVI Score:{" "}
        <span className="font-bold font-mono text-brand-600">{svi}</span>
      </p>
      {delta !== null && (
        <p
          className={cn(
            "font-semibold mt-0.5",
            delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "text-ink-500",
          )}
        >
          {delta > 0 ? "+" : ""}
          {delta} vs previous
        </p>
      )}
    </div>
  );
}

/* ─── Main Component ────────────────────────────────────────────────────────── */

/**
 * ScoreHistoryChart
 *
 * Renders a recharts LineChart of per-analysis SVI scores over time,
 * sourced from the `svi_analyses` table. Designed to be embedded in
 * the /dashboard and /dashboard/svi pages.
 */
export function ScoreHistoryChart({ history, startupName, className }: Props) {
  /* ── Empty state ─────────────────────────────────────────────────────── */
  if (history.length === 0) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-dashed border-surface-200 bg-surface-50 p-8 text-center",
          className,
        )}
      >
        <BarChart3 strokeWidth={1.5} className="mx-auto mb-3 h-8 w-8 text-ink-300" />
        <p className="text-sm font-medium text-ink-500">No score history yet</p>
        <p className="mt-1 text-xs text-ink-400">
          Your SVI trend chart will appear after your first analysis.
        </p>
      </div>
    );
  }

  /* ── Single-score state ──────────────────────────────────────────────── */
  if (history.length === 1) {
    const first = history[0];
    return (
      <div
        className={cn(
          "rounded-2xl border border-surface-200 bg-white p-6 shadow-sm",
          className,
        )}
      >
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp strokeWidth={1.75} className="h-4 w-4 text-brand-500" />
          <h3 className="text-sm font-semibold text-ink-800">SVI Score History</h3>
        </div>
        <div className="flex items-baseline gap-3 mt-3">
          <span className="text-4xl font-bold font-mono text-brand-600">
            {first.total_svi}
          </span>
          <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-600">
            First analysis · {formatDate(first.created_at)}
          </span>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          Run another SVI analysis to see your score trend over time.
        </p>
      </div>
    );
  }

  /* ── Full chart ──────────────────────────────────────────────────────── */
  const chartData = buildChartData(history);
  const latest = chartData[chartData.length - 1];
  const prev = chartData[chartData.length - 2];
  const overallDelta = latest.svi - chartData[0].svi;
  const recentDelta = latest.delta;

  const DeltaIcon =
    overallDelta > 0 ? TrendingUp : overallDelta < 0 ? TrendingDown : Minus;
  const deltaColor =
    overallDelta > 0
      ? "text-emerald-600"
      : overallDelta < 0
        ? "text-red-500"
        : "text-ink-500";

  // Y-axis domain with 10% padding
  const allScores = history.map((h) => h.total_svi);
  const yMin = Math.max(0, Math.floor(Math.min(...allScores) - 10));
  const yMax = Math.ceil(Math.max(...allScores) + 10);

  // X-axis: show at most ~6 ticks to avoid crowding
  const tickInterval = Math.max(1, Math.ceil(chartData.length / 6) - 1);

  return (
    <div
      className={cn(
        "rounded-2xl border border-surface-200 bg-white p-6 shadow-sm",
        className,
      )}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp strokeWidth={1.75} className="h-4 w-4 text-brand-500" />
            <h3 className="text-sm font-semibold text-ink-800">
              SVI Score History
            </h3>
          </div>
          {startupName && (
            <p className="mt-0.5 text-xs text-ink-500">{startupName}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Latest score */}
          <div className="text-right">
            <p className="text-2xl font-bold font-mono text-ink-900 leading-none">
              {latest.svi}
            </p>
            <p className="text-[10px] text-ink-400 mt-0.5">current</p>
          </div>

          {/* Overall trend badge */}
          <div
            className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
              overallDelta > 0
                ? "bg-emerald-50 text-emerald-700"
                : overallDelta < 0
                  ? "bg-red-50 text-red-600"
                  : "bg-surface-100 text-ink-500",
            )}
          >
            <DeltaIcon strokeWidth={2} className="h-3 w-3" />
            {overallDelta > 0 ? "+" : ""}
            {overallDelta} overall
          </div>
        </div>
      </div>

      {/* ── Chart ───────────────────────────────────────────────────────── */}
      <div className="w-full h-[220px] sm:h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 10, left: -12, bottom: 5 }}
          >
            <defs>
              <linearGradient id="scoreHistoryGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#f1f5f9"
              vertical={false}
            />

            <XAxis
              dataKey="date"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
              interval={tickInterval}
            />

            <YAxis
              domain={[yMin, yMax]}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={38}
            />

            <Tooltip content={<CustomTooltip />} />

            {/* Previous score reference line */}
            {recentDelta !== null && prev && (
              <ReferenceLine
                y={prev.svi}
                stroke="#e2e8f0"
                strokeDasharray="4 3"
                label={{
                  value: `prev ${prev.svi}`,
                  fill: "#cbd5e1",
                  fontSize: 10,
                  position: "right",
                }}
              />
            )}

            <Line
              type="monotone"
              dataKey="svi"
              stroke="#2563eb"
              strokeWidth={2.5}
              dot={{ fill: "#2563eb", r: 3, strokeWidth: 0 }}
              activeDot={{
                fill: "#2563eb",
                r: 5,
                strokeWidth: 2,
                stroke: "#ffffff",
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Footer stats ────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-4 border-t border-surface-100 pt-3 text-xs text-ink-500">
        <span>
          <span className="font-semibold text-ink-700">{history.length}</span>{" "}
          {history.length === 1 ? "analysis" : "analyses"}
        </span>
        <span>
          First:{" "}
          <span className="font-semibold text-ink-700">
            {chartData[0].svi}
          </span>{" "}
          on {formatDate(history[0].created_at)}
        </span>
        <span>
          Best:{" "}
          <span className="font-semibold text-ink-700">
            {Math.max(...allScores)}
          </span>
        </span>
        {recentDelta !== null && (
          <span
            className={cn(
              "font-semibold",
              recentDelta > 0
                ? "text-emerald-600"
                : recentDelta < 0
                  ? "text-red-500"
                  : "text-ink-500",
            )}
          >
            {recentDelta > 0 ? "+" : ""}
            {recentDelta} since last run
          </span>
        )}
      </div>
    </div>
  );
}
