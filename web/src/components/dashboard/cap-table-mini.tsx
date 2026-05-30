"use client";

interface ShareholderSlice {
  name: string;
  percentage: number;
  color: string;
}

interface CapTableMiniProps {
  shareholders: ShareholderSlice[];
  totalShares: number;
}

const DEFAULT_DATA: ShareholderSlice[] = [
  { name: "Founders", percentage: 100, color: "#2563EB" },
];

export function CapTableMini({ shareholders, totalShares }: CapTableMiniProps) {
  const data = shareholders.length > 0 ? shareholders : DEFAULT_DATA;
  const COLORS = ["#2563EB", "#F59E0B", "#10B981", "#8B5CF6", "#6B7280"];

  // SVG donut chart
  const size = 120;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulativePercent = 0;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-6">
      <h3 className="text-sm font-bold text-ink-800 mb-1">Cap Table Overview</h3>
      <p className="text-xs text-ink-500 mb-4">{totalShares.toLocaleString()} total shares</p>

      <div className="flex items-center gap-6">
        {/* Donut Chart */}
        <div className="relative shrink-0">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
            {data.map((slice, i) => {
              const offset = cumulativePercent;
              cumulativePercent += slice.percentage;
              const dashArray = `${(slice.percentage / 100) * circumference} ${circumference}`;
              const dashOffset = -(offset / 100) * circumference;

              return (
                <circle
                  key={slice.name}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={slice.color || COLORS[i % COLORS.length]}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  className="transition-all duration-500"
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-ink-800">100%</span>
            <span className="text-[9px] text-ink-500">Total</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2">
          {data.map((slice, i) => (
            <div key={slice.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: slice.color || COLORS[i % COLORS.length] }}
                />
                <span className="text-xs text-ink-700">{slice.name}</span>
              </div>
              <span className="text-xs font-semibold text-ink-800 tabular-nums">{slice.percentage.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      <a href="/workspace/cap-table" className="mt-4 inline-flex items-center text-xs font-medium text-brand-600 hover:text-brand-700">
        View Cap Table →
      </a>
    </div>
  );
}
