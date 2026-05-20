"use client";

import * as React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SVIChartProps {
  snapshots: Array<{ date: string; svi: number; delta: number | null }>;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { month: "short", day: "numeric" });
}

export function SVIChart({ snapshots }: SVIChartProps) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  if (snapshots.length === 0) return null;

  // Chart dimensions
  const width = 600;
  const height = 200;
  const paddingLeft = 40;
  const paddingRight = 16;
  const paddingTop = 28;
  const paddingBottom = 28;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Data range — always 0-200 for SVI
  const yMin = 0;
  const yMax = 200;
  const yRange = yMax - yMin;

  // Map data to coordinates
  const points = snapshots.map((snap, i) => {
    const x = paddingLeft + (snapshots.length === 1 ? chartWidth / 2 : (i / (snapshots.length - 1)) * chartWidth);
    const y = paddingTop + chartHeight - ((snap.svi - yMin) / yRange) * chartHeight;
    return { x, y, ...snap };
  });

  // Build SVG path
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Build area path (fill below line)
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;

  // Y-axis ticks
  const yTicks = [0, 50, 100, 150, 200];

  // X-axis labels — show first, middle, last (or fewer if not enough data)
  const xLabelIndices: number[] = [];
  if (snapshots.length <= 3) {
    snapshots.forEach((_, i) => xLabelIndices.push(i));
  } else {
    xLabelIndices.push(0, Math.floor(snapshots.length / 2), snapshots.length - 1);
  }

  // Latest delta for badge
  const latest = snapshots[snapshots.length - 1];
  const weekDelta = latest?.delta ?? 0;
  const deltaPositive = weekDelta >= 0;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white px-6 py-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-700 font-medium">Score History</p>
        {weekDelta !== 0 && (
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold font-mono",
            deltaPositive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600",
          )}>
            {deltaPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {deltaPositive ? "+" : ""}{weekDelta} this week
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height: "200px" }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id="svi-fill-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-200, #c4b5fd)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--color-brand-100, #ede9fe)" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((tick) => {
          const y = paddingTop + chartHeight - ((tick - yMin) / yRange) * chartHeight;
          return (
            <g key={tick}>
              <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="var(--color-surface-200, #e5e7eb)" strokeWidth="1" />
              <text x={paddingLeft - 8} y={y + 3} textAnchor="end" className="fill-ink-700" fontSize="10" fontFamily="monospace">
                {tick}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#svi-fill-gradient)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="var(--color-brand-600, #7c3aed)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points */}
        {points.map((p, i) => (
          <g key={i}>
            {/* Invisible hit area */}
            <rect
              x={p.x - (chartWidth / snapshots.length) / 2}
              y={paddingTop}
              width={chartWidth / snapshots.length}
              height={chartHeight}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(i)}
            />
            {/* Visible dot */}
            <circle
              cx={p.x}
              cy={p.y}
              r={hoveredIndex === i ? 5 : 3}
              fill="white"
              stroke="var(--color-brand-600, #7c3aed)"
              strokeWidth="2"
            />
          </g>
        ))}

        {/* Tooltip */}
        {hoveredIndex !== null && points[hoveredIndex] && (() => {
          const p = points[hoveredIndex];
          const tooltipWidth = 90;
          let tx = p.x - tooltipWidth / 2;
          if (tx < paddingLeft) tx = paddingLeft;
          if (tx + tooltipWidth > width - paddingRight) tx = width - paddingRight - tooltipWidth;
          const ty = p.y - 38;
          return (
            <g>
              <rect x={tx} y={ty} width={tooltipWidth} height={30} rx="6" fill="var(--color-ink-800, #1f2937)" opacity="0.92" />
              <text x={tx + tooltipWidth / 2} y={ty + 13} textAnchor="middle" fill="white" fontSize="10" fontFamily="sans-serif">
                {formatDate(p.date)}
              </text>
              <text x={tx + tooltipWidth / 2} y={ty + 24} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="monospace">
                {p.svi} SVI {p.delta !== null ? (p.delta >= 0 ? `(+${p.delta})` : `(${p.delta})`) : ""}
              </text>
            </g>
          );
        })()}

        {/* X-axis labels */}
        {xLabelIndices.map((idx) => {
          const p = points[idx];
          if (!p) return null;
          return (
            <text key={idx} x={p.x} y={height - 4} textAnchor="middle" className="fill-ink-700" fontSize="10" fontFamily="sans-serif">
              {formatDate(p.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
