"use client";

// Wave 26C — SVI historical trend dashboard client.
//
// Pure SVG charts (no npm deps): 1 hero line chart + 8 per-dim sparklines +
// delta table. Handles 0, 1, and 12+ snapshots gracefully.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Minus, TrendingUp, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const DIM_KEYS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;
type DimKey = (typeof DIM_KEYS)[number];

const DIM_LABEL: Record<DimKey, string> = {
  ftv: "Founder & Team",
  mpc: "Market & Problem",
  ptd: "Product & Tech",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

interface Snapshot {
  createdAt: string;
  overallScore: number;
  dimScores: Record<DimKey, number | null>;
  criterionCount: number;
}

interface Props {
  projectId: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / (24 * 60 * 60_000));
}

function deltaColor(d: number): string {
  if (d > 0) return "text-emerald-600 dark:text-emerald-400";
  if (d < 0) return "text-red-600 dark:text-red-400";
  return "text-ink-500 dark:text-ink-400";
}

export function SviTrendClient({ projectId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/svi/history/full?projectId=${encodeURIComponent(projectId)}`,
          { credentials: "same-origin" },
        );
        if (!res.ok) {
          if (!cancelled) setError("fetch_failed");
          return;
        }
        const body = (await res.json()) as { ok?: boolean; snapshots?: Snapshot[] };
        if (cancelled) return;
        if (!body.ok) {
          setError("fetch_failed");
          return;
        }
        setSnapshots(body.snapshots ?? []);
      } catch {
        if (!cancelled) setError("network");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const current = snapshots.length ? snapshots[snapshots.length - 1] : null;
  const priorAt30d = useMemo(() => {
    if (!current || snapshots.length < 2) return null;
    // Find the snapshot closest to 30 days before current.
    const target = new Date(current.createdAt).getTime() - 30 * 24 * 60 * 60_000;
    let best: Snapshot | null = null;
    let bestDiff = Infinity;
    for (const s of snapshots.slice(0, -1)) {
      const diff = Math.abs(new Date(s.createdAt).getTime() - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = s;
      }
    }
    return best;
  }, [snapshots, current]);

  const canRunNew = useMemo(() => {
    if (!current) return true;
    return daysBetween(new Date().toISOString(), current.createdAt) >= 7;
  }, [current]);

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <p className="text-sm text-ink-500 dark:text-ink-400">Loading SVI history…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-950/20 p-6 text-sm text-red-800 dark:text-red-200">
          Couldn&apos;t load your SVI history. Please refresh.
        </div>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50/40 dark:bg-brand-950/20 p-8 text-center space-y-3">
          <TrendingUp className="h-10 w-10 mx-auto text-brand-500 dark:text-brand-400" aria-hidden="true" />
          <h1 className="text-lg font-bold text-ink-800 dark:text-ink-100">Track your SVI over time</h1>
          <p className="text-sm text-ink-600 dark:text-ink-400">
            Run your first analysis to start tracking your Startup Value Index trend.
          </p>
          <Link
            href="/workspace/pitchdeck-analyze"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition-colors"
          >
            Run your first analysis <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const monthDelta = priorAt30d && current
    ? current.overallScore - priorAt30d.overallScore
    : null;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 md:p-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-ink-500 dark:text-ink-400">
            Your SVI trend — last {snapshots.length} snapshot{snapshots.length === 1 ? "" : "s"}
          </p>
          <div className="mt-1 flex items-baseline gap-3 flex-wrap">
            <span className="text-4xl md:text-5xl font-bold text-ink-900 dark:text-ink-100 tabular-nums">
              {current?.overallScore ?? "—"}
            </span>
            <span className="text-sm text-ink-500 dark:text-ink-400">/ 100</span>
            {monthDelta !== null ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                  monthDelta > 0
                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
                    : monthDelta < 0
                      ? "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200"
                      : "bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-300",
                )}
              >
                {monthDelta > 0 ? <ArrowUpRight className="h-3 w-3" /> : monthDelta < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {monthDelta > 0 ? `+${monthDelta}` : monthDelta} vs 30 days ago
              </span>
            ) : (
              <span className="text-xs text-ink-500 dark:text-ink-400">no prior snapshot for comparison</span>
            )}
          </div>
          {current && (
            <p className="text-xs text-ink-500 dark:text-ink-400 mt-2">
              Last analysed {fmtDateLong(current.createdAt)}
            </p>
          )}
        </div>
        <div>
          {canRunNew ? (
            <Link
              href="/workspace/pitchdeck-analyze"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition-colors"
            >
              Run new analysis <RefreshCw className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <div className="text-right">
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink-200 dark:bg-ink-800 text-ink-500 dark:text-ink-500 text-sm font-semibold px-4 py-2 cursor-not-allowed"
              >
                Run new analysis <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <p className="text-[10px] text-ink-500 dark:text-ink-400 mt-1">Available 7 days after last analysis</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Line chart ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5">
        <h2 className="text-sm font-bold text-ink-800 dark:text-ink-100 mb-3">Overall SVI over time</h2>
        {snapshots.length < 2 ? (
          <p className="text-xs text-ink-500 dark:text-ink-400">
            One snapshot only — run another analysis to see your trend line.
          </p>
        ) : (
          <LineChart
            points={snapshots.map((s) => ({ x: s.createdAt, y: s.overallScore }))}
            width={880}
            height={220}
          />
        )}
      </div>

      {/* ── 8 dim sparklines ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5">
        <h2 className="text-sm font-bold text-ink-800 dark:text-ink-100 mb-3">Per-dimension trends</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {DIM_KEYS.map((k) => {
            const series = snapshots.map((s) => s.dimScores[k]).filter((v): v is number => typeof v === "number");
            const latest = series[series.length - 1] ?? null;
            const first = series[0] ?? null;
            const delta = latest !== null && first !== null ? latest - first : null;
            return (
              <div
                key={k}
                className="rounded-lg border border-ink-200 dark:border-ink-800 bg-ink-50/40 dark:bg-ink-900/40 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-ink-700 dark:text-ink-200 truncate">{DIM_LABEL[k]}</p>
                  <span className="text-xs font-bold text-ink-800 dark:text-ink-100 tabular-nums">
                    {latest ?? "—"}
                  </span>
                </div>
                <Sparkline values={series} width={220} height={40} />
                {delta !== null && series.length >= 2 && (
                  <p className={cn("text-[10px] font-semibold tabular-nums", deltaColor(delta))}>
                    {delta > 0 ? `+${delta}` : delta} since first snapshot
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Delta table ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5">
        <h2 className="text-sm font-bold text-ink-800 dark:text-ink-100 mb-3">Snapshot history</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-ink-200 dark:border-ink-800">
                <th className="text-left py-2 px-2 font-semibold text-ink-500 uppercase tracking-wide">Date</th>
                {DIM_KEYS.map((k) => (
                  <th key={k} className="text-center py-2 px-2 font-semibold text-ink-500 uppercase tracking-wide">
                    {k.toUpperCase()}
                  </th>
                ))}
                <th className="text-center py-2 px-2 font-semibold text-ink-500 uppercase tracking-wide">Overall</th>
              </tr>
            </thead>
            <tbody>
              {[...snapshots].reverse().map((s, idx, arr) => {
                const prior = arr[idx + 1] ?? null;
                return (
                  <tr
                    key={s.createdAt}
                    className={cn(
                      "border-b border-ink-100 dark:border-ink-800/60",
                      idx === 0 && "bg-brand-50/40 dark:bg-brand-950/20",
                    )}
                  >
                    <td className="py-2 px-2 text-ink-700 dark:text-ink-200 whitespace-nowrap">
                      {fmtDate(s.createdAt)}
                      {idx === 0 && (
                        <span className="ml-1 text-[9px] uppercase font-bold text-brand-600 dark:text-brand-300">Now</span>
                      )}
                    </td>
                    {DIM_KEYS.map((k) => {
                      const v = s.dimScores[k];
                      const prev = prior?.dimScores[k] ?? null;
                      const d = v !== null && prev !== null ? v - prev : null;
                      return (
                        <td key={k} className="text-center py-2 px-2 tabular-nums">
                          <span className="font-semibold text-ink-800 dark:text-ink-100">{v ?? "—"}</span>
                          {d !== null && d !== 0 && (
                            <span className={cn("ml-1 text-[10px]", deltaColor(d))}>
                              {d > 0 ? "▲" : "▼"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center py-2 px-2 tabular-nums">
                      <span className="font-bold text-ink-900 dark:text-ink-100">{s.overallScore}</span>
                      {prior && (
                        <span className={cn("ml-1 text-[10px]", deltaColor(s.overallScore - prior.overallScore))}>
                          {s.overallScore - prior.overallScore > 0
                            ? `+${s.overallScore - prior.overallScore}`
                            : s.overallScore - prior.overallScore < 0
                              ? s.overallScore - prior.overallScore
                              : "="}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── SVG chart primitives ─────────────────────────────────────────────────────

function LineChart({
  points,
  width,
  height,
}: {
  points: { x: string; y: number }[];
  width: number;
  height: number;
}) {
  const padL = 32;
  const padR = 8;
  const padT = 8;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const n = points.length;
  const yScale = (y: number) => padT + (innerH * (100 - Math.max(0, Math.min(100, y)))) / 100;
  const xScale = (i: number) => padL + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(p.y).toFixed(1)}`).join(" ");
  const area = `${path} L${xScale(n - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${xScale(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

  const gridYs = [0, 25, 50, 75, 100];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      role="img"
      aria-label="Overall SVI trend line chart"
    >
      {/* Grid */}
      {gridYs.map((g) => (
        <g key={g}>
          <line
            x1={padL}
            x2={width - padR}
            y1={yScale(g)}
            y2={yScale(g)}
            stroke="currentColor"
            strokeWidth={g === 0 || g === 100 ? 1 : 0.5}
            strokeDasharray={g === 50 ? "4,4" : undefined}
            className="text-ink-200 dark:text-ink-700"
          />
          <text
            x={padL - 4}
            y={yScale(g) + 3}
            textAnchor="end"
            fontSize="9"
            className="fill-ink-400 dark:fill-ink-500"
          >
            {g}
          </text>
        </g>
      ))}
      {/* Area */}
      <path d={area} fill="#3b82f6" fillOpacity={0.12} />
      {/* Line */}
      <path d={path} stroke="#3b82f6" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Points */}
      {points.map((p, i) => (
        <circle key={i} cx={xScale(i)} cy={yScale(p.y)} r={3} fill="#3b82f6" stroke="#fff" strokeWidth={1.5} />
      ))}
      {/* X labels — first, middle, last */}
      {[0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
        <text
          key={`xl-${i}`}
          x={xScale(i)}
          y={height - 6}
          textAnchor="middle"
          fontSize="9"
          className="fill-ink-500 dark:fill-ink-400"
        >
          {fmtDate(points[i].x)}
        </text>
      ))}
    </svg>
  );
}

function Sparkline({
  values,
  width,
  height,
}: {
  values: number[];
  width: number;
  height: number;
}) {
  if (values.length < 2) {
    return (
      <p className="text-[10px] text-ink-400 dark:text-ink-500">Need 2+ snapshots</p>
    );
  }
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const yScale = (v: number) => pad + (innerH * (100 - Math.max(0, Math.min(100, v)))) / 100;
  const xScale = (i: number) => pad + (innerW * i) / (values.length - 1);
  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`)
    .join(" ");
  const last = values[values.length - 1];
  const first = values[0];
  const trend = last >= first ? "#10b981" : "#ef4444";
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Trend sparkline">
      <path d={path} stroke={trend} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xScale(values.length - 1)} cy={yScale(last)} r={2} fill={trend} />
    </svg>
  );
}
