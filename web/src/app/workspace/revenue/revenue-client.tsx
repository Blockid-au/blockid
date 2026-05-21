"use client";

import * as React from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MonthlyRevenue {
  month: string;
  revenue: number;
  refunds: number;
  net: number;
}

interface RevenueData {
  ok: boolean;
  revenue: {
    monthly: MonthlyRevenue[];
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

interface DividendPayout {
  name: string;
  role: string;
  shares: number;
  ownershipPct: number;
  grossDividend: number;
  frankingCredit: number;
  netDividend: number;
}

interface DividendData {
  ok: boolean;
  totalDividend: number;
  perShareDividend: number;
  payouts: DividendPayout[];
  frankingRate: number;
  retainedEarnings: number;
  distributionPct: number;
  netIncome: number;
}

interface DividendRecord {
  id: string;
  period: string;
  net_income: number;
  distribution_pct: number;
  total_dividend: number;
  created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function aud(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ─── SVG Revenue Line Chart ────────────────────────────────────────────────

function RevenueLineChart({ monthly }: { monthly: MonthlyRevenue[] }) {
  if (monthly.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-ink-500 text-sm">
        No monthly revenue data available yet.
      </div>
    );
  }

  const chartW = 680;
  const chartH = 200;
  const padding = { top: 10, right: 20, bottom: 30, left: 10 };
  const innerW = chartW - padding.left - padding.right;
  const innerH = chartH - padding.top - padding.bottom;

  const values = monthly.map((m) => m.net);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const points = monthly.map((m, i) => {
    const x = padding.left + (i / Math.max(monthly.length - 1, 1)) * innerW;
    const y = padding.top + innerH - ((m.net - minVal) / range) * innerH;
    return { x, y, month: m };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + innerH} L ${points[0].x} ${padding.top + innerH} Z`;

  return (
    <svg
      viewBox={`0 0 ${chartW} ${chartH}`}
      className="w-full"
      role="img"
      aria-label="Monthly revenue line chart"
    >
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map((frac) => {
        const y = padding.top + innerH * (1 - frac);
        return (
          <line
            key={frac}
            x1={padding.left}
            x2={chartW - padding.right}
            y1={y}
            y2={y}
            stroke="#e5e7eb"
            strokeWidth={0.5}
          />
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill="url(#revenueGradient)" opacity={0.15} />

      {/* Line */}
      <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points */}
      {points.map((p) => (
        <circle key={p.month.month} cx={p.x} cy={p.y} r={3.5} fill="#6366f1" stroke="white" strokeWidth={2} />
      ))}

      {/* Month labels */}
      {points.map((p) => (
        <text
          key={`label-${p.month.month}`}
          x={p.x}
          y={chartH - 4}
          textAnchor="middle"
          className="fill-ink-500"
          fontSize={10}
        >
          {p.month.month.slice(5)}
        </text>
      ))}

      {/* Gradient definition */}
      <defs>
        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold text-ink-800 mt-1">{value}</p>
      {sub && (
        <p className={`text-xs mt-1 ${trend === "up" ? "text-green-600" : trend === "down" ? "text-red-500" : "text-ink-500"}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Expense Bar ────────────────────────────────────────────────────────────

function ExpenseBar({
  label,
  amount,
  total,
  color,
}: {
  label: string;
  amount: number;
  total: number;
  color: string;
}) {
  const pctVal = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs text-ink-600 truncate">{label}</div>
      <div className="flex-1 h-5 bg-surface-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(pctVal, 100)}%` }}
        />
      </div>
      <div className="w-24 text-right text-xs tabular-nums text-ink-700 font-medium">
        {aud(amount)}
      </div>
      <div className="w-12 text-right text-xs tabular-nums text-ink-500">
        {pct(pctVal)}
      </div>
    </div>
  );
}

// ─── Main Client Component ──────────────────────────────────────────────────

export function RevenueClient() {
  const [revenue, setRevenue] = React.useState<RevenueData | null>(null);
  const [dividends, setDividends] = React.useState<DividendData | null>(null);
  const [history, setHistory] = React.useState<DividendRecord[]>([]);
  const [distPct, setDistPct] = React.useState(50);
  const [loading, setLoading] = React.useState(true);
  const [divLoading, setDivLoading] = React.useState(false);
  const [distributing, setDistributing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Manual entry form state
  const [entryMonth, setEntryMonth] = React.useState(
    new Date().toISOString().slice(0, 7),
  );
  const [entryAmount, setEntryAmount] = React.useState("");
  const [entrySource, setEntrySource] = React.useState("manual");
  const [entrySaving, setEntrySaving] = React.useState(false);
  const [entryMsg, setEntryMsg] = React.useState<string | null>(null);

  // Fetch revenue data
  const loadData = React.useCallback(async () => {
    try {
      const [revRes, histRes] = await Promise.all([
        fetch("/api/revenue"),
        fetch("/api/dividends"),
      ]);
      const revData = await revRes.json();
      const histData = await histRes.json();

      if (revData.ok) setRevenue(revData);
      else setError(revData.error ?? "Failed to load revenue data");

      if (histData.ok) setHistory(histData.dividends ?? []);
    } catch (err) {
      setError("Failed to connect to server");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  // Calculate dividends when slider changes
  const calculateDividends = React.useCallback(
    async (pctVal: number) => {
      if (!revenue) return;
      setDivLoading(true);
      try {
        const res = await fetch("/api/dividends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            distributionPct: pctVal,
            netIncome: revenue.pnl.netIncome,
          }),
        });
        const data = await res.json();
        if (data.ok) setDividends(data);
      } catch (err) {
        console.error("Dividend calc failed", err);
      } finally {
        setDivLoading(false);
      }
    },
    [revenue],
  );

  // Initial dividend calc when revenue loads
  React.useEffect(() => {
    if (revenue) calculateDividends(distPct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenue]);

  // Submit manual revenue entry
  async function handleManualEntry(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(entryAmount);
    if (isNaN(amount) || amount < 0) return;

    setEntrySaving(true);
    setEntryMsg(null);
    try {
      const res = await fetch("/api/revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: entryMonth, amount, source: entrySource }),
      });
      const data = await res.json();
      if (data.ok) {
        setEntryMsg(data.message ?? "Revenue entry saved.");
        setEntryAmount("");
        // Reload revenue data to reflect the new entry
        loadData();
      } else {
        setEntryMsg(data.error ?? "Failed to save entry.");
      }
    } catch {
      setEntryMsg("Failed to connect to server.");
    } finally {
      setEntrySaving(false);
    }
  }

  // Record dividend distribution
  async function handleDistribute() {
    if (!revenue || !dividends || dividends.totalDividend <= 0) return;
    setDistributing(true);
    try {
      const res = await fetch("/api/dividends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distributionPct: distPct,
          netIncome: revenue.pnl.netIncome,
          record: true,
          period: new Date().toISOString().slice(0, 7),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const histRes = await fetch("/api/dividends");
        const histData = await histRes.json();
        if (histData.ok) setHistory(histData.dividends ?? []);
      }
    } catch (err) {
      console.error("Distribution failed", err);
    } finally {
      setDistributing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !revenue) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{error ?? "Failed to load"}</p>
      </div>
    );
  }

  const { pnl } = revenue;
  const totalExpenses = revenue.costs.ai + (revenue.costs.hosting ?? 0) + (revenue.costs.marketing ?? 0);

  return (
    <div className="space-y-8">
      {/* ── Key Metrics Cards ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-ink-600 uppercase tracking-wide mb-3">
          Key Metrics
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="MRR"
            value={aud(revenue.revenue.mrr)}
            sub="Monthly recurring revenue"
          />
          <StatCard
            label="ARR"
            value={aud(revenue.revenue.arr)}
            sub="Annual recurring revenue"
          />
          <StatCard
            label="Monthly Growth"
            value={`${revenue.revenue.monthlyGrowthPct > 0 ? "+" : ""}${pct(revenue.revenue.monthlyGrowthPct)}`}
            sub="Month-over-month"
            trend={revenue.revenue.monthlyGrowthPct > 0 ? "up" : revenue.revenue.monthlyGrowthPct < 0 ? "down" : "neutral"}
          />
          <StatCard
            label="Gross Margin"
            value={pct(pnl.grossMarginPct)}
            sub={`Net income: ${aud(pnl.netIncome)}`}
            trend={pnl.netIncome >= 0 ? "up" : "down"}
          />
        </div>
      </section>

      {/* ── Revenue Line Chart ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-600 uppercase tracking-wide mb-4">
          Revenue Trend (12 months)
        </h2>
        <RevenueLineChart monthly={revenue.revenue.monthly} />
        <div className="flex items-center gap-4 mt-3 text-xs text-ink-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded bg-indigo-500" />
            Net Revenue
          </span>
          <span className="text-ink-400">
            Total: {aud(revenue.revenue.total)} | Refunds: {aud(revenue.revenue.refunds)}
          </span>
        </div>
      </section>

      {/* ── Expense Breakdown ──────────────────────────────────────────── */}
      <section className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-600 uppercase tracking-wide mb-4">
          Expense Breakdown
        </h2>
        <div className="space-y-3">
          <ExpenseBar
            label="AI API Costs"
            amount={revenue.costs.ai}
            total={totalExpenses}
            color="bg-violet-500"
          />
          <ExpenseBar
            label="Hosting / Infra"
            amount={revenue.costs.hosting ?? revenue.costs.infra}
            total={totalExpenses}
            color="bg-blue-500"
          />
          <ExpenseBar
            label="Marketing"
            amount={revenue.costs.marketing ?? 0}
            total={totalExpenses}
            color="bg-amber-500"
          />
        </div>
        <div className="mt-4 pt-3 border-t border-surface-200 flex items-center justify-between text-sm">
          <span className="font-medium text-ink-700">Net Income</span>
          <span className={`font-bold tabular-nums ${pnl.netIncome >= 0 ? "text-green-700" : "text-red-600"}`}>
            {aud(pnl.netIncome)}
          </span>
        </div>
      </section>

      {/* ── P&L Statement ──────────────────────────────────────────────── */}
      <section className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-600 uppercase tracking-wide mb-4">
          Profit & Loss Statement
        </h2>
        <table className="w-full text-sm">
          <tbody>
            <PnlRow label="Net Revenue" value={pnl.revenue} bold />
            <PnlRow
              label="Cost of Goods Sold (COGS)"
              value={-pnl.cogs}
              indent
              sub={`AI: ${aud(revenue.costs.ai)} | Infra: ${aud(revenue.costs.infra)}`}
            />
            <PnlRow
              label="Gross Margin"
              value={pnl.grossMargin}
              bold
              highlight
              sub={`${pct(pnl.grossMarginPct)} margin`}
            />
            <PnlRow
              label="Operating Expenses"
              value={-pnl.opex}
              indent
              sub={`${aud(pnl.monthlyOpex)}/month`}
            />
            <PnlRow
              label="Net Income"
              value={pnl.netIncome}
              bold
              highlight
              className={pnl.netIncome >= 0 ? "text-green-700" : "text-red-600"}
            />
          </tbody>
        </table>
      </section>

      {/* ── Data Connectors ────────────────────────────────────────────── */}
      <section className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-600 uppercase tracking-wide mb-4">
          Data Sources
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`rounded-xl border p-4 ${revenue.hasStripe ? "border-green-200 bg-green-50" : "border-surface-200"}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`h-2 w-2 rounded-full ${revenue.hasStripe ? "bg-green-500" : "bg-surface-300"}`} />
              <span className="text-sm font-medium text-ink-700">Stripe</span>
            </div>
            <p className="text-xs text-ink-500 mb-3">
              {revenue.hasStripe
                ? "Connected — auto-importing charges and subscriptions."
                : "Auto-import revenue from Stripe payments."}
            </p>
            {!revenue.hasStripe && (
              <a
                href="/api/auth/stripe/connect"
                className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
              >
                Connect Stripe
              </a>
            )}
          </div>
          <div className="rounded-xl border border-surface-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 rounded-full bg-surface-300" />
              <span className="text-sm font-medium text-ink-700">Xero</span>
            </div>
            <p className="text-xs text-ink-500 mb-3">
              Auto-import P&L, invoices, and expenses from Xero.
            </p>
            <button
              type="button"
              disabled
              className="inline-flex h-8 items-center rounded-lg bg-surface-100 px-3 text-xs font-medium text-ink-400 cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>
          <div className="rounded-xl border border-surface-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 rounded-full bg-surface-300" />
              <span className="text-sm font-medium text-ink-700">QuickBooks</span>
            </div>
            <p className="text-xs text-ink-500 mb-3">
              Sync revenue and expense data from QuickBooks.
            </p>
            <button
              type="button"
              disabled
              className="inline-flex h-8 items-center rounded-lg bg-surface-100 px-3 text-xs font-medium text-ink-400 cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>
        </div>
      </section>

      {/* ── Manual Revenue Entry ───────────────────────────────────────── */}
      <section className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-600 uppercase tracking-wide mb-4">
          Manual Revenue Entry
        </h2>
        <form onSubmit={handleManualEntry} className="flex flex-col sm:flex-row items-end gap-3">
          <div className="flex-1 w-full">
            <label htmlFor="rev-month" className="block text-xs font-medium text-ink-600 mb-1">
              Month
            </label>
            <input
              id="rev-month"
              type="month"
              value={entryMonth}
              onChange={(e) => setEntryMonth(e.target.value)}
              className="w-full h-9 rounded-lg border border-surface-200 px-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            />
          </div>
          <div className="flex-1 w-full">
            <label htmlFor="rev-amount" className="block text-xs font-medium text-ink-600 mb-1">
              Amount (AUD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">$</span>
              <input
                id="rev-amount"
                type="number"
                min="0"
                step="0.01"
                value={entryAmount}
                onChange={(e) => setEntryAmount(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full h-9 rounded-lg border border-surface-200 pl-7 pr-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
              />
            </div>
          </div>
          <div className="w-full sm:w-36">
            <label htmlFor="rev-source" className="block text-xs font-medium text-ink-600 mb-1">
              Source
            </label>
            <select
              id="rev-source"
              value={entrySource}
              onChange={(e) => setEntrySource(e.target.value)}
              className="w-full h-9 rounded-lg border border-surface-200 px-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors bg-white"
            >
              <option value="manual">Manual</option>
              <option value="stripe">Stripe</option>
              <option value="xero">Xero</option>
              <option value="invoice">Invoice</option>
              <option value="other">Other</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={entrySaving || !entryAmount}
            className="h-9 px-5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            {entrySaving ? "Saving..." : "Add Revenue"}
          </button>
        </form>
        {entryMsg && (
          <p className="mt-2 text-xs text-ink-600">{entryMsg}</p>
        )}
      </section>

      {/* ── Dividend Calculator ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-600 uppercase tracking-wide mb-4">
          Dividend Calculator
        </h2>

        {pnl.netIncome <= 0 ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            Dividends can only be distributed when there is positive net income.
            Current net income: {aud(pnl.netIncome)}.
          </div>
        ) : (
          <>
            {/* Distribution slider */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="dist-pct"
                  className="text-sm font-medium text-ink-700"
                >
                  Distribution Percentage
                </label>
                <span className="text-lg font-bold text-brand-700">
                  {distPct}%
                </span>
              </div>
              <input
                id="dist-pct"
                type="range"
                min={0}
                max={100}
                step={5}
                value={distPct}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setDistPct(val);
                  calculateDividends(val);
                }}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-surface-200 accent-brand-600"
              />
              <div className="flex justify-between text-xs text-ink-400 mt-1">
                <span>0% (retain all)</span>
                <span>100% (distribute all)</span>
              </div>
            </div>

            {/* Summary cards */}
            {dividends && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                <StatCard
                  label="Total Dividend"
                  value={aud(dividends.totalDividend)}
                />
                <StatCard
                  label="Retained Earnings"
                  value={aud(dividends.retainedEarnings)}
                />
                <StatCard
                  label="Per Share"
                  value={`$${dividends.perShareDividend.toFixed(6)}`}
                  sub="AUD per share"
                />
              </div>
            )}

            {/* Payout table */}
            {dividends && dividends.payouts.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-surface-200 text-left text-xs font-medium text-ink-500 uppercase tracking-wide">
                      <th className="py-2 pr-4">Shareholder</th>
                      <th className="py-2 pr-4 text-right">Shares</th>
                      <th className="py-2 pr-4 text-right">Ownership</th>
                      <th className="py-2 pr-4 text-right">Gross Dividend</th>
                      <th className="py-2 pr-4 text-right">
                        Franking Credit
                      </th>
                      <th className="py-2 text-right">Net Dividend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dividends.payouts.map((p) => (
                      <tr
                        key={p.name}
                        className="border-b border-surface-100"
                      >
                        <td className="py-2.5 pr-4">
                          <div className="font-medium text-ink-800">
                            {p.name}
                          </div>
                          <div className="text-xs text-ink-500">{p.role}</div>
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          {p.shares.toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          {pct(p.ownershipPct)}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums font-medium">
                          {aud(p.grossDividend)}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-green-700">
                          {aud(p.frankingCredit)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums font-semibold text-ink-800">
                          {aud(p.netDividend)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {divLoading && (
              <div className="text-center py-3 text-xs text-ink-500">
                Calculating...
              </div>
            )}

            {/* Franking credit note */}
            <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
              <strong>Franking Credits (AU):</strong> At a 30% corporate tax
              rate, fully franked dividends carry a franking credit of{" "}
              {aud(
                dividends
                  ? dividends.payouts.reduce(
                      (s, p) => s + p.frankingCredit,
                      0,
                    )
                  : 0,
              )}{" "}
              total. Shareholders can offset these against personal tax.
            </div>

            {/* Action buttons */}
            <div className="mt-5 flex items-center justify-between">
              <a
                href="/workspace/dividends"
                className="text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
              >
                Distribute via Blockchain &rarr;
              </a>
              <button
                type="button"
                onClick={handleDistribute}
                disabled={
                  distributing ||
                  !dividends ||
                  dividends.totalDividend <= 0
                }
                className="px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {distributing ? "Recording..." : "Record Distribution"}
              </button>
            </div>
          </>
        )}
      </section>

      {/* ── Dividend History ────────────────────────────────────────────── */}
      {history.length > 0 && (
        <section className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink-600 uppercase tracking-wide mb-4">
            Dividend History
          </h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-surface-200 text-left text-xs font-medium text-ink-500 uppercase tracking-wide">
                <th className="py-2 pr-4">Period</th>
                <th className="py-2 pr-4 text-right">Net Income</th>
                <th className="py-2 pr-4 text-right">Distribution %</th>
                <th className="py-2 text-right">Total Dividend</th>
              </tr>
            </thead>
            <tbody>
              {history.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-surface-100"
                >
                  <td className="py-2 pr-4 text-ink-700">{d.period}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {aud(d.net_income)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {d.distribution_pct}%
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {aud(d.total_dividend)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

// ─── P&L Row Component ──────────────────────────────────────────────────────

function PnlRow({
  label,
  value,
  bold,
  indent,
  highlight,
  sub,
  className,
}: {
  label: string;
  value: number;
  bold?: boolean;
  indent?: boolean;
  highlight?: boolean;
  sub?: string;
  className?: string;
}) {
  return (
    <tr
      className={
        highlight ? "border-t border-surface-300 bg-surface-50" : ""
      }
    >
      <td
        className={`py-2.5 ${indent ? "pl-6" : ""} ${bold ? "font-semibold" : ""} text-ink-700`}
      >
        {label}
        {sub && (
          <span className="block text-xs font-normal text-ink-400">
            {sub}
          </span>
        )}
      </td>
      <td
        className={`py-2.5 text-right tabular-nums ${bold ? "font-semibold" : ""} ${className ?? "text-ink-800"}`}
      >
        {aud(value)}
      </td>
    </tr>
  );
}
