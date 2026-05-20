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
  { value: "acquisition", label: "Acquisition", icon: Building2 },
  { value: "ipo", label: "IPO", icon: Landmark },
  { value: "secondary", label: "Secondary Sale", icon: ArrowRightLeft },
  { value: "buyout", label: "Buyout", icon: Users },
] as const;

function formatAUD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
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
        }
      } catch (err) {
        console.error("Failed to load scenarios:", err);
      } finally {
        setScenariosLoading(false);
      }
    }
    loadScenarios();
  }, []);

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
        body: JSON.stringify({ method, exitValuation: val }),
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
      {/* Custom scenario form */}
      <div className="rounded-2xl border border-surface-200 bg-white p-5 space-y-4 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-800 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-brand-500" />
          Custom Exit Scenario
        </h2>

        <form onSubmit={handleCalculate} className="space-y-4">
          {/* Method selector */}
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Exit Method</label>
            <div className="flex flex-wrap gap-2">
              {EXIT_METHODS.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer",
                      method === m.value
                        ? "bg-brand-600 text-white shadow-sm"
                        : "bg-surface-50 text-ink-600 border border-surface-200 hover:bg-surface-100",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

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
                onChange={(e) => setValuation(e.target.value)}
                placeholder="5000000"
                min="1"
                step="1"
                className="w-full pl-7 pr-3 py-2 rounded-xl border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
                required
              />
            </div>
          </div>

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
        {liquidationPreference > 0 && (
          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md font-medium">
            Liq. Pref: {formatAUD(liquidationPreference)}
          </span>
        )}
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
