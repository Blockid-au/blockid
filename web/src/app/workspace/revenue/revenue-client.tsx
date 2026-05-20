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
    activeSubscriptions: number;
  };
  costs: {
    ai: number;
    infra: number;
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

// ─── SVG Bar Chart ──────────────────────────────────────────────────────────

function RevenueChart({ monthly }: { monthly: MonthlyRevenue[] }) {
  if (monthly.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-ink-500 text-sm">
        No monthly revenue data available yet.
      </div>
    );
  }

  const maxVal = Math.max(...monthly.map((m) => m.revenue), 1);
  const chartW = 680;
  const chartH = 200;
  const barGap = 6;
  const barW = Math.max(
    8,
    (chartW - barGap * (monthly.length + 1)) / monthly.length,
  );
  const labelH = 28;

  return (
    <svg
      viewBox={`0 0 ${chartW} ${chartH + labelH}`}
      className="w-full"
      role="img"
      aria-label="Monthly revenue bar chart"
    >
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map((frac) => (
        <line
          key={frac}
          x1={0}
          x2={chartW}
          y1={chartH * (1 - frac)}
          y2={chartH * (1 - frac)}
          stroke="#e5e7eb"
          strokeWidth={0.5}
        />
      ))}

      {monthly.map((m, i) => {
        const x = barGap + i * (barW + barGap);
        const barH = (m.revenue / maxVal) * chartH;
        const refundH = (m.refunds / maxVal) * chartH;
        const label = m.month.slice(5); // MM

        return (
          <g key={m.month}>
            {/* Revenue bar */}
            <rect
              x={x}
              y={chartH - barH}
              width={barW}
              height={Math.max(barH, 0)}
              rx={3}
              fill="#6366f1"
              opacity={0.85}
            />
            {/* Refund overlay */}
            {m.refunds > 0 && (
              <rect
                x={x}
                y={chartH - refundH}
                width={barW}
                height={Math.max(refundH, 0)}
                rx={3}
                fill="#ef4444"
                opacity={0.55}
              />
            )}
            {/* Month label */}
            <text
              x={x + barW / 2}
              y={chartH + 16}
              textAnchor="middle"
              className="fill-ink-500"
              fontSize={10}
            >
              {label}
            </text>
            {/* Value label on hover area */}
            {barH > 20 && (
              <text
                x={x + barW / 2}
                y={chartH - barH + 14}
                textAnchor="middle"
                className="fill-white"
                fontSize={9}
                fontWeight={600}
              >
                {aud(m.revenue)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold text-ink-800 mt-1">{value}</p>
      {sub && <p className="text-xs text-ink-500 mt-1">{sub}</p>}
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

  // Fetch revenue data on mount
  React.useEffect(() => {
    async function load() {
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
    }
    load();
  }, []);

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
        // Refresh history
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

  return (
    <div className="space-y-8">
      {/* ── Revenue Summary Cards ──────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-ink-600 uppercase tracking-wide mb-3">
          Revenue Summary
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="MRR"
            value={aud(revenue.revenue.mrr)}
            sub="Monthly recurring"
          />
          <StatCard
            label="ARR"
            value={aud(revenue.revenue.arr)}
            sub="Annual recurring"
          />
          <StatCard
            label="Total Revenue"
            value={aud(revenue.revenue.total)}
            sub="Last 12 months"
          />
          <StatCard
            label="Active Subs"
            value={String(revenue.revenue.activeSubscriptions)}
            sub="Current subscriptions"
          />
        </div>
      </section>

      {/* ── Monthly Revenue Chart ──────────────────────────────────────── */}
      <section className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-600 uppercase tracking-wide mb-4">
          Monthly Revenue (12 months)
        </h2>
        <RevenueChart monthly={revenue.revenue.monthly} />
        <div className="flex items-center gap-4 mt-3 text-xs text-ink-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded bg-indigo-500" />
            Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded bg-red-500 opacity-55" />
            Refunds
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

            {/* Distribute button */}
            <div className="mt-5 flex justify-end">
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
