"use client";

interface SVIChartProps {
  snapshots: Array<{ date: string; svi: number; delta: number | null }>;
}

export function SVIChart({ snapshots }: SVIChartProps) {
  if (snapshots.length < 2) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        <h3 className="text-base font-semibold text-ink-800 mb-4">SVI Score History</h3>
        <p className="text-sm text-ink-700">
          At least two weekly snapshots are needed to display the chart.
        </p>
      </div>
    );
  }

  // Chart dimensions
  const width = 600;
  const height = 200;
  const padding = 40;

  const values = snapshots.map((s) => s.svi);
  const minSVI = Math.min(...values) - 10;
  const maxSVI = Math.max(...values) + 10;
  const range = maxSVI - minSVI || 1;

  // Helpers to map data to SVG coordinates
  const xAt = (i: number) =>
    padding + (i / (snapshots.length - 1)) * (width - 2 * padding);
  const yAt = (svi: number) =>
    height - padding - ((svi - minSVI) / range) * (height - 2 * padding);

  // Polyline points
  const points = snapshots.map((s, i) => `${xAt(i)},${yAt(s.svi)}`).join(" ");

  // Gradient area path (filled area below the line)
  const areaPath = [
    `M ${xAt(0)},${yAt(snapshots[0].svi)}`,
    ...snapshots.slice(1).map((s, i) => `L ${xAt(i + 1)},${yAt(s.svi)}`),
    `L ${xAt(snapshots.length - 1)},${height - padding}`,
    `L ${xAt(0)},${height - padding}`,
    "Z",
  ].join(" ");

  // Y-axis grid lines (3-5 values evenly spaced)
  const gridCount = 4;
  const gridStep = range / gridCount;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) =>
    Math.round(minSVI + i * gridStep),
  );

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-6">
      <h3 className="text-base font-semibold text-ink-800 mb-4">
        SVI Score History
      </h3>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="SVI score line chart"
      >
        <defs>
          <linearGradient id="sviAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B7DD8" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#3B7DD8" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines + Y-axis labels */}
        {gridLines.map((val) => {
          const y = yAt(val);
          return (
            <g key={`grid-${val}`}>
              <line
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke="#E2E8F0"
                strokeWidth="0.5"
                strokeDasharray="4 3"
              />
              <text
                x={padding - 6}
                y={y + 3}
                textAnchor="end"
                fill="#94A3B8"
                fontSize="9"
                fontFamily="monospace"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* X-axis date labels (show first, middle, last) */}
        {snapshots.map((s, i) => {
          // Show label for first, last, and roughly evenly spaced in-between
          const show =
            i === 0 ||
            i === snapshots.length - 1 ||
            (snapshots.length > 4 &&
              i === Math.floor(snapshots.length / 2));
          if (!show) return null;
          const dateStr = new Date(s.date).toLocaleDateString("en-AU", {
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

        {/* Filled area under the line */}
        <path d={areaPath} fill="url(#sviAreaGrad)" />

        {/* Line path */}
        <polyline
          points={points}
          fill="none"
          stroke="#3B7DD8"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points */}
        {snapshots.map((s, i) => {
          const cx = xAt(i);
          const cy = yAt(s.svi);
          const isPositive = s.delta != null && s.delta >= 0;
          return (
            <g key={`point-${i}`}>
              {/* Outer ring for hover target */}
              <circle cx={cx} cy={cy} r="8" fill="transparent">
                <title>
                  {new Date(s.date).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  : SVI {s.svi}
                  {s.delta != null
                    ? ` (${s.delta >= 0 ? "+" : ""}${s.delta})`
                    : ""}
                </title>
              </circle>
              {/* Visible dot */}
              <circle
                cx={cx}
                cy={cy}
                r="4"
                fill={
                  s.delta == null
                    ? "#3B7DD8"
                    : isPositive
                      ? "#10B981"
                      : "#EF4444"
                }
                stroke="white"
                strokeWidth="1.5"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
