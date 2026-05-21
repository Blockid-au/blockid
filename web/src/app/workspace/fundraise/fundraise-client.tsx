"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Check,
  DollarSign,
  FileText,
  FolderOpen,
  Loader2,
  Percent,
  Plus,
  Trash2,
  TrendingUp,
  UserPlus,
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

interface InvestorAllocation {
  id: string;
  name: string;
  amount: number;
}

type InstrumentType = "priced" | "safe" | "convertible_note";

const STEPS = [
  { label: "Round Config", icon: DollarSign },
  { label: "Share Price", icon: Calculator },
  { label: "Investors", icon: UserPlus },
  { label: "Review", icon: Check },
] as const;

const INSTRUMENT_OPTIONS: { value: InstrumentType; label: string; description: string }[] = [
  {
    value: "safe",
    label: "SAFE",
    description: "Simple Agreement for Future Equity. Converts at a later priced round. Most common for pre-seed/seed.",
  },
  {
    value: "convertible_note",
    label: "Convertible Note",
    description: "Debt instrument that converts to equity. Includes interest and maturity date.",
  },
  {
    value: "priced",
    label: "Priced Round",
    description: "Issue new shares at a fixed price per share. Standard for Series A+.",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FundraiseClient() {
  const [step, setStep] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Step 1: Round Configuration
  const [roundName, setRoundName] = React.useState("Pre-Seed");
  const [targetAmount, setTargetAmount] = React.useState<number>(500_000);
  const [preMoneyValuation, setPreMoneyValuation] = React.useState<number>(2_000_000);
  const [instrumentType, setInstrumentType] = React.useState<InstrumentType>("safe");
  const [safeDiscount, setSafeDiscount] = React.useState<number>(20);
  const [safeCap, setSafeCap] = React.useState<number>(5_000_000);

  // Step 3: Investor Allocations
  const [investors, setInvestors] = React.useState<InvestorAllocation[]>([
    { id: "inv-1", name: "", amount: 0 },
  ]);

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

  // Computed values
  const postMoneyValuation = preMoneyValuation + targetAmount;
  const sharePrice = savedRound?.share_price ?? 0;
  const totalInvestorAmount = investors.reduce((s, inv) => s + (inv.amount || 0), 0);
  const remainingToAllocate = targetAmount - totalInvestorAmount;

  // Calculate dilution preview (step 1 -> step 2)
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
      setStep(1);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleNext() {
    if (step === 0) {
      calculateDilution();
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
    setInvestors([{ id: "inv-1", name: "", amount: 0 }]);
    // Reload past rounds
    fetch("/api/fundraise")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setPastRounds(data.rounds ?? []);
      })
      .catch(() => {});
  }

  function addInvestor() {
    setInvestors((prev) => [
      ...prev,
      { id: `inv-${Date.now()}`, name: "", amount: 0 },
    ]);
  }

  function removeInvestor(id: string) {
    setInvestors((prev) => prev.filter((inv) => inv.id !== id));
  }

  function updateInvestor(id: string, field: "name" | "amount", value: string | number) {
    setInvestors((prev) =>
      prev.map((inv) =>
        inv.id === id ? { ...inv, [field]: value } : inv,
      ),
    );
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
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
            <TrendingUp strokeWidth={1.5} className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink-900">Fundraise Wizard</h1>
            <p className="text-sm text-ink-500">
              Configure rounds, model dilution, allocate investors, and generate term sheets.
            </p>
          </div>
        </div>
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

      {/* ── Step 0: Round Configuration ──────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-surface-200 bg-white p-6 space-y-5">
            <h2 className="text-lg font-semibold text-ink-800">Step 1: Round Configuration</h2>

            <div className="grid sm:grid-cols-2 gap-4">
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
                  Instrument Type
                </label>
                <select
                  value={instrumentType}
                  onChange={(e) => setInstrumentType(e.target.value as InstrumentType)}
                  className="w-full rounded-xl border border-surface-200 bg-surface-50 px-4 py-2.5 text-sm text-ink-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                >
                  {INSTRUMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Instrument description */}
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-3">
              <p className="text-xs text-ink-600">
                {INSTRUMENT_OPTIONS.find((o) => o.value === instrumentType)?.description}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
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
              </div>
            </div>

            {/* SAFE / Convertible fields */}
            {instrumentType !== "priced" && (
              <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-surface-200">
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
              </div>
            )}

            {/* Quick summary */}
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-surface-200">
              <div className="text-center">
                <div className="text-xs text-ink-500">Post-Money</div>
                <div className="text-sm font-bold text-ink-800 mt-0.5">
                  {fmtAud(postMoneyValuation)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-ink-500">Investor Equity</div>
                <div className="text-sm font-bold text-ink-800 mt-0.5">
                  {((targetAmount / postMoneyValuation) * 100).toFixed(1)}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-ink-500">Implied Share Price</div>
                <div className="text-sm font-bold text-ink-800 mt-0.5">
                  TBD
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
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
                  Calculate Share Price <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: Share Price Calculator ────────────────────────────────── */}
      {step === 1 && dilutionTable && newCapTable && savedRound && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-surface-200 bg-white p-6 space-y-5">
            <h2 className="text-lg font-semibold text-ink-800">Step 2: Share Price Calculator</h2>

            {/* Price summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Share Price", value: `$${savedRound.share_price?.toFixed(4) ?? "—"}`, highlight: true },
                { label: "New Shares", value: fmtNum(newCapTable.newInvestorBlock.shares) },
                { label: "Dilution", value: `${savedRound.dilution_pct ?? "—"}%` },
                { label: "Post-Money", value: fmtAud(postMoneyValuation) },
              ].map((card) => (
                <div
                  key={card.label}
                  className={cn(
                    "rounded-xl border p-4 text-center",
                    card.highlight
                      ? "border-brand-200 bg-brand-50"
                      : "border-surface-200 bg-white",
                  )}
                >
                  <div className="text-xs text-ink-500">{card.label}</div>
                  <div className={cn(
                    "text-lg font-bold mt-1",
                    card.highlight ? "text-brand-700" : "text-ink-800",
                  )}>{card.value}</div>
                </div>
              ))}
            </div>

            {/* Calculation breakdown */}
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-4 space-y-2">
              <p className="text-xs font-semibold text-ink-700 uppercase tracking-wider">Calculation</p>
              <div className="space-y-1 text-sm text-ink-600">
                <div className="flex justify-between">
                  <span>Pre-money valuation</span>
                  <span className="font-medium text-ink-800">{fmtAud(preMoneyValuation)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Fully-diluted shares (before)</span>
                  <span className="font-medium text-ink-800">
                    {fmtNum(newCapTable.totalSharesAfter - newCapTable.newInvestorBlock.shares)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-surface-200 pt-1">
                  <span className="font-semibold">Price per share</span>
                  <span className="font-bold text-brand-700">
                    ${savedRound.share_price?.toFixed(4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Investment / price = new shares</span>
                  <span className="font-medium text-ink-800">
                    {fmtAud(targetAmount)} / ${savedRound.share_price?.toFixed(4)} = {fmtNum(savedRound.new_shares)}
                  </span>
                </div>
              </div>
            </div>

            {/* Dilution impact table */}
            <div>
              <p className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-3">
                Dilution Impact on Existing Shareholders
              </p>
              <div className="overflow-x-auto rounded-xl border border-surface-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-50 text-ink-600">
                      <th className="text-left px-4 py-2.5 font-medium">Shareholder</th>
                      <th className="text-left px-4 py-2.5 font-medium">Role</th>
                      <th className="text-right px-4 py-2.5 font-medium">Before</th>
                      <th className="text-right px-4 py-2.5 font-medium">After</th>
                      <th className="text-right px-4 py-2.5 font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dilutionTable.map((row, i) => (
                      <tr key={i} className="border-t border-surface-100 hover:bg-surface-50/50">
                        <td className="px-4 py-2.5 font-medium text-ink-800">{row.name}</td>
                        <td className="px-4 py-2.5 text-ink-500 capitalize">{row.role}</td>
                        <td className="px-4 py-2.5 text-right text-ink-700">{row.pctBefore}%</td>
                        <td className="px-4 py-2.5 text-right text-ink-700">{row.pctAfter}%</td>
                        <td className="px-4 py-2.5 text-right text-red-600">-{row.dilutionPct}%</td>
                      </tr>
                    ))}
                    <tr className="border-t border-surface-200 bg-brand-50/50">
                      <td className="px-4 py-2.5 font-medium text-brand-700">
                        {newCapTable.newInvestorBlock.name}
                      </td>
                      <td className="px-4 py-2.5 text-brand-600">investor</td>
                      <td className="px-4 py-2.5 text-right text-ink-400">--</td>
                      <td className="px-4 py-2.5 text-right font-medium text-brand-700">
                        {newCapTable.newInvestorBlock.pct}%
                      </td>
                      <td className="px-4 py-2.5 text-right text-brand-600">new</td>
                    </tr>
                    {newCapTable.esop && (
                      <tr className="border-t border-surface-100">
                        <td className="px-4 py-2.5 font-medium text-ink-600">ESOP Pool</td>
                        <td className="px-4 py-2.5 text-ink-500">reserved</td>
                        <td className="px-4 py-2.5 text-right text-ink-700">{newCapTable.esop.pctBefore}%</td>
                        <td className="px-4 py-2.5 text-right text-ink-700">{newCapTable.esop.pctAfter}%</td>
                        <td className="px-4 py-2.5 text-right text-red-600">
                          -{(newCapTable.esop.pctBefore - newCapTable.esop.pctAfter).toFixed(2)}%
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
              Allocate Investors <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Investor Allocation ──────────────────────────────────── */}
      {step === 2 && savedRound && newCapTable && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-surface-200 bg-white p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink-800">Step 3: Investor Allocation</h2>
              <div className="text-xs text-ink-500">
                Share price: <span className="font-bold text-brand-700">${sharePrice.toFixed(4)}</span>
              </div>
            </div>

            <p className="text-sm text-ink-600">
              Add investors and specify their investment amounts. BlockID will calculate shares and
              ownership percentage automatically.
            </p>

            {/* Investor rows */}
            <div className="space-y-3">
              {investors.map((inv, idx) => {
                const shares = sharePrice > 0 ? Math.round(inv.amount / sharePrice) : 0;
                const pct = newCapTable.totalSharesAfter > 0
                  ? ((shares / newCapTable.totalSharesAfter) * 100).toFixed(2)
                  : "0";
                return (
                  <div
                    key={inv.id}
                    className="rounded-xl border border-surface-200 bg-surface-50 p-4"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-semibold text-ink-500">
                        Investor {idx + 1}
                      </span>
                      {investors.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeInvestor(inv.id)}
                          className="ml-auto text-red-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 strokeWidth={1.75} className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid sm:grid-cols-4 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-ink-600 mb-1">
                          Investor Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Jane Smith"
                          value={inv.name}
                          onChange={(e) => updateInvestor(inv.id, "name", e.target.value)}
                          className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink-600 mb-1">
                          Amount (AUD)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={10000}
                          value={inv.amount || ""}
                          onChange={(e) => updateInvestor(inv.id, "amount", Number(e.target.value))}
                          className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink-600 mb-1">
                          Shares / Ownership
                        </label>
                        <div className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm">
                          <span className="text-ink-800 font-medium">{fmtNum(shares)}</span>
                          <span className="text-ink-400 mx-1">/</span>
                          <span className="text-brand-600 font-medium">{pct}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addInvestor}
              className="flex items-center gap-2 rounded-lg border border-dashed border-surface-300 px-4 py-2.5 text-xs font-medium text-ink-500 hover:text-brand-600 hover:border-brand-300 transition-colors cursor-pointer w-full justify-center"
            >
              <Plus strokeWidth={1.75} className="h-3.5 w-3.5" />
              Add Another Investor
            </button>

            {/* Allocation summary */}
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-ink-500">Allocated</div>
                  <div className={cn(
                    "text-sm font-bold mt-0.5",
                    totalInvestorAmount > targetAmount ? "text-red-600" : "text-ink-800",
                  )}>
                    {fmtAud(totalInvestorAmount)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-ink-500">Target Raise</div>
                  <div className="text-sm font-bold text-ink-800 mt-0.5">
                    {fmtAud(targetAmount)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-ink-500">Remaining</div>
                  <div className={cn(
                    "text-sm font-bold mt-0.5",
                    remainingToAllocate < 0
                      ? "text-red-600"
                      : remainingToAllocate === 0
                        ? "text-emerald-600"
                        : "text-amber-600",
                  )}>
                    {fmtAud(remainingToAllocate)}
                  </div>
                </div>
              </div>
              {totalInvestorAmount > targetAmount && (
                <p className="text-xs text-red-600 text-center mt-2">
                  Warning: Total allocation exceeds target raise amount.
                </p>
              )}
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
              Review & Generate <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review & Generate ────────────────────────────────────── */}
      {step === 3 && savedRound && (
        <div className="space-y-6">
          {/* Round summary */}
          <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-green-900">Round Summary</h2>
                <p className="text-sm text-green-700">
                  Your {savedRound.round_name} round has been saved as a draft.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
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

            {/* Investor allocations */}
            {investors.some((inv) => inv.name && inv.amount > 0) && (
              <div className="mt-5 pt-4 border-t border-green-200">
                <p className="text-xs font-semibold text-green-800 uppercase tracking-wider mb-3">
                  Investor Allocations
                </p>
                <div className="space-y-2">
                  {investors
                    .filter((inv) => inv.name && inv.amount > 0)
                    .map((inv) => {
                      const shares = sharePrice > 0 ? Math.round(inv.amount / sharePrice) : 0;
                      const pct = newCapTable && newCapTable.totalSharesAfter > 0
                        ? ((shares / newCapTable.totalSharesAfter) * 100).toFixed(2)
                        : "0";
                      return (
                        <div key={inv.id} className="flex items-center justify-between text-sm">
                          <span className="text-green-900 font-medium">{inv.name}</span>
                          <span className="text-green-700">
                            {fmtAud(inv.amount)} = {fmtNum(shares)} shares ({pct}%)
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Action CTAs */}
          <div className="grid sm:grid-cols-3 gap-3">
            <Link
              href="/workspace/data-room"
              className="flex items-center gap-3 rounded-xl border border-surface-200 bg-white p-4 hover:border-brand-200 hover:bg-brand-50/30 transition-all"
            >
              <div className="h-9 w-9 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                <FolderOpen strokeWidth={1.5} className="h-4 w-4 text-brand-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-800">Share Data Room</p>
                <p className="text-xs text-ink-500">Send investors your data room</p>
              </div>
            </Link>

            <Link
              href="/workspace/documents"
              className="flex items-center gap-3 rounded-xl border border-surface-200 bg-white p-4 hover:border-brand-200 hover:bg-brand-50/30 transition-all"
            >
              <div className="h-9 w-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                <FileText strokeWidth={1.5} className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-800">Generate Term Sheet</p>
                <p className="text-xs text-ink-500">Create term sheet template</p>
              </div>
            </Link>

            <Link
              href="/workspace/cap-table"
              className="flex items-center gap-3 rounded-xl border border-surface-200 bg-white p-4 hover:border-brand-200 hover:bg-brand-50/30 transition-all"
            >
              <div className="h-9 w-9 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                <Users strokeWidth={1.5} className="h-4 w-4 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-800">Update Cap Table</p>
                <p className="text-xs text-ink-500">Apply round to cap table</p>
              </div>
            </Link>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-2 rounded-xl border border-surface-200 px-5 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={resetWizard}
              className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors cursor-pointer"
            >
              Model Another Round
            </button>
          </div>
        </div>
      )}

      {/* ── Past Rounds ──────────────────────────────────────────────────── */}
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
