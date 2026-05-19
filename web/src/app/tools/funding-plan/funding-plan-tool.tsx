"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  Info,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SaveFounderPackButton } from "@/components/save-founder-pack-button";
import { cn, formatAud, formatPercent } from "@/lib/utils";
import {
  computeFundingPlan,
  type FounderContribution,
  type FundingPlanInput,
  type RaiseType,
} from "@/lib/funding-plan";
import { saveFundingPlanState } from "@/lib/idea-phase/session-state";

const SS_KEYS = {
  ideaValuation: "blockid:idea-valuation:mid",
  equitySplit: "blockid:equity-split:allocations",
  result: "blockid:funding-plan:result",
} as const;

const RAISE_TYPES: { value: RaiseType; label: string; hint: string }[] = [
  {
    value: "ff_safe",
    label: "Friends & Family SAFE",
    hint: "Most common at idea stage in AU. 20% discount, cap ~1.5× pre-money.",
  },
  {
    value: "preseed_vc",
    label: "Pre-seed VC",
    hint: "Priced or post-money SAFE. Tighter discount, lower cap multiple.",
  },
  {
    value: "angel",
    label: "Angel cheque",
    hint: "Single-investor SAFE. 20% discount, cap ~1.4× pre-money.",
  },
];

const COLOR = {
  founder: "#3B7DD8",
  external: "#5B9AEB",
  esop: "#F59E0B",
} as const;

