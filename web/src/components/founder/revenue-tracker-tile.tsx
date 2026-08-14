"use client";

// 90-day Revenue Tracker tile — Phase 3.1.
//
// Renders total AUD revenue (last 90d), a sparkline of daily amounts, and a
// trend arrow vs the prior 90d window. Data source: GET /api/founder/revenue-90d
// which merges Stripe (payments) + GA4 (traffic). The tile fails safe — an
// unauthenticated / unconfigured backend returns empty defaults, and this
// component renders a "Connect Stripe" empty state instead of an error.

import * as React from "react";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp, TrendingDown, Minus, Zap } from "lucide-react";

interface RevenueByDay {
  date: string;
  amount_aud: number;
}

interface Ga4BySource {
  source: string;
  sessions: number;
}

interface Revenue90dResponse {
  ok: true;
  startup_id: string | null;
  window_days: number;
  stripe: {
    total_aud: number;
    by_day: RevenueByDay[];
    new_customers: number;
    arpu_aud: number;
    prior_total_aud: number;
    connected: boolean;
  };
  ga4: {
    sessions: number;
    conversions: number;
    conversion_rate: number;
    by_source: Ga4BySource[];
    connected: boolean;
  };
  combined: {
    revenue_per_session_aud: number;
    mrr_run_rate_aud: number;
    trend_pct: number | null;
  };
}

function formatAUD(n: number): string {
  if (n >= 1_000_000) return `A$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `A$${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000) return `A$${(n / 1_000).toFixed(1)}K`;
  return `A$${n.toFixed(n < 100 ? 2 : 0)}`;
}

function Skeleton() {
  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-5" data-testid="revenue-tile-skeleton">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 w-32 rounded bg-surface-100 animate-pulse" />
        <div className="h-3 w-16 rounded bg-surface-100 animate-pulse" />
      </div>
      <div className="h-8 w-40 rounded bg-surface-100 animate-pulse mb-3" />
      <div className="h-16 w-full rounded bg-surface-50 animate-pulse" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-surface-300 bg-white p-5">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="h-4 w-4 text-brand-500" />
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          90-day Revenue
        </p>
      </div>
      <p className="text-sm text-ink-700 mt-2">
        Connect Stripe to see live revenue from paying customers.
      </p>
      <Link
        href="/workspace/integrations"
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
      >
        Connect Stripe
      </Link>
      <p className="mt-3 text-[10px] text-ink-400">Powered by Stripe + GA4</p>
    </div>
  );
}

export function RevenueTrackerTile(): React.ReactElement {
  const [data, setData] = React.useState<Revenue90dResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const res = await fetch("/api/founder/revenue-90d", { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as Revenue90dResponse;
        if (!cancelled) setData(json);
      } catch {
        // Fail silently — tile shows empty state.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Skeleton />;
  if (!data || !data.stripe.connected) return <EmptyState />;

  const { stripe, ga4, combined } = data;
  const trend = combined.trend_pct;
  const trendUp = trend != null && trend > 0;
  const trendDown = trend != null && trend < 0;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-5" data-widget-id="revenue-90d">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          90-day Revenue
        </p>
        {trend != null && (
          <span
            className={
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold " +
              (trendUp
                ? "bg-emerald-50 text-emerald-700"
                : trendDown
                  ? "bg-red-50 text-red-600"
                  : "bg-surface-100 text-ink-500")
            }
          >
            {trendUp ? (
              <TrendingUp className="h-3 w-3" />
            ) : trendDown ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {trend > 0 ? "+" : ""}
            {trend.toFixed(1)}%
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-3 mb-3">
        <p className="text-3xl font-bold text-ink-900">{formatAUD(stripe.total_aud)}</p>
        <p className="text-xs text-ink-500">
          {stripe.new_customers} customer{stripe.new_customers === 1 ? "" : "s"}
        </p>
      </div>

      {stripe.by_day.length > 0 && (
        <div className="h-16 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stripe.by_day} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                cursor={{ stroke: "#94a3b8", strokeWidth: 1 }}
                formatter={(v) => formatAUD(Number(v) || 0)}
                labelFormatter={(label) => String(label ?? "")}
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
              />
              <Area
                type="monotone"
                dataKey="amount_aud"
                stroke="#2563EB"
                strokeWidth={1.5}
                fill="url(#revGrad)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-400">ARPU</p>
          <p className="text-sm font-semibold text-ink-800">{formatAUD(stripe.arpu_aud)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-400">MRR run-rate</p>
          <p className="text-sm font-semibold text-ink-800">
            {formatAUD(combined.mrr_run_rate_aud)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-400">Rev / session</p>
          <p className="text-sm font-semibold text-ink-800">
            {ga4.connected && ga4.sessions > 0
              ? `A$${combined.revenue_per_session_aud.toFixed(3)}`
              : "—"}
          </p>
        </div>
      </div>

      {ga4.connected && ga4.sessions > 0 && (
        <p className="mt-3 text-[10px] text-ink-500">
          {ga4.sessions.toLocaleString()} sessions ·{" "}
          {(ga4.conversion_rate * 100).toFixed(2)}% conv
        </p>
      )}

      <p className="mt-3 text-[10px] text-ink-400">Powered by Stripe + GA4</p>
    </div>
  );
}

export default RevenueTrackerTile;
