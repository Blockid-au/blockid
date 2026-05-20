"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DataPoint {
  date: string;
  svi: number;
}

interface Props {
  data: DataPoint[];
  className?: string;
}

export function SVITrendChart({ data, className }: Props) {
  if (data.length < 2) {
    return (
      <div className={cn("rounded-2xl border border-surface-200 bg-white p-6 text-center", className)}>
        <p className="text-sm text-ink-500">Track your progress over time. Your chart will appear after your second analysis.</p>
      </div>
    );
  }

  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minSVI = Math.min(...data.map(d => d.svi)) - 10;
  const maxSVI = Math.max(...data.map(d => d.svi)) + 10;

  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartW,
    y: padding.top + chartH - ((d.svi - minSVI) / (maxSVI - minSVI)) * chartH,
    ...d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

  const latest = data[data.length - 1];
  const previous = data[data.length - 2];
  const delta = latest.svi - previous.svi;

  return (
    <div className={cn("rounded-2xl border border-surface-200 bg-white p-5", className)}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-800">SVI Trend</h3>
          <p className="text-xs text-ink-500">{data.length} snapshots</p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-ink-900">{latest.svi}</span>
          <span className={cn("ml-2 text-sm font-semibold", delta >= 0 ? "text-emerald-600" : "text-red-600")}>
            {delta >= 0 ? "+" : ""}{delta}
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = padding.top + chartH * (1 - pct);
          const val = Math.round(minSVI + (maxSVI - minSVI) * pct);
          return (
            <g key={pct}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{val}</text>
            </g>
          );
        })}
        {/* Area fill */}
        <path d={areaPath} fill="url(#sviTrendGradient)" />
        {/* Line */}
        <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 5 : 3} fill={i === points.length - 1 ? "#2563eb" : "white"} stroke="#2563eb" strokeWidth="2" />
        ))}
        {/* Date labels */}
        {points.filter((_, i) => i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 4) === 0).map((p, i) => (
          <text key={i} x={p.x} y={height - 5} textAnchor="middle" fontSize="9" fill="#94a3b8">
            {new Date(p.date).toLocaleDateString("en-AU", { month: "short", day: "numeric" })}
          </text>
        ))}
        <defs>
          <linearGradient id="sviTrendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