function genId(): string {
  return `f-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_FOUNDERS: FounderContribution[] = [
  { id: genId(), name: "Founder 1", cashAud: 15_000 },
  { id: genId(), name: "Founder 2", cashAud: 10_000 },
];

const DEFAULTS: FundingPlanInput = {
  cofounderCount: 2,
  monthlyWageAud: 6000,
  sweatFirstSixMonths: false,
  monthlyToolsAud: 800,
  monthlyMarketingAud: 1000,
  legalOneOffAud: 5000,
  bufferPct: 20,
  runwayMonths: 12,
  founders: DEFAULT_FOUNDERS,
  preMoneyAud: 400_000,
  esopPct: 10,
  raiseType: "ff_safe",
};

interface EquitySplitAllocation {
  id?: string;
  name?: string;
  pct?: number;
  equityPct?: number;
  percent?: number;
}

/** Defensive sessionStorage reads — never throw. */
function readSessionPreMoney(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SS_KEYS.ideaValuation);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function readSessionEquitySplit(): EquitySplitAllocation[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SS_KEYS.equitySplit);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as EquitySplitAllocation[];
  } catch {
    return null;
  }
}

function applyEquitySplit(
  founders: FounderContribution[],
  split: EquitySplitAllocation[],
): FounderContribution[] {
  // Map by index — equity-split tools usually emit founders in order.
  return founders.map((f, i) => {
    const a = split[i];
    if (!a) return f;
    const pct =
      typeof a.equityPct === "number"
        ? a.equityPct
        : typeof a.pct === "number"
          ? a.pct
          : typeof a.percent === "number"
            ? a.percent
            : undefined;
    return {
      ...f,
      name: typeof a.name === "string" && a.name ? a.name : f.name,
      equityPct: typeof pct === "number" && Number.isFinite(pct) ? pct : undefined,
    };
  });
}

function hydrateFromSession(base: FundingPlanInput): FundingPlanInput {
  const pre = readSessionPreMoney();
  const split = readSessionEquitySplit();
  let next = base;
  if (pre && pre !== base.preMoneyAud) {
    next = { ...next, preMoneyAud: pre };
  }
  if (split && split.length > 0) {
    next = { ...next, founders: applyEquitySplit(next.founders, split) };
  }
  return next;
}

export function FundingPlanTool() {
  // Lazy initialiser pulls from sessionStorage once. Safe because this is a
  // client component — hydrateFromSession guards `window`.
  const [inp, setInp] = React.useState<FundingPlanInput>(() =>
    hydrateFromSession(DEFAULTS),
  );

  const out = React.useMemo(() => computeFundingPlan(inp), [inp]);

  // Persist result to sessionStorage on every compute.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(SS_KEYS.result, JSON.stringify(out));
    } catch {
      // Quota or disabled storage — silently ignore.
    }
  }, [out]);

  // Mirror full inputs to sessionStorage for the Save Founder Pack modal.
  React.useEffect(() => {
    saveFundingPlanState(inp);
  }, [inp]);

  const update = <K extends keyof FundingPlanInput>(
    key: K,
    value: FundingPlanInput[K],
  ) => setInp((p) => ({ ...p, [key]: value }));

  const updateFounder = (id: string, patch: Partial<FounderContribution>) =>
    setInp((p) => ({
      ...p,
      founders: p.founders.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));

  const removeFounder = (id: string) =>
    setInp((p) => ({
      ...p,
      founders: p.founders.filter((f) => f.id !== id),
      cofounderCount: Math.max(1, p.founders.length - 1),
    }));

  const addFounder = () =>
    setInp((p) => {
      if (p.founders.length >= 5) return p;
      const next = [
        ...p.founders,
        {
          id: genId(),
          name: `Founder ${p.founders.length + 1}`,
          cashAud: 0,
        },
      ];
      return { ...p, founders: next, cofounderCount: next.length };
    });

  const reset = () => setInp(DEFAULTS);

  return (
    <div className="grid lg:grid-cols-12 gap-6 lg:gap-8">
      {/* LEFT — burn plan + cap stack */}
      <section
        aria-labelledby="fp-form"
        className="lg:col-span-5 rounded-2xl border border-surface-200 bg-white p-6 md:p-8"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="fp-form"
            className="text-lg font-semibold text-ink-800 flex items-center gap-2"
          >
            <Calculator
              strokeWidth={1.75}
              className="h-5 w-5 text-brand-600"
              aria-hidden
            />
            Burn plan
          </h2>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md border border-surface-200 bg-surface-100/60 px-2.5 py-1.5 text-xs font-medium text-ink-500 hover:border-brand-500/40 hover:text-ink-800 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
          >
            <RotateCcw strokeWidth={1.75} className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        <div className="mt-5 grid sm:grid-cols-2 gap-4">
          <Field label="Cofounder count" htmlFor="fp-cofs">
            <Input
              id="fp-cofs"
              type="number"
              min={1}
              max={5}
              step={1}
              value={inp.cofounderCount}
              onChange={(e) =>
                update(
                  "cofounderCount",
                  Math.max(1, Math.min(5, Number(e.target.value) || 1)),
                )
              }
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="Living wage AUD/mo" htmlFor="fp-wage">
            <Input
              id="fp-wage"
              type="number"
              min={0}
              step={500}
              value={inp.monthlyWageAud}
              onChange={(e) =>
                update("monthlyWageAud", Number(e.target.value) || 0)
              }
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="Tools / SaaS AUD/mo" htmlFor="fp-tools">
            <Input
              id="fp-tools"
              type="number"
              min={0}
              step={50}
              value={inp.monthlyToolsAud}
              onChange={(e) =>
                update("monthlyToolsAud", Number(e.target.value) || 0)
              }
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="Marketing AUD/mo" htmlFor="fp-mkt">
            <Input
              id="fp-mkt"
              type="number"
              min={0}
              step={50}
              value={inp.monthlyMarketingAud}
              onChange={(e) =>
                update("monthlyMarketingAud", Number(e.target.value) || 0)
              }
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="Legal / accounting (one-off)" htmlFor="fp-legal">
            <Input
              id="fp-legal"
              type="number"
              min={0}
              step={500}
              value={inp.legalOneOffAud}
              onChange={(e) =>
                update("legalOneOffAud", Number(e.target.value) || 0)
              }
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="Buffer %" htmlFor="fp-buf">
            <Input
              id="fp-buf"
              type="number"
              min={0}
              max={100}
              step={1}
              value={inp.bufferPct}
              onChange={(e) =>
                update("bufferPct", Number(e.target.value) || 0)
              }
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="Runway months" htmlFor="fp-runway">
            <Input
              id="fp-runway"
              type="number"
              min={1}
              max={36}
              step={1}
              value={inp.runwayMonths}
              onChange={(e) =>
                update("runwayMonths", Number(e.target.value) || 1)
              }
              className="font-mono tabular-nums"
            />
          </Field>
          <div className="sm:col-span-2 flex items-center gap-2 rounded-xl border border-surface-200 bg-surface-100/40 px-3 py-2.5">
            <input
              id="fp-sweat"
              type="checkbox"
              checked={inp.sweatFirstSixMonths}
              onChange={(e) =>
                update("sweatFirstSixMonths", e.target.checked)
              }
              className="h-4 w-4 rounded border-surface-200 bg-white text-brand-500 focus:ring-brand-500/30 cursor-pointer"
            />
            <Label
              htmlFor="fp-sweat"
              className="text-xs text-ink-500 cursor-pointer"
            >
              Skip wages for first 6 months (sweat-equity start)
            </Label>
          </div>
        </div>

        <hr className="my-6 border-surface-200" />

        <h3 className="text-lg font-semibold text-ink-800 flex items-center gap-2">
          <Users
            strokeWidth={1.75}
            className="h-5 w-5 text-brand-600"
            aria-hidden
          />
          Founder cash injection
        </h3>
        <p className="mt-1 text-xs text-ink-8000">
          What each cofounder can realistically put in. Up to 5 founders.
        </p>
        <div className="mt-4 space-y-3">
          {inp.founders.map((f) => (
            <FounderRow
              key={f.id}
              founder={f}
              onChange={(patch) => updateFounder(f.id, patch)}
              onRemove={() => removeFounder(f.id)}
              canRemove={inp.founders.length > 1}
            />
          ))}
          {inp.founders.length < 5 && (
            <button
              type="button"
              onClick={addFounder}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-surface-200 bg-transparent px-3 py-2 text-xs font-medium text-ink-500 hover:border-brand-500/40 hover:text-ink-800 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
            >
              <Plus strokeWidth={1.75} className="h-3.5 w-3.5" />
              Add founder
            </button>
          )}
        </div>

        <hr className="my-6 border-surface-200" />

        <h3 className="text-lg font-semibold text-ink-800 flex items-center gap-2">
          <Wallet
            strokeWidth={1.75}
            className="h-5 w-5 text-brand-600"
            aria-hidden
          />
          Cap stack
        </h3>
        <div className="mt-5 grid sm:grid-cols-2 gap-4">
          <Field label="Pre-money valuation (AUD)" htmlFor="fp-pre">
            <Input
              id="fp-pre"
              type="number"
              min={0}
              step={50000}
              value={inp.preMoneyAud}
              onChange={(e) =>
                update("preMoneyAud", Number(e.target.value) || 0)
              }
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="Target ESOP %" htmlFor="fp-esop">
            <Input
              id="fp-esop"
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={inp.esopPct}
              onChange={(e) => update("esopPct", Number(e.target.value) || 0)}
              className="font-mono tabular-nums"
            />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium text-ink-600">
              Raise type
            </legend>
            <div className="mt-2 grid sm:grid-cols-3 gap-2">
              {RAISE_TYPES.map((rt) => {
                const checked = inp.raiseType === rt.value;
                return (
                  <label
                    key={rt.value}
                    className={cn(
                      "flex flex-col gap-1 rounded-xl border p-3 text-xs cursor-pointer transition-colors",
                      checked
                        ? "border-brand-500/60 bg-brand-500/5 text-ink-800"
                        : "border-surface-200 bg-surface-100/40 text-ink-500 hover:border-brand-500/30",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="fp-raise-type"
                        value={rt.value}
                        checked={checked}
                        onChange={() => update("raiseType", rt.value)}
                        className="h-3.5 w-3.5 accent-brand-500 cursor-pointer"
                      />
                      <span className="font-semibold">{rt.label}</span>
                    </span>
                    <span className="text-[11px] leading-snug text-ink-8000">
                      {rt.hint}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      </section>

      {/* RIGHT — outputs */}
      <section
        aria-labelledby="fp-output"
        className="lg:col-span-7 space-y-6"
      >
        {/* Headline */}
        <div className="rounded-2xl border border-brand-500/30 bg-white p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
            Total capital needed
          </p>
          <p
            id="fp-output"
            className="mt-2 font-mono tabular-nums text-4xl md:text-5xl font-semibold text-ink-800"
          >
            {formatAud(out.totalNeedAud)}
          </p>
          <p className="mt-2 text-sm text-ink-400">
            Monthly burn{" "}
            <span className="font-mono tabular-nums text-ink-600">
              {formatAud(out.monthlyBurnAud)}
            </span>{" "}
            ({formatAud(out.monthlyWageSubtotalAud)} wages +{" "}
            {formatAud(out.monthlyOpexSubtotalAud)} opex) over {inp.runwayMonths}{" "}
            months
            {inp.sweatFirstSixMonths
              ? " (wages skipped first 6 months)"
              : ""}
            , plus {formatAud(out.bufferAud)} buffer and{" "}
            {formatAud(inp.legalOneOffAud)} legal one-off.
          </p>
        </div>

        {/* Donut: founder cash vs external raise vs ESOP value */}
        <div className="rounded-2xl border border-surface-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-8000">
            Capital sources
          </p>
          <CapitalDonut
            founderCash={out.founderCapitalPooledAud}
            externalRaise={out.externalRaiseAud}
            esopValue={(out.esopPct / 100) * Math.max(0, out.postMoneyAud)}
          />
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryTile
              label="Founder cash"
              value={formatAud(out.founderCapitalPooledAud)}
              tone="brand"
            />
            <SummaryTile
              label="External raise"
              value={formatAud(out.externalRaiseAud)}
              tone="brand-soft"
            />
            <SummaryTile
              label="Post-money"
              value={formatAud(out.postMoneyAud)}
            />
            <SummaryTile
              label="Founder % after"
              value={formatPercent(out.founderPctAfter)}
              tone="brand"
            />
          </div>
        </div>

        {/* Per-founder dilution preview */}
        <div className="rounded-2xl border border-surface-200 bg-white p-4 md:p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-ink-8000">
              Per-founder dilution preview
            </p>
            <p className="text-[11px] text-ink-8000">
              {inp.founders.some((f) => typeof f.equityPct === "number")
                ? "From equity-split"
                : "Equal split (default)"}
            </p>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.15em] text-ink-8000">
                  <th className="py-2 pr-3 font-medium">Founder</th>
                  <th className="py-2 px-3 font-medium text-right">
                    Cash in
                  </th>
                  <th className="py-2 px-3 font-medium text-right">
                    % before
                  </th>
                  <th className="py-2 px-3 font-medium text-right">
                    % after
                  </th>
                  <th className="py-2 pl-3 font-medium text-right">Δ%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200/70">
                {out.founderRows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-3 font-medium text-ink-800">
                      {r.name}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-600">
                      {formatAud(r.cashAud)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-400">
                      {formatPercent(r.equityBeforePct)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-brand-600">
                      {formatPercent(r.equityAfterPct)}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-amber-300">
                      -{r.diluted.toFixed(1)}pp
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recommended raise */}
        <div className="rounded-2xl border border-brand-500/30 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium flex items-center gap-2">
            <Sparkles strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden />
            Recommended raise
          </p>
          <p className="mt-3 text-sm md:text-base leading-relaxed text-ink-500">
            Raise{" "}
            <span className="font-mono tabular-nums text-ink-800">
              {formatAud(out.recommended.raiseAud)}
            </span>{" "}
            at a pre-money of{" "}
            <span className="font-mono tabular-nums text-ink-800">
              {formatAud(out.recommended.preMoneyAud)}
            </span>{" "}
            → combined dilution of{" "}
            <span className="font-mono tabular-nums text-amber-300">
              {formatPercent(out.recommended.dilutionPct)}
            </span>{" "}
            (investor + ESOP).
          </p>
          {inp.raiseType === "ff_safe" && (
            <p className="mt-3 text-xs text-ink-400">
              SAFE suggestion: discount{" "}
              <span className="font-mono tabular-nums text-ink-600">
                {out.safe.discountPct}%
              </span>{" "}
              · cap{" "}
              <span className="font-mono tabular-nums text-ink-600">
                {formatAud(out.safe.capAud)}
              </span>
              .
            </p>
          )}
        </div>

        {/* Sensitivity table */}
        <div className="rounded-2xl border border-surface-200 bg-white p-4 md:p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-8000">
            Sensitivity — what if you raise more or less?
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.15em] text-ink-8000">
                  <th className="py-2 pr-3 font-medium">Scenario</th>
                  <th className="py-2 px-3 font-medium text-right">
                    Raise
                  </th>
                  <th className="py-2 px-3 font-medium text-right">
                    Post-money
                  </th>
                  <th className="py-2 px-3 font-medium text-right">
                    Investor %
                  </th>
                  <th className="py-2 px-3 font-medium text-right">
                    ESOP %
                  </th>
                  <th className="py-2 pl-3 font-medium text-right">
                    Founder %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200/70">
                {out.scenarios.map((s) => (
                  <tr key={s.label}>
                    <td className="py-2.5 pr-3 font-medium text-ink-600">
                      {s.label}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-500">
                      {formatAud(s.externalRaiseAud)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-500">
                      {formatAud(s.postMoneyAud)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-500">
                      {formatPercent(s.investorPct)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-500">
                      {formatPercent(s.esopPct)}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-brand-600">
                      {formatPercent(s.founderPctAfter)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Risk flags */}
        {out.flags.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-white p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-300 font-medium flex items-center gap-2">
              <AlertTriangle
                strokeWidth={1.75}
                className="h-3.5 w-3.5"
                aria-hidden
              />
              Risk flags
            </p>
            <ul className="mt-3 space-y-2">
              {out.flags.map((f, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex items-start gap-2 text-sm leading-relaxed",
                    f.level === "warn"
                      ? "text-amber-200"
                      : "text-ink-500",
                  )}
                >
                  {f.level === "warn" ? (
                    <AlertTriangle
                      strokeWidth={1.75}
                      className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"
                      aria-hidden
                    />
                  ) : (
                    <Info
                      strokeWidth={1.75}
                      className="mt-0.5 h-4 w-4 shrink-0 text-brand-600"
                      aria-hidden
                    />
                  )}
                  <span>{f.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Next steps */}
        <div className="rounded-2xl border border-surface-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-8000">
            Next steps
          </p>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <a
              href="/tools/equity-split"
              className="group flex items-center justify-between rounded-xl border border-surface-200 bg-surface-100/40 px-4 py-3 text-sm text-ink-600 hover:border-brand-500/40 hover:text-ink-800 transition-colors"
            >
              <span>
                <span className="block font-semibold">Split founder equity</span>
                <span className="block text-xs text-ink-8000">
                  Weight by cash, time, IP and risk.
                </span>
              </span>
              <ArrowRight
                strokeWidth={1.75}
                className="h-4 w-4 text-brand-600 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </a>
            <a
              href="/tools/idea-valuation"
              className="group flex items-center justify-between rounded-xl border border-surface-200 bg-surface-100/40 px-4 py-3 text-sm text-ink-600 hover:border-brand-500/40 hover:text-ink-800 transition-colors"
            >
              <span>
                <span className="block font-semibold">Set a pre-money</span>
                <span className="block text-xs text-ink-8000">
                  AU idea-stage valuation benchmarker.
                </span>
              </span>
              <ArrowRight
                strokeWidth={1.75}
                className="h-4 w-4 text-brand-600 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </a>
          </div>

          <div className="mt-6 rounded-xl border border-brand-500/40 bg-gradient-to-br from-white to-surface-100 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
              Lock this in
            </p>
            <p className="mt-2 text-sm text-ink-500">
              Save this plan as part of your{" "}
              <span className="font-semibold text-ink-700">Founder Pack</span>{" "}
              — bundles your idea valuation, equity split and funding plan into
              one shareable PDF + dashboard.
            </p>
            <div className="mt-4">
              <SaveFounderPackButton className="h-11 w-full sm:w-auto" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* -------------------------------- subcomponents ------------------------------ */

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function FounderRow({
  founder,
  onChange,
  onRemove,
  canRemove,
}: {
  founder: FounderContribution;
  onChange: (patch: Partial<FounderContribution>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const nameId = `fp-${founder.id}-name`;
  const cashId = `fp-${founder.id}-cash`;
  return (
    <div className="rounded-xl border border-surface-200 bg-surface-100/40 p-3">
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-12 sm:col-span-6">
          <Label htmlFor={nameId} className="text-xs text-ink-400">
            Name
          </Label>
          <Input
            id={nameId}
            value={founder.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="mt-1 h-9 text-sm"
          />
        </div>
        <div className="col-span-10 sm:col-span-5">
          <Label htmlFor={cashId} className="text-xs text-ink-400">
            Cash (AUD)
          </Label>
          <Input
            id={cashId}
            type="number"
            inputMode="decimal"
            min={0}
            step={1000}
            value={founder.cashAud}
            onChange={(e) =>
              onChange({ cashAud: Number(e.target.value) || 0 })
            }
            className="mt-1 h-9 text-sm font-mono tabular-nums"
          />
        </div>
        <div className="col-span-2 sm:col-span-1 flex justify-end">
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${founder.name}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-surface-200 bg-white text-ink-400 hover:border-red-500/40 hover:text-red-400 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
            >
              <Trash2 strokeWidth={1.75} className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "brand" | "brand-soft";
}) {
  const valueClass =
    tone === "brand"
      ? "text-brand-600"
      : tone === "brand-soft"
        ? "text-brand-500"
        : "text-ink-800";
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4 transition-colors hover:border-brand-500/40">
      <p className="text-[11px] uppercase tracking-[0.18em] text-ink-8000">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 font-mono tabular-nums text-xl font-semibold",
          valueClass,
        )}
      >
        {value}
      </p>
    </div>
  );
}

function CapitalDonut({
  founderCash,
  externalRaise,
  esopValue,
}: {
  founderCash: number;
  externalRaise: number;
  esopValue: number;
}) {
  const segments = [
    { label: "Founder cash", value: Math.max(0, founderCash), color: COLOR.founder },
    { label: "External raise", value: Math.max(0, externalRaise), color: COLOR.external },
    { label: "ESOP value", value: Math.max(0, esopValue), color: COLOR.esop },
  ];
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  const radius = 56;
  const stroke = 18;
  const cx = 80;
  const cy = 80;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;
  return (
    <div className="mt-4 flex flex-col sm:flex-row items-center gap-6">
      <svg
        viewBox="0 0 160 160"
        className="h-40 w-40 shrink-0 -rotate-90"
        role="img"
        aria-label={`Capital sources donut. ${segments
          .map(
            (s) =>
              `${s.label} ${total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0"} percent`,
          )
          .join(", ")}.`}
      >
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#1F2937"
          strokeWidth={stroke}
        />
        {total > 0 &&
          segments.map((s) => {
            if (s.value <= 0) return null;
            const fraction = s.value / total;
            const dash = fraction * circumference;
            const offset = -cumulative * circumference;
            cumulative += fraction;
            return (
              <circle
                key={s.label}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
              >
                <title>
                  {s.label} — {formatAud(s.value)}
                </title>
              </circle>
            );
          })}
      </svg>
      <ul className="flex-1 space-y-2 text-sm">
        {segments.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <li
              key={s.label}
              className="flex items-center justify-between gap-3"
            >
              <span className="inline-flex items-center gap-2 text-ink-500">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </span>
              <span className="font-mono tabular-nums text-ink-600">
                {formatAud(s.value)}{" "}
                <span className="text-ink-8000">
                  ({pct.toFixed(1)}%)
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
