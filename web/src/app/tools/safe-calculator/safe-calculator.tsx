"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Calculator, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAud, formatNumber, formatPercent } from "@/lib/utils";

interface Inputs {
  investment: number; // AUD
  valuationCap: number; // AUD
  discountRate: number; // %
  interestRate: number; // % (AU SAFE rarely accrue, but US KISS-style do)
  monthsToTrigger: number; // months until conversion
  qualifiedRoundPreMoney: number; // AUD — assumed priced-round pre-money
  qualifiedRoundShares: number; // company shares issued in the priced round
  currentSharesOutstanding: number;
}

interface Outputs {
  accruedAmount: number;
  conversionPriceCap: number;
  conversionPriceDiscount: number;
  conversionPriceUsed: number;
  pricedRoundSharePrice: number;
  safeShares: number;
  safeOwnershipPct: number;
  effectiveValuation: number;
  vsNoSafePct: number;
  triggerType: "cap" | "discount" | "neither";
}

function compute(inp: Inputs): Outputs {
  const investment = Math.max(0, inp.investment);
  const cap = Math.max(0, inp.valuationCap);
  const discount = Math.max(0, Math.min(100, inp.discountRate)) / 100;
  const interest = Math.max(0, Math.min(100, inp.interestRate)) / 100;
  const months = Math.max(0, inp.monthsToTrigger);
  const preMoney = Math.max(1, inp.qualifiedRoundPreMoney);
  const pricedShares = Math.max(1, inp.qualifiedRoundShares);
  const current = Math.max(1, inp.currentSharesOutstanding);

  const accruedAmount =
    interest > 0 ? investment * (1 + (interest * months) / 12) : investment;

  // Priced round price-per-share, based on the disclosed pre-money & current shares.
  const pricedSharePrice = preMoney / current;

  // Cap conversion price = cap / shares-on-fully-diluted-basis at conversion.
  // For simplicity we use current shares (pre-money basis) — matches most AU SAFE templates.
  const conversionPriceCap = cap > 0 ? cap / current : Infinity;
  const conversionPriceDiscount =
    discount > 0 ? pricedSharePrice * (1 - discount) : Infinity;

  let conversionPriceUsed = pricedSharePrice;
  let triggerType: Outputs["triggerType"] = "neither";
  if (
    Number.isFinite(conversionPriceCap) &&
    conversionPriceCap < pricedSharePrice &&
    conversionPriceCap <= conversionPriceDiscount
  ) {
    conversionPriceUsed = conversionPriceCap;
    triggerType = "cap";
  } else if (
    Number.isFinite(conversionPriceDiscount) &&
    conversionPriceDiscount < pricedSharePrice
  ) {
    conversionPriceUsed = conversionPriceDiscount;
    triggerType = "discount";
  }

  const safeShares =
    conversionPriceUsed > 0 ? accruedAmount / conversionPriceUsed : 0;

  const totalShares = current + safeShares + pricedShares;
  const safeOwnershipPct = totalShares > 0 ? (safeShares / totalShares) * 100 : 0;

  // Effective valuation the SAFE investor "paid" — investment / ownership.
  const effectiveValuation =
    safeOwnershipPct > 0 ? investment / (safeOwnershipPct / 100) : 0;

  // For comparison: if no SAFE existed and the investor entered at the priced round,
  // they would have received investment / pricedSharePrice shares.
  const noSafeShares = investment / pricedSharePrice;
  const noSafePct = (noSafeShares / (current + pricedShares + noSafeShares)) * 100;
  const vsNoSafePct = safeOwnershipPct - noSafePct;

  return {
    accruedAmount,
    conversionPriceCap,
    conversionPriceDiscount,
    conversionPriceUsed,
    pricedRoundSharePrice: pricedSharePrice,
    safeShares,
    safeOwnershipPct,
    effectiveValuation,
    vsNoSafePct,
    triggerType,
  };
}

const DEFAULTS: Inputs = {
  investment: 250_000,
  valuationCap: 5_000_000,
  discountRate: 20,
  interestRate: 0,
  monthsToTrigger: 12,
  qualifiedRoundPreMoney: 8_000_000,
  qualifiedRoundShares: 2_000_000,
  currentSharesOutstanding: 10_000_000,
};

