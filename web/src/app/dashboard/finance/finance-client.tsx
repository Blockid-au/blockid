"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  DollarSign,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface RevenueData {
  revenue: {
    monthly: Array<{ month: string; revenue: number; refunds: number; net: number }>;
    total: number;
    refunds: number;
    netRevenue: number;
    mrr: number;
    arr: number;
    monthlyGrowthPct: number;
    activeSubscriptions: number;
  };
  costs: {
    ai: number;
    infra: number;
    hosting: number;
    marketing: number;
    totalCogs: number;
    analysisCount: number;
  };
  pnl: {
    revenue: number;
    cogs: number;
    grossMargin: number;
    opex: number;
    monthlyOpex: number;
    netIncome: number;
    grossMarginPct: number;
  };
  metrics: {
    burnRate: number;
  };
  hasStripe: boolean;
  manualEntryCount: number;
}

interface Props {
  userEmail: string;
  startupName?: string;
}

/* ─── Formatters ─────────────────────────────────────────────────────────── */

function aud(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `A$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `A$${(v / 1_000).toFixed(1)}K`;
  return `A$${v.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

/* ─── Stat Card ──────────────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  sub,
  trend,
  trendUp,
  highlight,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: string;
  trendUp?: boolean;
  highlight?: "green" | "red" | "amber" | "blue";
  icon?: React.ElementType;
}) {
  const colorMap = {
    green: "border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/20",
    red: "border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20",
    amber: "border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20",
    blue: "border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/20",
  };
  const valueColor = {
    green: "text-emerald-700 dark:text-emerald-400",
    red: "text-red-700 dark:text-red-400",
    amber: "text-amber-700 dark:text-amber-400",
    blue: "text-blue-700 dark:text-blue-400",
  };

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-2",
      highlight ? colorMap[highlight] : "border-border bg-card"
    )}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className={cn(
        "text-2xl font-bold",
        highlight ? valueColor[highlight] : "text-foreground"
      )}>{value}</div>
      {(sub || trend) && (
        <div className="flex items-center gap-2">
          {trend && (
            <span className={cn(
              "flex items-center gap-0.5 text-xs font-semibold",
              trendUp === true ? "text-emerald-600" : trendUp === false ? "text-red-500" : "text-muted-foreground"
            )}>
              {trendUp === true ? <ArrowUpRight className="h-3 w-3" /> : trendUp === false ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {trend}
            </span>
          )}
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
      )}
    </div>
  );
}

/* ─── Revenue Bar Chart ──────────────────────────────────────────────────── */

function RevenueChart({ monthly }: { monthly: Array<{ month: string; revenue: number; net: number }> }) {
  const last6 = monthly.slice(-6);
  const max = Math.max(...last6.map((m) => m.revenue), 1);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Monthly Revenue (6 months)</h3>
      </div>
      {last6.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">No revenue data yet. Add your first entry below.</div>
      ) : (
        <div className="flex items-end gap-2 h-32">
          {last6.map((m) => {
            const h = Math.max(4, Math.round((m.revenue / max) * 100));
            return (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-muted-foreground font-medium">
                  {m.revenue > 0 ? aud(m.revenue) : "–"}
                </span>
                <div
                  className="w-full rounded-t bg-blue-500 dark:bg-blue-400 transition-all"
                  style={{ height: `${h}%` }}
                />
                <span className="text-[10px] text-muted-foreground">
                  {m.month.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Add Revenue Form ───────────────────────────────────────────────────── */

function AddRevenueForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState(() => new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || isNaN(Number(amount))) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, amount: Number(amount), source: "manual" }),
      });
      const data = await res.json() as { ok: boolean; message?: string; error?: string };
      if (data.ok) {
        setMsg(data.message ?? "Saved.");
        setAmount("");
        setOpen(false);
        onAdded();
      } else {
        setMsg(data.error ?? "Error saving.");
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Add Revenue Entry</h3>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Manual entry
        </button>
      </div>

      {!open && (
        <p className="text-xs text-muted-foreground">
          No Stripe? Log monthly revenue manually. Each entry updates your SVI score automatically.
        </p>
      )}

      {open && (
        <form onSubmit={submit} className="space-y-3 mt-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground block mb-1">Month</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground block mb-1">Revenue (AUD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 1500"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={loading || !amount}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Save & Update SVI
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
          {msg && <p className="text-xs text-emerald-600">{msg}</p>}
        </form>
      )}
    </div>
  );
}

/* ─── P&L Table ──────────────────────────────────────────────────────────── */

function PnLTable({ data }: { data: RevenueData }) {
  const { pnl, costs } = data;
  const rows: Array<{ label: string; value: number; indent?: boolean; bold?: boolean; negative?: boolean; positive?: boolean }> = [
    { label: "Net Revenue (12m)", value: pnl.revenue, bold: true, positive: pnl.revenue > 0 },
    { label: "Cost of Goods (AI + Infra)", value: -costs.totalCogs, indent: true, negative: costs.totalCogs > 0 },
    { label: "Gross Margin", value: pnl.grossMargin, bold: true, positive: pnl.grossMargin > 0, negative: pnl.grossMargin < 0 },
    { label: "Operating Expenses (est.)", value: -pnl.opex, indent: true, negative: true },
    { label: "Net Income", value: pnl.netIncome, bold: true, positive: pnl.netIncome > 0, negative: pnl.netIncome < 0 },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold mb-4">P&L Summary (trailing 12 months)</h3>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className={cn("py-2", r.indent && "pl-4 text-muted-foreground text-xs")}>
                {r.bold ? <strong>{r.label}</strong> : r.label}
              </td>
              <td className={cn(
                "py-2 text-right font-mono font-semibold",
                r.positive && r.value > 0 ? "text-emerald-600" : "",
                r.negative && r.value < 0 ? "text-red-500" : "",
              )}>
                {r.value < 0 ? `(${aud(Math.abs(r.value))})` : aud(r.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {pnl.grossMarginPct > 0 && (
        <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
          Gross margin: <span className="font-semibold text-emerald-600">{pnl.grossMarginPct.toFixed(1)}%</span>
          {" · "}Monthly opex: <span className="font-semibold">{aud(pnl.monthlyOpex)}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Main Dashboard ─────────────────────────────────────────────────────── */

export function FinanceDashboardClient({ userEmail, startupName }: Props) {
  const [data, setData] = React.useState<RevenueData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/revenue");
      const json = await res.json() as RevenueData & { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        setError((json as { error?: string }).error ?? "Failed to load data.");
        return;
      }
      setData(json);
    } catch {
      setError("Network error loading finance data.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const runway = React.useMemo(() => {
    if (!data) return null;
    const burn = data.metrics.burnRate || data.pnl.monthlyOpex;
    if (burn <= 0) return null;
    if (data.revenue.mrr >= burn) return 999; // profitable
    return null; // pre-revenue, unknown runway without cash balance
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-3">
        <XCircle className="h-10 w-10 text-red-400 mx-auto" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <button onClick={() => void load()} className="text-xs text-blue-600 hover:underline">Retry</button>
      </div>
    );
  }

  const d = data!;
  const mrr = d.revenue.mrr;
  const arr = d.revenue.arr;
  const burn = d.metrics.burnRate || d.pnl.monthlyOpex;
  const growthPct = d.revenue.monthlyGrowthPct;
  const isGrowing = growthPct > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-emerald-600" />
            Finance Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {startupName ?? userEmail} · Real-time P&L scoreboard
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {!d.hasStripe && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-400">Stripe not connected</p>
            <p className="text-amber-700 dark:text-amber-500 text-xs mt-0.5">
              Connect Stripe for automatic revenue tracking. Until then, use manual entries below.
              <a href="/dashboard/integrations" className="ml-1 underline">Connect now →</a>
            </p>
          </div>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="MRR"
          value={mrr > 0 ? aud(mrr) : "A$0"}
          sub={mrr > 0 ? "Monthly recurring" : "No recurring revenue yet"}
          trend={growthPct !== 0 ? pct(growthPct) : undefined}
          trendUp={isGrowing}
          highlight={mrr > 0 ? "green" : undefined}
          icon={TrendingUp}
        />
        <StatCard
          label="ARR"
          value={arr > 0 ? aud(arr) : "A$0"}
          sub="Annualised run rate"
          highlight={arr > 0 ? "green" : undefined}
          icon={BarChart3}
        />
        <StatCard
          label="Monthly Burn"
          value={burn > 0 ? aud(burn) : "A$0"}
          sub={burn > 0 ? "Monthly opex estimate" : "Enter burn rate below"}
          highlight={burn > 5000 ? "amber" : undefined}
          icon={TrendingDown}
        />
        <StatCard
          label="Runway"
          value={runway === 999 ? "∞" : runway !== null ? `${runway.toFixed(0)}mo` : "Unknown"}
          sub={runway === 999 ? "Profitable 🎉" : "Add cash balance in metrics"}
          highlight={runway === 999 ? "green" : undefined}
          icon={Wallet}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Gross Margin"
          value={d.pnl.grossMarginPct > 0 ? `${d.pnl.grossMarginPct.toFixed(1)}%` : "—"}
          sub="Revenue minus COGS"
          highlight={d.pnl.grossMarginPct > 60 ? "green" : d.pnl.grossMarginPct > 0 ? "blue" : undefined}
          icon={DollarSign}
        />
        <StatCard
          label="Paying Customers"
          value={d.revenue.activeSubscriptions > 0 ? String(d.revenue.activeSubscriptions) : `${d.manualEntryCount} entries`}
          sub={d.hasStripe ? "Active Stripe subscriptions" : "Manual revenue entries"}
          icon={CheckCircle2}
        />
        <StatCard
          label="Net Revenue (12m)"
          value={d.pnl.revenue > 0 ? aud(d.pnl.revenue) : "A$0"}
          sub="After refunds"
          highlight={d.pnl.revenue > 0 ? "blue" : undefined}
          icon={DollarSign}
        />
        <StatCard
          label="Net Income (12m)"
          value={aud(Math.abs(d.pnl.netIncome))}
          sub={d.pnl.netIncome >= 0 ? "Profitable" : "Pre-profit"}
          highlight={d.pnl.netIncome >= 0 ? "green" : "red"}
          icon={d.pnl.netIncome >= 0 ? TrendingUp : TrendingDown}
          trendUp={d.pnl.netIncome >= 0}
        />
      </div>

      {/* Charts & P&L */}
      <div className="grid md:grid-cols-2 gap-4">
        <RevenueChart monthly={d.revenue.monthly} />
        <PnLTable data={d} />
      </div>

      {/* Add Revenue */}
      <AddRevenueForm onAdded={() => void load()} />

      {/* Cost Breakdown */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Cost Breakdown (AI-estimated)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            { label: "AI API costs", value: d.costs.ai },
            { label: "Infra / cloud", value: d.costs.infra },
            { label: "Hosting (est.)", value: d.costs.hosting },
            { label: "Marketing (est.)", value: d.costs.marketing },
          ].map((c) => (
            <div key={c.label} className="space-y-1">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="font-semibold">{aud(c.value)}<span className="text-xs text-muted-foreground font-normal">/yr</span></p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Based on {d.costs.analysisCount} SVI analyses run. Connect Xero or upload P&L to improve accuracy.
        </p>
      </div>

      {/* Footer */}
      <div className="text-xs text-muted-foreground text-center pb-4">
        Finance data auto-refreshes daily · Stripe-connected revenue is real-time · Manual entries update SVI immediately
      </div>
    </div>
  );
}
