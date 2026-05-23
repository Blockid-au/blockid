"use client";

import * as React from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface Dimension {
  label: string;
  key: string;
  value: number;
}

export function SVIRadarChart({ dimensions }: { dimensions: Dimension[] }) {
  if (!dimensions || dimensions.length === 0) return null;

  const data = dimensions.map((d) => ({
    dimension: d.label,
    value: Math.round(Math.min(100, Math.max(0, d.value))),
  }));

  return (
    <div className="rounded-2xl border border-surface-200 bg-white px-4 py-6 shadow-sm my-6">
      <h3 className="text-sm font-semibold text-ink-800 text-center mb-4">
        SVI Dimension Breakdown
      </h3>
      <div className="w-full flex justify-center">
        <div className="w-[300px] h-[280px] sm:w-[400px] sm:h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis
                dataKey="dimension"
                tick={{ fill: "#475569", fontSize: 11 }}
                tickLine={false}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                tickCount={5}
                axisLine={false}
              />
              <Radar
                name="SVI Score"
                dataKey="value"
                stroke="#60a5fa"
                fill="#2563eb"
                fillOpacity={0.2}
                strokeWidth={2}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value) => [`${value}/100`, "Score"]}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
