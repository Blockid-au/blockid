"use client";

import * as React from "react";
import {
  ArrowRightLeft,
  Building2,
  DollarSign,
  Landmark,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types (mirrors server ExitResult)
// ---------------------------------------------------------------------------

interface ShareholderPayout {
  name: string;
  role: string;
  shares: number;
  ownershipPct: number;
  grossPayout: number;
  cgtEstimate: number;
  netPayout: number;
}

interface ESOPExercise {
  totalValue: number;
  exerciseCost: number;
  netGain: number;
}

interface ExitScenario {
  method: string;
  exitValuation: number;
  exitMultiple?: number;
}

interface ExitResult {
  scenario: ExitScenario;
  totalProceeds: number;
  perShareValue: number;
  shareholderPayouts: ShareholderPayout[];
  liquidationPreference: number;
  esopExercise: ESOPExercise | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXIT_METHODS = [
  { value: "acquisition", label: "Acquisition", icon: Building2, desc: "Strategic buyer (5-15x)" },
  { value: "ipo", label: "IPO", icon: Landmark, desc: "Public listing (15-30x)" },
  { value: "secondary", label: "Secondary Sale", icon: ArrowRightLeft, desc: "Partial exit (3-8x)" },
  { value: "buyout", label: "Buyout", icon: Users, desc: "Management/LBO (2-5x)" },
] as const;

function formatAUD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Bar chart component (pure CSS, no dependencies)
// ---------------------------------------------------------------------------

function ScenarioBarChart({ scenarios }: { scenarios: ExitResult[] }) {
  if (scenarios.length === 0) return null;

  const maxValuation = Math.max(...scenarios.map((s) => s.scenario.exitValuation));

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-ink-800 mb-4">Scenario Comparison</h3>
      <div className="space-y-3">
        {scenarios.map((s) => {
          const pct = maxValuation > 0 ? (s.scenario.exitValuation / maxValuation) * 100 : 0;
          const colors = [
            "bg-blue-500",
            "bg-brand-500",
            "bg-emerald-500",
            "bg-amber-500",
          ];
          const colorIdx = scenarios.indexOf(s) % colors.length;

          return (
            <div key={s.scenario.exitMultiple} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink-700">
                  {s.scenario.exitMultiple}x Revenue
                </span>
                <span className="font-mono text-ink-600">
                  {formatAUD(s.scenario.exitValuation)}
                </span>
              </div>
              <div className="h-6 bg-surface-100 rounded-lg overflow-hidden">
                <div
                  className={cn("h-full rounded-lg transition-all duration-500", colors[colorIdx])}
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-ink-400">
                <span>{formatAUD(s.perShareValue)}/share</span>
                {s.liquidationPreference > 0 && (
                  <span className="text-amber-600">
                    Liq. pref: {formatAUD(s.liquidationPreference)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExitClient() {
  const [method, setMethod] = React.useState<string>("acquisition");
  const [valuation, setValuation] = React.useState<string>("5000000");
  const [customResult, setCustomResult] = React.useState<ExitResult | null>(null);
  const [scenarios, setScenarios] = React.useState<ExitResult[]>([]);
  const [annualRevenue, setAnnualRevenue] = React.useState<number>(0);
  const [revenueMultiple, setRevenueMultiple] = React.useState<number>(10);
  const [loading, setLoading] = React.useState(false);
  const [scenariosLoading, setScenariosLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Load pre-computed scenarios on mount
  React.useEffect(() => {
    async function loadScenarios() {
      setScenariosLoading(true);
      try {
        const res = await fetch("/api/exit-model");
        const data = await res.json();
        if (data.ok) {
          setScenarios(data.scenarios ?? []);
          setAnnualRevenue(data.annualRevenue ?? 0);
          // Set initial valuation based on 10x revenue
          if (data.annualRevenue > 0) {
            setValuation(String(data.annualRevenue * 10));
          }
        }
      } catch (err) {
        console.error("Failed to load scenarios:", err);
      } finally {
        setScenariosLoading(false);
      }
    }
    loadScenarios();
  }, []);

  // Update valuation when slider changes
  React.useEffect(() => {
    if (annualRevenue > 0) {
      setValuation(String(Math.round(annualRevenue * revenueMultiple)));
    }
  }, [revenueMultiple, annualRevenue]);

  async function handleCalculate(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(valuation);
    if (!val || val <= 0) return;

    setLoading(true);
    setError(null);
    setCustomResult(null);

    try {
      const res = await fetch("/api/exit-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, exitValuation: val, exitMultiple: revenueMultiple }),
      });
      const data = await res.json();
      if (data.ok) {
        setCustomResult(data.result);
      } else {
        setError(data.error ?? "Calculation failed");
      }
    } catch (err) {
      console.error("Exit model error:", err);
      setError("Failed to calculate exit scenario");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Scenario cards overview */}
      {!scenariosLoading && scenarios.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {EXIT_METHODS.map((m) => {
            const Icon = m.icon;
            const isActive = method === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-all cursor-pointer",
                  isActive
                    ? "border-brand-300 bg-brand-50 shadow-sm ring-1 ring-brand-100"
                    : "border-surface-200 bg-white hover:border-surface-300 hover:shadow-sm",
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center",
                    isActive ? "bg-brand-600 text-white" : "bg-surface-100 text-ink-500",
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className={cn("text-sm font-semibold", isActive ? "text-brand-700" : "text-ink-700")}>
                    {m.label}
                  </span>
                </div>
                <p className="text-[11px] text-ink-400">{m.desc}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Custom scenario form */}
      <div className="rounded-2xl border border-surface-200 bg-white p-5 space-y-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-800 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-brand-500" />
          Exit Calculator
        </h2>

        <form onSubmit={handleCalculate} className="space-y-5">
          {/* Revenue Multiple Slider */}
          {annualRevenue > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-ink-600">Revenue Multiple</label>
                <span className="text-sm font-bold text-brand-600">{revenueMultiple}x</span>
              </div>
              <input
                type="range"
                min="1"
                max="40"
                step="0.5"
                value={revenueMultiple}
                onChange={(e) => setRevenueMultiple(parseFloat(e.target.value))}
                className="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
              />
              <div className="flex justify-between text-[10px] text-ink-400 mt-1">
                <span>1x ({formatAUD(annualRevenue)})</span>
                <span>20x ({formatAUD(annualRevenue * 20)})</span>
                <span>40x ({formatAUD(annualRevenue * 40)})</span>
              </div>
            </div>
          )}

          {/* Valuation input */}
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">
              Exit Valuation (AUD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">$</span>
              <input
                type="number"
                value={valuation}
                onChange={(e) => {
                  setValuation(e.target.value);
                  // Update slider to match
                  if (annualRevenue > 0) {
                    const v = parseFloat(e.target.value);
                    if (v > 0) setRevenueMultiple(Math.round(v / annualRevenue * 10) / 10);
                  }
                }}
                placeholder="5000000"
                min="1"
                step="1"
                className="w-full pl-7 pr-3 py-2 rounded-xl border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
                required
              />
            </div>
            {annualRevenue > 0 && (
              <p className="text-[10px] text-ink-400 mt-1">
                Based on {formatAUD(annualRevenue)} ARR at {revenueMultiple}x multiple
              </p>
            )}
          </div>

          {/* Current ARR display */}
          {annualRevenue > 0 && (
            <div className="flex items-center gap-4 p-3 rounded-xl bg-surface-50 border border-surface-200">
              <div>
                <span className="text-[10px] text-ink-400">Current ARR</span>
                <p className="text-sm font-semibold text-ink-800">{formatAUD(annualRevenue)}</p>
              </div>
              <div>
                <span className="text-[10px] text-ink-400">At {revenueMultiple}x</span>
                <p className="text-sm font-semibold text-brand-600">
                  {formatAUD(annualRevenue * revenueMultiple)}
                </p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Calculating...
              </>
            ) : (
              "Calculate Exit"
            )}
          </button>
        </form>
      </div>

      {/* Custom result */}
      {customResult && <ExitResultCard result={customResult} />}

      {/* Bar chart comparison */}
      {!scenariosLoading && scenarios.length > 0 && (
        <ScenarioBarChart scenarios={scenarios} />
      )}

      {/* Pre-computed scenarios comparison */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-ink-800 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand-500" />
          Revenue Multiple Scenarios
          {annualRevenue > 0 && (
            <span className="text-xs font-normal text-ink-400">
              (based on {formatAUD(annualRevenue)} ARR)
            </span>
          )}
        </h2>

        {scenariosLoading ? (
          <div className="text-center py-8 text-sm text-ink-400">Loading scenarios...</div>
        ) : scenarios.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Users className="h-8 w-8 mx-auto text-ink-300" />
            <p className="text-sm text-ink-500">
              Set up your cap table first to see exit scenarios.
            </p>
            <p className="text-xs text-ink-400">
              Go to Ownership &amp; Equity to add shareholders and share classes.
            </p>
          </div>
        ) : (
          <>
            {/* Comparison cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {scenarios.map((s) => (
                <div
                  key={s.scenario.exitMultiple}
                  className="rounded-2xl border border-surface-200 bg-white p-4 text-center space-y-1"
                >
                  <div className="text-xs font-medium text-ink-400">
                    {s.scenario.exitMultiple}x Revenue
                  </div>
                  <div className="text-lg font-bold text-ink-800">
                    {formatAUD(s.scenario.exitValuation)}
                  </div>
                  <div className="text-[10px] text-ink-400">
                    {formatAUD(s.perShareValue)}/share
                  </div>
                  {s.liquidationPreference > 0 && (
                    <div className="text-[10px] text-amber-600">
                      Liq. pref: {formatAUD(s.liquidationPreference)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Full payout table for each scenario */}
            {scenarios.map((s) => (
              <ExitResultCard
                key={s.scenario.exitMultiple}
                result={s}
                compact
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExitResultCard
// ---------------------------------------------------------------------------

function ExitResultCard({
  result,
  compact = false,
}: {
  result: ExitResult;
  compact?: boolean;
}) {
  const { scenario, shareholderPayouts, esopExercise, liquidationPreference } = result;

  // Summary stats
  const totalGross = shareholderPayouts.reduce((s, p) => s + p.grossPayout, 0);
  const totalCGT = shareholderPayouts.reduce((s, p) => s + p.cgtEstimate, 0);
  const totalNet = shareholderPayouts.reduce((s, p) => s + p.netPayout, 0);

  return (
    <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-3 bg-surface-50 border-b border-surface-200 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-ink-800">
            {scenario.exitMultiple
              ? `${scenario.exitMultiple}x Revenue`
              : scenario.method.charAt(0).toUpperCase() + scenario.method.slice(1)}
          </span>
          <span className="ml-2 text-sm text-ink-500">
            {formatAUD(scenario.exitValuation)} valuation
          </span>
        </div>
        <div className="flex items-center gap-2">
          {liquidationPreference > 0 && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md font-medium">
              Liq. Pref: {formatAUD(liquidationPreference)}
            </span>
          )}
          {!compact && (
            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-md font-medium">
              Net: {formatAUD(totalNet)}
            </span>
          )}
        </div>
      </div>

      {/* Payout table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] text-ink-400 uppercase tracking-wider border-b border-surface-100">
              <th className="px-5 py-2 font-medium">Shareholder</th>
              <th className="px-3 py-2 font-medium">Role</th>
              {!compact && <th className="px-3 py-2 font-medium text-right">Shares</th>}
              <th className="px-3 py-2 font-medium text-right">Ownership</th>
              <th className="px-3 py-2 font-medium text-right">Gross Payout</th>
              <th className="px-3 py-2 font-medium text-right">Est. CGT</th>
              <th className="px-3 py-2 font-medium text-right">Net Payout</th>
            </tr>
          </thead>
          <tbody>
            {shareholderPayouts.map((p, i) => (
              <tr
                key={i}
                className="border-b border-surface-50 hover:bg-surface-50/50 transition-colors"
              >
                <td className="px-5 py-2.5 font-medium text-ink-800">{p.name}</td>
                <td className="px-3 py-2.5 text-ink-500 capitalize">{p.role}</td>
                {!compact && (
                  <td className="px-3 py-2.5 text-right font-mono text-ink-600">
                    {p.shares.toLocaleString()}
                  </td>
                )}
                <td className="px-3 py-2.5 text-right font-mono text-ink-600">
                  {p.ownershipPct.toFixed(1)}%
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-ink-700 font-medium">
                  {formatAUD(p.grossPayout)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-red-500">
                  -{formatAUD(p.cgtEstimate)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-green-700 font-semibold">
                  {formatAUD(p.netPayout)}
                </td>
              </tr>
            ))}
          </tbody>
          {/* Totals row */}
          {!compact && shareholderPayouts.length > 1 && (
            <tfoot>
              <tr className="border-t border-surface-200 bg-surface-50/50">
                <td className="px-5 py-2.5 font-semibold text-ink-800" colSpan={compact ? 2 : 3}>
                  Total
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-ink-500">100%</td>
                <td className="px-3 py-2.5 text-right font-mono text-ink-700 font-semibold">
                  {formatAUD(totalGross)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-red-500 font-medium">
                  -{formatAUD(totalCGT)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-green-700 font-bold">
                  {formatAUD(totalNet)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ESOP */}
      {esopExercise && esopExercise.netGain > 0 && (
        <div className="px-5 py-3 border-t border-surface-100 bg-surface-50/50 text-xs text-ink-500">
          <span className="font-medium text-ink-700">ESOP Pool:</span>{" "}
          Value {formatAUD(esopExercise.totalValue)} - Exercise cost{" "}
          {formatAUD(esopExercise.exerciseCost)} ={" "}
          <span className="font-semibold text-green-700">
            {formatAUD(esopExercise.netGain)} net gain
          </span>
        </div>
      )}
    </div>
  );
}
