"use client";

import type { VestingSnapshot } from "@/lib/vesting";

interface VestingChartProps {
  timeline: VestingSnapshot[];
  currentMonth: number;
  cliffMonth: number;
}

export function VestingChart({
  timeline,
  currentMonth,
  cliffMonth,
}: VestingChartProps) {
  if (timeline.length < 2) {
    return (
      <div className="rounded-xl border border-surface-200 bg-surface-50 p-6 text-center">
        <p className="text-sm text-ink-500">
          Not enough data to render the vesting chart.
        </p>
      </div>
    );
  }

  // Chart dimensions
  const width = 640;
  const height = 240;
  const padL = 48;
  const padR = 16;
  const padT = 24;
  const padB = 36;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const totalMonths = timeline[timeline.length - 1].month;
  const maxPct = 100;

  // Map data to SVG coords
  const xAt = (month: number) => padL + (month / totalMonths) * chartW;
  const yAt = (pct: number) => padT + chartH - (pct / maxPct) * chartH;

  // Determine where "now" is
  const clampedCurrent = Math.min(Math.max(currentMonth, 0), totalMonths);
  const currentSnap = timeline.find((s) => s.month >= clampedCurrent) ?? timeline[timeline.length - 1];

  // Split into past (solid) and future (dotted) at current month
  const pastPoints = timeline.filter((s) => s.month <= clampedCurrent);
  const futurePoints = timeline.filter((s) => s.month >= clampedCurrent);

  // Polyline for past (includes interpolation at current month)
  const pastPolyline = pastPoints
    .map((s) => `${xAt(s.month)},${yAt(s.percentVested)}`)
    .join(" ");

  // Polyline for future
  const futurePolyline = futurePoints
    .map((s) => `${xAt(s.month)},${yAt(s.percentVested)}`)
    .join(" ");

  // Filled area path (past)
  const areaPath = pastPoints.length > 0
    ? [
        `M ${xAt(pastPoints[0].month)},${yAt(pastPoints[0].percentVested)}`,
        ...pastPoints
          .slice(1)
          .map((s) => `L ${xAt(s.month)},${yAt(s.percentVested)}`),
        `L ${xAt(pastPoints[pastPoints.length - 1].month)},${yAt(0)}`,
        `L ${xAt(pastPoints[0].month)},${yAt(0)}`,
        "Z",
      ].join(" ")
    : "";

  // Y-axis labels (0%, 25%, 50%, 75%, 100%)
  const yLabels = [0, 25, 50, 75, 100];

  // X-axis labels — show every 12 months
  const xLabels: number[] = [];
  for (let m = 0; m <= totalMonths; m += 12) {
    xLabels.push(m);
  }
  if (xLabels[xLabels.length - 1] !== totalMonths) {
    xLabels.push(totalMonths);
  }

  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4 overflow-hidden">
      <p className="text-xs font-medium text-ink-600 uppercase tracking-wider mb-3">
        Vesting Timeline
      </p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="vestingFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B7DD8" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#3B7DD8" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y-axis grid lines */}
        {yLabels.map((pct) => (
          <g key={`y-${pct}`}>
            <line
              x1={padL}
              y1={yAt(pct)}
              x2={width - padR}
              y2={yAt(pct)}
              stroke="#E2E8F0"
              strokeWidth={1}
            />
            <text
              x={padL - 6}
              y={yAt(pct) + 4}
              textAnchor="end"
              className="fill-[#94A3B8]"
              style={{ fontSize: "10px" }}
            >
              {pct}%
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map((m) => (
          <text
            key={`x-${m}`}
            x={xAt(m)}
            y={height - 8}
            textAnchor="middle"
            className="fill-[#94A3B8]"
            style={{ fontSize: "10px" }}
          >
            {m}mo
          </text>
        ))}

        {/* Cliff line (dashed vertical) */}
        {cliffMonth > 0 && cliffMonth <= totalMonths && (
          <g>
            <line
              x1={xAt(cliffMonth)}
              y1={padT}
              x2={xAt(cliffMonth)}
              y2={padT + chartH}
              stroke="#D97706"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <text
              x={xAt(cliffMonth)}
              y={padT - 6}
              textAnchor="middle"
              className="fill-[#D97706]"
              style={{ fontSize: "9px", fontWeight: 600 }}
            >
              CLIFF
            </text>
          </g>
        )}

        {/* Filled area (past) */}
        {areaPath && (
          <path d={areaPath} fill="url(#vestingFill)" />
        )}

        {/* Past line (solid) */}
        {pastPolyline && (
          <polyline
            points={pastPolyline}
            fill="none"
            stroke="#3B7DD8"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Future line (dotted) */}
        {futurePolyline && (
          <polyline
            points={futurePolyline}
            fill="none"
            stroke="#3B7DD8"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.5}
          />
        )}

        {/* "You are here" marker */}
        {clampedCurrent >= 0 && clampedCurrent <= totalMonths && (
          <g>
            <circle
              cx={xAt(clampedCurrent)}
              cy={yAt(currentSnap.percentVested)}
              r={5}
              fill="#EF4444"
              stroke="#fff"
              strokeWidth={2}
            />
            <text
              x={xAt(clampedCurrent)}
              y={yAt(currentSnap.percentVested) - 10}
              textAnchor="middle"
              className="fill-[#EF4444]"
              style={{ fontSize: "9px", fontWeight: 600 }}
            >
              You are here
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