export function SAFECalculator() {
  const [inp, setInp] = React.useState<Inputs>(DEFAULTS);
  const out = React.useMemo(() => compute(inp), [inp]);

  function set<K extends keyof Inputs>(key: K, value: number) {
    setInp((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-8">
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Inputs */}
        <div className="lg:col-span-2 rounded-2xl border border-surface-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-ink-800 flex items-center gap-2">
            <Calculator strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
            SAFE Terms
          </h2>
          <p className="text-sm text-ink-500 mt-1">
            Tweak the SAFE and the assumed priced round.
          </p>

          <div className="mt-5 space-y-4">
            <FieldNumber
              id="investment"
              label="Investment (AUD)"
              value={inp.investment}
              onChange={(v) => set("investment", v)}
            />
            <FieldNumber
              id="cap"
              label="Pre-money valuation cap (AUD)"
              value={inp.valuationCap}
              onChange={(v) => set("valuationCap", v)}
            />
            <div className="grid grid-cols-2 gap-3">
              <FieldNumber
                id="discount"
                label="Discount (%)"
                value={inp.discountRate}
                onChange={(v) => set("discountRate", v)}
                step={1}
              />
              <FieldNumber
                id="interest"
                label="Interest (%)"
                value={inp.interestRate}
                onChange={(v) => set("interestRate", v)}
                step={0.5}
                hint="0 for AU-style SAFE"
              />
            </div>
            <FieldNumber
              id="months"
              label="Months to conversion"
              value={inp.monthsToTrigger}
              onChange={(v) => set("monthsToTrigger", v)}
              step={1}
            />

            <div className="pt-3 border-t border-surface-200">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">
                Assumed Priced Round
              </p>
              <FieldNumber
                id="preMoney"
                label="Pre-money valuation (AUD)"
                value={inp.qualifiedRoundPreMoney}
                onChange={(v) => set("qualifiedRoundPreMoney", v)}
              />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <FieldNumber
                  id="currentShares"
                  label="Current shares"
                  value={inp.currentSharesOutstanding}
                  onChange={(v) => set("currentSharesOutstanding", v)}
                  step={100_000}
                />
                <FieldNumber
                  id="pricedShares"
                  label="New round shares"
                  value={inp.qualifiedRoundShares}
                  onChange={(v) => set("qualifiedRoundShares", v)}
                  step={100_000}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Outputs */}
        <div className="lg:col-span-3 rounded-2xl border border-surface-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-ink-800">Conversion outcome</h2>
          <p className="text-sm text-ink-500 mt-1">
            What the SAFE investor receives when the priced round closes.
          </p>

          <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Accrued at conversion" value={formatAud(out.accruedAmount)} />
            <Stat label="Priced round share price" value={`$${out.pricedRoundSharePrice.toFixed(4)}`} />
            <Stat
              label="Effective conversion price"
              value={`$${out.conversionPriceUsed.toFixed(4)}`}
              accent={out.triggerType === "cap" ? "brand" : out.triggerType === "discount" ? "amber" : undefined}
            />
            <Stat
              label="Shares issued"
              value={formatNumber(Math.round(out.safeShares))}
            />
            <Stat
              label="Ownership %"
              value={formatPercent(out.safeOwnershipPct, 2)}
            />
            <Stat
              label="Effective valuation"
              value={formatAud(out.effectiveValuation)}
            />
          </div>

          <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
            <p className="text-xs uppercase tracking-wider text-brand-700 font-semibold">
              Trigger
            </p>
            <p className="mt-1 text-sm text-ink-700">
              {out.triggerType === "cap" && (
                <>
                  Conversion is capped — the <strong>valuation cap</strong> beats
                  the priced round and the discount. The SAFE investor gets the
                  cap price ({`$${out.conversionPriceCap.toFixed(4)}`}/share).
                </>
              )}
              {out.triggerType === "discount" && (
                <>
                  Conversion uses the <strong>discount</strong> — the cap is above
                  the discounted price, so the SAFE investor pays{" "}
                  {(100 - inp.discountRate).toFixed(0)}% of the priced round price.
                </>
              )}
              {out.triggerType === "neither" && (
                <>
                  Neither the cap nor the discount beat the priced round. The SAFE
                  converts at the full priced-round price — the investor gets no
                  uplift.
                </>
              )}
            </p>
          </div>

          {/* Comparison table */}
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">
              With vs Without SAFE
            </p>
            <div className="overflow-hidden rounded-xl border border-surface-200">
              <table className="w-full text-sm">
                <thead className="bg-surface-50 text-left text-xs uppercase tracking-wider text-ink-500">
                  <tr>
                    <th className="px-3 py-2">Scenario</th>
                    <th className="px-3 py-2 text-right">Shares</th>
                    <th className="px-3 py-2 text-right">Ownership</th>
                    <th className="px-3 py-2 text-right">Effective val.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200">
                  <tr>
                    <td className="px-3 py-2 text-ink-700">With SAFE</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(Math.round(out.safeShares))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPercent(out.safeOwnershipPct, 2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatAud(out.effectiveValuation)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-ink-700">No SAFE (priced only)</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(
                        Math.round(inp.investment / out.pricedRoundSharePrice),
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPercent(out.safeOwnershipPct - out.vsNoSafePct, 2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatAud(inp.qualifiedRoundPreMoney + inp.investment)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-500">
              The SAFE investor receives{" "}
              <strong>{formatPercent(Math.abs(out.vsNoSafePct), 2)}</strong>{" "}
              {out.vsNoSafePct >= 0 ? "more" : "less"} ownership than a direct
              priced-round investor would.
            </p>
          </div>
        </div>
      </div>

      {/* Australia-specific notes */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle
            strokeWidth={1.75}
            className="h-5 w-5 text-amber-600 shrink-0 mt-0.5"
          />
          <div>
            <h3 className="text-base font-semibold text-ink-800">
              Australian SAFE vs US SAFE — what&rsquo;s different?
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-ink-600 leading-relaxed list-disc pl-5">
              <li>
                <strong>MFN clause:</strong> Most AU SAFEs include a Most Favoured
                Nation clause. If you issue a later SAFE on better terms before the
                priced round, the earlier investor can elect those terms. Always
                check this before running multiple SAFE rounds.
              </li>
              <li>
                <strong>No accrual interest by default:</strong> The US Y Combinator
                post-money SAFE does not accrue interest, and most AU SAFE templates
                follow this. KISS notes and convertible notes do accrue interest.
              </li>
              <li>
                <strong>ESIC eligibility:</strong> SAFE investments can qualify the
                investor for the Australian Early Stage Innovation Company tax
                offset (Division 360) if the company passes the 100-point innovation
                test. Document this at the time of issue.
              </li>
              <li>
                <strong>Pre-money vs post-money cap:</strong> Y Combinator&rsquo;s
                2018 post-money SAFE shifts dilution onto founders. AU templates
                typically still use a pre-money cap — this calculator assumes
                pre-money. If your term sheet says &ldquo;post-money cap&rdquo;,
                model dilution differently.
              </li>
              <li>
                <strong>Securities law:</strong> Issuing SAFEs in Australia must
                comply with the Corporations Act 2001 — most early SAFEs use the
                small-scale offer exemption (s708) or sophisticated investor
                exemption. Speak to a lawyer before issuing.
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 to-white p-6 text-center">
        <p className="text-base font-semibold text-ink-800">
          Want to see how this SAFE looks on your live cap table?
        </p>
        <p className="text-sm text-ink-500 mt-1">
          Generate your free Startup Value Index report and see SAFE conversion
          modelled against your real shareholders.
        </p>
        <Link
          href="/score"
          className="inline-flex items-center gap-2 mt-4 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          Get my SVI score
          <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function FieldNumber({
  id,
  label,
  value,
  onChange,
  step = 1000,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  hint?: string;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs font-medium text-ink-600">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="mt-1"
      />
      {hint ? <p className="mt-1 text-[11px] text-ink-400">{hint}</p> : null}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "brand" | "amber";
}) {
  const tone =
    accent === "brand"
      ? "border-brand-200 bg-brand-50/60"
      : accent === "amber"
        ? "border-amber-200 bg-amber-50/40"
        : "border-surface-200 bg-surface-50/50";
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${tone}`}>
      <p className="text-[10px] uppercase tracking-wider text-ink-500 font-medium">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink-800 tabular-nums">
        {value}
      </p>
    </div>
  );
}
