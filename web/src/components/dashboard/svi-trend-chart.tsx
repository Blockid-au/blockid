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
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Snapshot {
  date: string;
  svi: number;
  delta: number | null;
  stage?: number;
}

interface HistoryResponse {
  ok: boolean;
  snapshots: Snapshot[];
  currentSVI: number | null;
  weekDelta: number;
  monthDelta: number;
}

export function SVITrendChart({ email }: { email: string }) {
  const [data, setData] = React.useState<HistoryResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/svi/history");
        if (!res.ok) throw new Error("fetch failed");
        const json = (await res.json()) as HistoryResponse;
        if (!cancelled) setData(json);
      } catch {
        // silently fail — chart just won't render
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [email]);

  if (loading) {
    return (
      <div className="mt-8 rounded-2xl border border-surface-200 bg-white p-6 shadow-sm animate-pulse">
        <div className="h-4 w-40 bg-surface-200 rounded mb-4" />
        <div className="h-[200px] bg-surface-100 rounded-xl" />
      </div>
    );
  }

  if (!data || !data.ok || data.currentSVI === null) {
    return null;
  }

  const { snapshots, currentSVI, monthDelta } = data;

  // No history yet — show a simple "new" card
  if (snapshots.length < 2) {
    return (
      <div className="mt-8 rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-ink-800">SVI Trend</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold font-mono text-brand-600">
            {Math.round(currentSVI)}
          </span>
          <span className="rounded-full bg-brand-50 border border-brand-200 px-2.5 py-0.5 text-xs font-medium text-brand-600">
            New — no prior data
          </span>
        </div>
        <p className="text-xs text-ink-500 mt-2">
          Your SVI trend will appear here after your next weekly snapshot.
        </p>
      </div>
    );
  }

  // Format dates for chart
  const chartData = snapshots.map((s) => ({
    date: new Date(s.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
    svi: Math.round(s.svi),
  }));

  const deltaColor = monthDelta > 0 ? "text-emerald-600" : monthDelta < 0 ? "text-red-600" : "text-ink-500";
  const DeltaIcon = monthDelta > 0 ? TrendingUp : monthDelta < 0 ? TrendingDown : Minus;

  return (
    <div className="mt-8 rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-ink-800">SVI Trend</h3>
        </div>
        <div className={cn("flex items-center gap-1.5 text-sm font-semibold", deltaColor)}>
          <DeltaIcon strokeWidth={2} className="h-4 w-4" />
          <span>
            {monthDelta > 0 ? "+" : ""}
            {Math.round(monthDelta)} points in 30 days
          </span>
        </div>
      </div>

      <div className="w-full h-[200px] sm:h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
            />
            <YAxis
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
              formatter={(value) => [`${value}`, "SVI Score"]}
            />
            <Line
              type="monotone"
              dataKey="svi"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ fill: "#2563eb", r: 3, strokeWidth: 0 }}
              activeDot={{ fill: "#2563eb", r: 5, strokeWidth: 2, stroke: "#fff" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
