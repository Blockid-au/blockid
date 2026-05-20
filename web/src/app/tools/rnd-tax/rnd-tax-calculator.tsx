"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  DollarSign,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Helpers ───────────────────────────────────────────────────────────── */
function fmt(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
}

/* ─── Component ─────────────────────────────────────────────────────────── */
export function RndTaxCalculator() {
  const [turnover, setTurnover] = React.useState("");
  const [rndSpend, setRndSpend] = React.useState("");
  const [taxRate, setTaxRate] = React.useState<25 | 30>(25);
  const [monthlyBurn, setMonthlyBurn] = React.useState("");
  const [result, setResult] = React.useState<{
    offsetRate: number;
    offsetType: "refundable" | "non-refundable";
    offsetAmount: number;
    netBenefit: number;
    runwayMonths: number | null;
    rndSpend: number;
    turnover: number;
  } | null>(null);
  const [error, setError] = React.useState("");

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const turnoverNum = parseFloat(turnover.replace(/[^0-9.]/g, ""));
    const rndNum = parseFloat(rndSpend.replace(/[^0-9.]/g, ""));
    const burnNum = monthlyBurn
      ? parseFloat(monthlyBurn.replace(/[^0-9.]/g, ""))
      : 0;

    if (isNaN(turnoverNum) || turnoverNum < 0) {
      setError("Please enter a valid annual turnover.");
      return;
    }
    if (isNaN(rndNum) || rndNum <= 0) {
      setError("Please enter a valid R&D expenditure amount.");
      return;
    }
    if (rndNum < 20000) {
      setError(
        "R&D expenditure must be at least $20,000 to qualify for the R&D Tax Incentive."
      );
      return;
    }

    const isSmallBusiness = turnoverNum < 20_000_000;
    const offsetRate = isSmallBusiness ? 43.5 : 38.5;
    const offsetType = isSmallBusiness ? "refundable" : "non-refundable";

    // Tax offset = (offset rate - company tax rate) * R&D expenditure
    // Plus the base deduction: company tax rate * R&D expenditure
    // Net benefit = offset rate * R&D expenditure - company tax rate * R&D expenditure
    // Which simplifies to: (offset rate - company tax rate) * R&D expenditure
    const offsetAmount = (offsetRate / 100) * rndNum;
    const normalDeduction = (taxRate / 100) * rndNum;
    const netBenefit = offsetAmount - normalDeduction;

    const runwayMonths =
      burnNum > 0 ? Math.floor(netBenefit / burnNum) : null;

    setResult({
      offsetRate,
      offsetType: offsetType as "refundable" | "non-refundable",
      offsetAmount,
      netBenefit,
      runwayMonths,
      rndSpend: rndNum,
      turnover: turnoverNum,
    });
  };

  const handleReset = () => {
    setTurnover("");
    setRndSpend("");
    setTaxRate(25);
    setMonthlyBurn("");
    setResult(null);
    setError("");
  };

  return (
    <div className="space-y-10">
      {/* ── Explainer ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-surface-200 bg-surface-50 p-6">
        <h2 className="text-base font-semibold text-ink-800 mb-3">
          How the R&D Tax Incentive works
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-surface-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign
                strokeWidth={1.75}
                className="h-4 w-4 text-brand-600"
              />
              <p className="text-sm font-semibold text-ink-800">
                Turnover &lt; $20M
              </p>
            </div>
            <p className="text-xs text-ink-600 leading-relaxed">
              <strong>43.5% refundable</strong> tax offset on eligible R&D
              expenditure. If your offset exceeds your tax liability, you
              receive the difference as a cash refund.
            </p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp
                strokeWidth={1.75}
                className="h-4 w-4 text-ink-600"
              />
              <p className="text-sm font-semibold text-ink-800">
                Turnover &ge; $20M
              </p>
            </div>
            <p className="text-xs text-ink-600 leading-relaxed">
              <strong>38.5% non-refundable</strong> tax offset on eligible R&D
              expenditure. Can only offset against your income tax liability
              (excess carried forward).
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-400">
          Minimum eligible R&D expenditure: $20,000. Rates current as of
          2024-25 FY.
        </p>
      </div>

      {/* ── Calculator Form ────────────────────────────────────────────── */}
      <form onSubmit={handleCalculate} className="space-y-6">
        {/* Annual Turnover */}
        <div className="rounded-xl border border-surface-200 bg-white p-5">
          <label className="text-sm font-semibold text-ink-800">
            Annual aggregated turnover (AUD)
          </label>
          <p className="text-xs text-ink-500 mt-0.5 mb-3">
            Your company&apos;s total revenue in the current financial year.
          </p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">
              $
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={turnover}
              onChange={(e) => setTurnover(e.target.value)}
              placeholder="e.g. 2,000,000"
              className="h-11 w-full rounded-xl border border-surface-300 bg-white pl-7 pr-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors"
            />
          </div>
        </div>

        {/* R&D Expenditure */}
        <div className="rounded-xl border border-surface-200 bg-white p-5">
          <label className="text-sm font-semibold text-ink-800">
            R&D expenditure (AUD)
          </label>
          <p className="text-xs text-ink-500 mt-0.5 mb-3">
            Total eligible R&D spending for the year. Must exceed $20,000.
          </p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">
              $
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={rndSpend}
              onChange={(e) => setRndSpend(e.target.value)}
              placeholder="e.g. 500,000"
              className="h-11 w-full rounded-xl border border-surface-300 bg-white pl-7 pr-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors"
            />
          </div>
        </div>

        {/* Company Tax Rate */}
        <div className="rounded-xl border border-surface-200 bg-white p-5">
          <label className="text-sm font-semibold text-ink-800">
            Company tax rate
          </label>
          <p className="text-xs text-ink-500 mt-0.5 mb-3">
            Base-rate entities (turnover &lt; $50M) pay 25%. Otherwise 30%.
          </p>
          <div className="flex gap-3">
            {([25, 30] as const).map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setTaxRate(rate)}
                className={cn(
                  "flex-1 h-11 rounded-xl border text-sm font-semibold transition-colors cursor-pointer",
                  taxRate === rate
                    ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-100"
                    : "border-surface-300 bg-white text-ink-600 hover:bg-surface-50"
                )}
              >
                {rate}%
              </button>
            ))}
          </div>
        </div>

        {/* Monthly Burn (optional) */}
        <div className="rounded-xl border border-surface-200 bg-white p-5">
          <label className="text-sm font-semibold text-ink-800">
            Monthly burn rate (AUD){" "}
            <span className="text-ink-400 font-normal">— optional</span>
          </label>
          <p className="text-xs text-ink-500 mt-0.5 mb-3">
            We&apos;ll estimate how many months of runway the tax benefit could
            fund.
          </p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">
              $
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={monthlyBurn}
              onChange={(e) => setMonthlyBurn(e.target.value)}
              placeholder="e.g. 50,000"
              className="h-11 w-full rounded-xl border border-surface-300 bg-white pl-7 pr-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertCircle
              strokeWidth={1.75}
              className="h-4 w-4 text-red-500 shrink-0 mt-0.5"
            />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Submit */}
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="h-12 px-8 rounded-2xl bg-brand-600 text-base font-bold text-white hover:bg-brand-700 transition-colors cursor-pointer cta-glow"
          >
            <Calculator
              strokeWidth={1.75}
              className="inline h-4 w-4 mr-2 -mt-0.5"
            />
            Calculate R&D Tax Benefit
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="h-12 px-6 rounded-2xl border border-surface-300 text-sm font-medium text-ink-600 hover:bg-surface-100 transition-colors cursor-pointer"
          >
            Reset
          </button>
        </div>
      </form>

      {/* ── Result ─────────────────────────────────────────────────────── */}
      {result && (
        <div className="rounded-2xl border-2 border-brand-300 bg-brand-50/40 p-6 md:p-8 space-y-6 animate-fade-in">
          <div>
            <h3 className="text-xl font-bold text-ink-800">
              Your Estimated R&D Tax Benefit
            </h3>
            <p className="text-sm text-ink-500 mt-1">
              Based on {fmt(result.turnover)} turnover and {fmt(result.rndSpend)}{" "}
              R&D expenditure.
            </p>
          </div>

          {/* Key Metrics */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-surface-200 bg-white p-4">
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wider mb-1">
                Tax Offset Amount
              </p>
              <p className="text-2xl font-bold text-brand-600 tabular-nums">
                {fmt(result.offsetAmount)}
              </p>
              <p className="text-xs text-ink-500 mt-1">
                {result.offsetRate}% of R&D spend
              </p>
            </div>

            <div className="rounded-xl border border-surface-200 bg-white p-4">
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wider mb-1">
                Net Benefit (above normal deduction)
              </p>
              <p className="text-2xl font-bold text-green-600 tabular-nums">
                {fmt(result.netBenefit)}
              </p>
              <p className="text-xs text-ink-500 mt-1">
                Extra benefit vs standard {taxRate}% deduction
              </p>
            </div>

            <div className="rounded-xl border border-surface-200 bg-white p-4">
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wider mb-1">
                Offset Type
              </p>
              <p
                className={cn(
                  "text-lg font-bold",
                  result.offsetType === "refundable"
                    ? "text-green-600"
                    : "text-amber-600"
                )}
              >
                {result.offsetType === "refundable"
                  ? "Refundable"
                  : "Non-refundable"}
              </p>
              <p className="text-xs text-ink-500 mt-1">
                {result.offsetType === "refundable"
                  ? "Cash back if offset exceeds tax liability"
                  : "Can only offset against income tax payable"}
              </p>
            </div>
          </div>

          {/* Runway */}
          {result.runwayMonths !== null && result.runwayMonths > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 text-center">
              <p className="text-sm text-emerald-800">
                This R&D benefit could fund approximately
              </p>
              <p className="text-4xl font-extrabold text-emerald-700 my-2 tabular-nums">
                {result.runwayMonths}{" "}
                <span className="text-lg font-semibold">
                  month{result.runwayMonths !== 1 ? "s" : ""} of runway
                </span>
              </p>
              <p className="text-xs text-emerald-600">
                Based on your monthly burn rate
              </p>
            </div>
          )}

          {/* Breakdown Table */}
          <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-surface-100">
                <tr>
                  <td className="px-5 py-3 text-ink-600">R&D Expenditure</td>
                  <td className="px-5 py-3 text-right font-semibold text-ink-800 tabular-nums">
                    {fmt(result.rndSpend)}
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-ink-600">
                    Normal deduction ({taxRate}%)
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-ink-800 tabular-nums">
                    {fmt((taxRate / 100) * result.rndSpend)}
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-ink-600">
                    R&D offset ({result.offsetRate}%)
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-brand-600 tabular-nums">
                    {fmt(result.offsetAmount)}
                  </td>
                </tr>
                <tr className="bg-green-50/60">
                  <td className="px-5 py-3 font-semibold text-green-800">
                    Additional benefit
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-green-700 tabular-nums">
                    {fmt(result.netBenefit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* CTA */}
          <div className="text-center pt-2">
            <Link
              href="/"
              className="inline-flex h-12 items-center gap-2.5 rounded-2xl bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 transition-colors cta-glow"
            >
              Get your full SVI analysis{" "}
              <ArrowRight strokeWidth={2} className="h-5 w-5" />
            </Link>
            <p className="mt-2 text-xs text-ink-500">
              Include R&D tax insights in your Startup Value Index report
            </p>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-ink-400 leading-relaxed">
        <strong>Disclaimer:</strong> This calculator provides estimates only and
        does not constitute financial or tax advice. The R&D Tax Incentive is
        administered by the Australian Taxation Office (ATO) and the Department
        of Industry, Science and Resources. Eligibility and offset amounts
        depend on your specific circumstances. Consult a qualified R&D tax
        advisor for a formal assessment. Rates based on 2024-25 financial year.
      </p>
    </div>
  );
}
