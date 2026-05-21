"use client";

import * as React from "react";

// ---------------------------------------------------------------------------
// Chart colors — matches existing brand palette from cap-table-manager
// ---------------------------------------------------------------------------

const PIE_COLORS = [
  "#4f46e5", // brand/indigo
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#059669", // emerald
  "#d97706", // amber
  "#e11d48", // rose
  "#6366f1", // indigo lighter
  "#8b5cf6", // violet lighter
  "#14b8a6", // teal
  "#f97316", // orange
];

const UNALLOCATED_COLOR = "#e2e8f0"; // slate-200

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PieSlice {
  label: string;
  value: number; // percentage 0-100
  color?: string;
}

interface EquityPieProps {
  slices: PieSlice[];
  /** Whether to show unallocated remainder to 100% */
  showUnallocated?: boolean;
  /** Size in px (both width and height) */
  size?: number;
  /** Show labels underneath */
  showLegend?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EquityPie({
  slices,
  showUnallocated = true,
  size = 200,
  showLegend = true,
}: EquityPieProps) {
  // Assign colors to slices that don't have one
  const coloredSlices = slices.map((s, i) => ({
    ...s,
    color: s.color ?? PIE_COLORS[i % PIE_COLORS.length],
  }));

  // Calculate total and unallocated
  const total = coloredSlices.reduce((sum, s) => sum + s.value, 0);
  const unallocated = showUnallocated ? Math.max(0, 100 - total) : 0;

  // Build segments
  const segments: Array<{ label: string; pct: number; color: string }> = [];
  for (const s of coloredSlices) {
    if (s.value > 0) {
      segments.push({ label: s.label, pct: s.value, color: s.color });
    }
  }
  if (unallocated > 0) {
    segments.push({
      label: "Unallocated",
      pct: unallocated,
      color: UNALLOCATED_COLOR,
    });
  }

  // If nothing to show, render a full grey circle
  if (segments.length === 0) {
    segments.push({ label: "Unallocated", pct: 100, color: UNALLOCATED_COLOR });
  }

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.375; // ~75 for 200px
  const strokeWidth = size * 0.16; // ~32 for 200px
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {segments.map((seg, i) => {
          const dashLength = (seg.pct / 100) * circumference;
          const dashGap = circumference - dashLength;
          const offset = cumulativeOffset;
          cumulativeOffset += dashLength;

          return (
            <circle
              key={`${seg.label}-${i}`}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${dashGap}`}
              strokeDashoffset={-offset}
              className="transition-all duration-500"
            />
          );
        })}
      </svg>

      {/* Legend */}
      {showLegend && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 justify-center">
          {segments.map((seg, i) => (
            <div
              key={`${seg.label}-${i}`}
              className="flex items-center gap-1.5 text-xs text-ink-600"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="truncate max-w-[120px]">{seg.label}</span>
              <span className="font-medium text-ink-800">
                {seg.pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { PIE_COLORS, UNALLOCATED_COLOR };
