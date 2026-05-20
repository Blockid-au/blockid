"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  DollarSign,
  Loader2,
  Percent,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DilutionRow {
  name: string;
  role: string;
  sharesBefore: number;
  pctBefore: number;
  sharesAfter: number;
  pctAfter: number;
  dilutionPct: number;
}

interface NewCapTable {
  shareholders: DilutionRow[];
  newInvestorBlock: { name: string; shares: number; pct: number };
  esop: { shares: number; pctBefore: number; pctAfter: number } | null;
  totalSharesAfter: number;
}

interface SavedRound {
  id: string;
  round_name: string;
  target_amount: number;
  pre_money_valuation: number;
  instrument_type: string;
  safe_discount: number | null;
  safe_cap: number | null;
  share_price: number;
  new_shares: number;
  dilution_pct: number;
  status: string;
  created_at: string;
}

type InstrumentType = "priced" | "safe" | "convertible_note";

const STEPS = [
  { label: "Round Basics", icon: DollarSign },
  { label: "Instrument", icon: TrendingUp },
  { label: "Dilution Impact", icon: Users },
  { label: "Confirm", icon: Check },
] as const;

const INSTRUMENT_OPTIONS: { value: InstrumentType; label: string; description: string }[] = [
  {
    value: "priced",
    label: "Priced Round",
    description: "Issue new shares at a fixed price per share. Standard for Series A+.",
  },
  {
    value: "safe",
    label: "SAFE",
    description: "Simple Agreement for Future Equity. Converts at a later priced round.",
  },
  {
    value: "convertible_note",
    label: "Convertible Note",
    description: "Debt instrument that converts to equity. Includes interest and maturity date.",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FundraiseClient() {
  const [step, setStep] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Form state
  const [roundName, setRoundName] = React.useState("Pre-Seed");
  const [targetAmount, setTargetAmount] = React.useState<number>(500_000);
  const [preMoneyValuation, setPreMoneyValuation] = React.useState<number>(2_000_000);
  const [instrumentType, setInstrumentType] = React.useState<InstrumentType>("priced");
  const [safeDiscount, setSafeDiscount] = React.useState<number>(20);
  const [safeCap, setSafeCap] = React.useState<number>(5_000_000);

  // Result state
  const [dilutionTable, setDilutionTable] = React.useState<DilutionRow[] | null>(null);
  const [newCapTable, setNewCapTable] = React.useState<NewCapTable | null>(null);
  const [savedRound, setSavedRound] = React.useState<SavedRound | null>(null);

  // Past rounds
  const [pastRounds, setPastRounds] = React.useState<SavedRound[]>([]);
  const [loadingRounds, setLoadingRounds] = React.useState(true);

  // Load past rounds on mount
  React.useEffect(() => {
    fetch("/api/fundraise")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setPastRounds(data.rounds ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingRounds(false));
  }, []);

  // Calculate dilution preview (step 2 -> step 3)
  async function calculateDilution() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fundraise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundName,
          targetAmount,
          preMoneyValuation,
          instrumentType,
          safeDiscount: instrumentType !== "priced" ? safeDiscount : undefined,
          safeCap: instrumentType !== "priced" ? safeCap : undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Failed to calculate round");
        return;
      }
      setDilutionTable(data.dilutionTable);
      setNewCapTable(data.newCapTable);
      setSavedRound(data.round);
      setStep(2);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleNext() {
    if (step === 1) {
      calculateDilution();
      return;
    }
    if (step === 2) {
      // Move to confirm
      setStep(3);
      return;
    }
    setStep((s) => Math.min(s + 1, 3));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function resetWizard() {
    setStep(0);
    setDilutionTable(null);
    setNewCapTable(null);
    setSavedRound(null);
    setError(null);
    // Reload past rounds
    fetch("/api/fundraise")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setPastRounds(data.rounds ?? []);
      })
      .catch(() => {});
  }

  function fmtAud(n: number) {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(n);
  }

  function fmtNum(n: number) {
    return new Intl.NumberFormat("en-AU").format(n);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink-900">Fundraise Modeller</h1>
        <p className="text-sm text-ink-500 mt-1">
          Model new fundraise rounds and see dilution impact on your cap table.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i === step;
          const done = i < step;
          return (
            <React.Fragment key={s.label}>
              {i > 0 && (
                <div className={cn("flex-1 h-px", done ? "bg-brand-400" : "bg-surface-200")} />
              )}
              <button
                type="button"
                onClick={() => {
                  if (done) setStep(i);
                }}
                disabled={!done && !active}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  active && "bg-brand-50 text-brand-700 border border-brand-200",
                  done && "bg-brand-500 text-white cursor-pointer",
                  !active && !done && "text-ink-400 bg-surface-50",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 0: Round Basics */}
      {step === 0 && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-surface-200 bg-white p-6 space-y-5">
            <h2 className="text-lg font-semibold text-ink-800">Round Basics</h2>

            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Round Name</label>
              <select
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
                className="w-full rounded-xl border border-surface-200 bg-surface-50 px-4 py-2.5 text-sm text-ink-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
              >
                <option>Pre-Seed</option>
                <option>Seed</option>
                <option>Series A</option>
                <option>Series B</option>
                <option>Bridge</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">
                Target Raise (AUD)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                <input
                  type="number"
                  min={1000}
                  step={10000}
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(Number(e.target.value))}
                  className="w-full rounded-xl border border-surface-200 bg-surface-50 pl-9 pr-4 py-2.5 text-sm text-ink-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">
                Pre-Money Valuation (AUD)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                <input
                  type="number"
                  min={10000}
                  step={100000}
                  value={preMoneyValuation}
                  onChange={(e) => setPreMoneyValuation(Number(e.target.value))}
                  className="w-full rounded-xl border border-surface-200 bg-surface-50 pl-9 pr-4 py-2.5 text-sm text-ink-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                />
              </div>
              <p className="text-xs text-ink-400 mt-1">
                Post-money = {fmtAud(preMoneyValuation + targetAmount)}
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors cursor-pointer"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Instrument Type */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-surface-200 bg-white p-6 space-y-5">
            <h2 className="text-lg font-semibold text-ink-800">Instrument Type</h2>

            <div className="grid gap-3">
              {INSTRUMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setInstrumentType(opt.value)}
                  className={cn(
                    "text-left rounded-xl border p-4 transition-all cursor-pointer",
                    instrumentType === opt.value
                      ? "border-brand-400 bg-brand-50 ring-2 ring-brand-100"
                      : "border-surface-200 bg-surface-50 hover:border-surface-300",
                  )}
                >
                  <div className="font-medium text-sm text-ink-800">{opt.label}</div>
                  <div className="text-xs text-ink-500 mt-0.5">{opt.description}</div>
                </button>
              ))}
            </div>

            {/* SAFE / Convertible fields */}
            {instrumentType !== "priced" && (
              <div className="space-y-4 pt-2 border-t border-surface-200">
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1">
                    Discount (%)
                  </label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                    <input
                      type="number"
                      min={0}
                      max={50}
                      step={5}
                      value={safeDiscount}
                      onChange={(e) => setSafeDiscount(Number(e.target.value))}
                      className="w-full rounded-xl border border-surface-200 bg-surface-50 pl-9 pr-4 py-2.5 text-sm text-ink-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1">
                    Valuation Cap (AUD)
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                    <input
                      type="number"
                      min={0}
                      step={100000}
                      value={safeCap}
                      onChange={(e) => setSafeCap(Number(e.target.value))}
                      className="w-full rounded-xl border border-surface-200 bg-surface-50 pl-9 pr-4 py-2.5 text-sm text-ink-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-2 rounded-xl border border-surface-200 px-5 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Calculating...
                </>
              ) : (
                <>
                  Calculate Dilution <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Dilution Impact */}
      {step === 2 && dilutionTable && newCapTable && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Share Price", value: `$${savedRound?.share_price?.toFixed(4) ?? "—"}` },
              { label: "New Shares", value: fmtNum(newCapTable.newInvestorBlock.shares) },
              { label: "Dilution", value: `${savedRound?.dilution_pct ?? "—"}%` },
              { label: "Post-Money", value: fmtAud(preMoneyValuation + targetAmount) },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-surface-200 bg-white p-4 text-center"
              >
                <div className="text-xs text-ink-500">{card.label}</div>
                <div className="text-lg font-bold text-ink-800 mt-1">{card.value}</div>
              </div>
            ))}
          </div>

          {/* Before/After table */}
          <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-200">
              <h2 className="text-lg font-semibold text-ink-800">Dilution Impact</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-50 text-ink-600">
                    <th className="text-left px-4 py-3 font-medium">Shareholder</th>
                    <th className="text-left px-4 py-3 font-medium">Role</th>
                    <th className="text-right px-4 py-3 font-medium">Before (%)</th>
                    <th className="text-right px-4 py-3 font-medium">After (%)</th>
                    <th className="text-right px-4 py-3 font-medium">Dilution</th>
                  </tr>
                </thead>
                <tbody>
                  {dilutionTable.map((row, i) => (
                    <tr
                      key={i}
                      className="border-t border-surface-100 hover:bg-surface-50/50"
                    >
                      <td className="px-4 py-3 font-medium text-ink-800">{row.name}</td>
                      <td className="px-4 py-3 text-ink-500 capitalize">{row.role}</td>
                      <td className="px-4 py-3 text-right text-ink-700">{row.pctBefore}%</td>
                      <td className="px-4 py-3 text-right text-ink-700">{row.pctAfter}%</td>
                      <td className="px-4 py-3 text-right text-red-600">-{row.dilutionPct}%</td>
                    </tr>
                  ))}
                  {/* Investor block */}
                  <tr className="border-t border-surface-200 bg-brand-50/50">
                    <td className="px-4 py-3 font-medium text-brand-700">
                      {newCapTable.newInvestorBlock.name}
                    </td>
                    <td className="px-4 py-3 text-brand-600">investor</td>
                    <td className="px-4 py-3 text-right text-ink-400">—</td>
                    <td className="px-4 py-3 text-right font-medium text-brand-700">
                      {newCapTable.newInvestorBlock.pct}%
                    </td>
                    <td className="px-4 py-3 text-right text-brand-600">new</td>
                  </tr>
                  {/* ESOP */}
                  {newCapTable.esop && (
                    <tr className="border-t border-surface-100">
                      <td className="px-4 py-3 font-medium text-ink-600">ESOP Pool</td>
                      <td className="px-4 py-3 text-ink-500">reserved</td>
                      <td className="px-4 py-3 text-right text-ink-700">{newCapTable.esop.pctBefore}%</td>
                      <td className="px-4 py-3 text-right text-ink-700">{newCapTable.esop.pctAfter}%</td>
                      <td className="px-4 py-3 text-right text-red-600">
                        -{(newCapTable.esop.pctBefore - newCapTable.esop.pctAfter).toFixed(2)}%
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-2 rounded-xl border border-surface-200 px-5 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors cursor-pointer"
            >
              Review & Confirm <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && savedRound && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-green-900">Round Created</h2>
                <p className="text-sm text-green-700">
                  Your {savedRound.round_name} round has been saved as a draft.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <div className="text-xs text-green-700">Round</div>
                <div className="font-medium text-green-900">{savedRound.round_name}</div>
              </div>
              <div>
                <div className="text-xs text-green-700">Target Raise</div>
                <div className="font-medium text-green-900">{fmtAud(Number(savedRound.target_amount))}</div>
              </div>
              <div>
                <div className="text-xs text-green-700">Pre-Money Valuation</div>
                <div className="font-medium text-green-900">{fmtAud(Number(savedRound.pre_money_valuation))}</div>
              </div>
              <div>
                <div className="text-xs text-green-700">Instrument</div>
                <div className="font-medium text-green-900 capitalize">
                  {savedRound.instrument_type.replace("_", " ")}
                </div>
              </div>
              <div>
                <div className="text-xs text-green-700">Share Price</div>
                <div className="font-medium text-green-900">${savedRound.share_price}</div>
              </div>
              <div>
                <div className="text-xs text-green-700">Dilution</div>
                <div className="font-medium text-green-900">{savedRound.dilution_pct}%</div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={resetWizard}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors cursor-pointer"
          >
            Model Another Round
          </button>
        </div>
      )}

      {/* Past Rounds */}
      {pastRounds.length > 0 && step === 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-ink-800 mb-4">Past Rounds</h2>
          <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-50 text-ink-600">
                    <th className="text-left px-4 py-3 font-medium">Round</th>
                    <th className="text-right px-4 py-3 font-medium">Target</th>
                    <th className="text-right px-4 py-3 font-medium">Pre-Money</th>
                    <th className="text-left px-4 py-3 font-medium">Type</th>
                    <th className="text-right px-4 py-3 font-medium">Dilution</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {pastRounds.map((r) => (
                    <tr key={r.id} className="border-t border-surface-100 hover:bg-surface-50/50">
                      <td className="px-4 py-3 font-medium text-ink-800">{r.round_name}</td>
                      <td className="px-4 py-3 text-right text-ink-700">{fmtAud(Number(r.target_amount))}</td>
                      <td className="px-4 py-3 text-right text-ink-700">{fmtAud(Number(r.pre_money_valuation))}</td>
                      <td className="px-4 py-3 text-ink-500 capitalize">{r.instrument_type.replace("_", " ")}</td>
                      <td className="px-4 py-3 text-right text-ink-700">{r.dilution_pct}%</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            r.status === "draft" && "bg-amber-50 text-amber-700",
                            r.status === "active" && "bg-green-50 text-green-700",
                            r.status === "closed" && "bg-surface-100 text-ink-500",
                          )}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-500">
                        {new Date(r.created_at).toLocaleDateString("en-AU")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {loadingRounds && step === 0 && (
        <div className="mt-10 flex items-center gap-2 text-sm text-ink-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading past rounds...
        </div>
      )}
    </div>
  );
}
