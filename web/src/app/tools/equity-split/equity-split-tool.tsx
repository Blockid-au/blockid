"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Users,
  Plus,
  Trash2,
  RotateCcw,
  PieChart as PieIcon,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
  Lock,
  Info,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SaveFounderPackButton } from "@/components/save-founder-pack-button";
import { cn, formatPercent } from "@/lib/utils";
import {
  computeEquitySplit,
  DEFAULT_SETTINGS,
  FOUNDER_AGREEMENT_SEEDS,
  makeEmptyFounder,
  type EquitySettings,
  type FounderInput,
  type FounderRole,
  type IdeaOrigination,
  type RiskTaken,
  type TimeCommitment,
} from "@/lib/equity-split";
import { saveEquitySplitState } from "@/lib/idea-phase/session-state";

const MAX_FOUNDERS = 5;

/** Distinct, accessible per-founder swatches (brand-blue-anchored). */
const FOUNDER_COLORS = [
  "#3B7DD8", // brand-500
  "#F59E0B", // amber-500
  "#A78BFA", // violet-400
  "#F472B6", // pink-400
  "#60A5FA", // sky-400
] as const;
const ESOP_COLOR = "#5B9AEB"; // brand-300 (lighter blue)
const FIRST_HIRE_COLOR = "#94A3B8"; // slate-400

const ROLE_OPTIONS: FounderRole[] = [
  "CEO",
  "CTO",
  "COO",
  "CMO",
  "Designer",
  "Domain Expert",
  "Other",
];
const TIME_OPTIONS: TimeCommitment[] = [
  "Full-time now",
  "Full-time in 3 mo",
  "Part-time",
  "Advisor",
];
const IDEA_OPTIONS: IdeaOrigination[] = ["Originator", "Joined later"];
const RISK_OPTIONS: RiskTaken[] = ["Quit job", "Has runway 6mo", "Side project"];

function genId(): string {
  return `f-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultFounders(): FounderInput[] {
  return [
    makeEmptyFounder(genId(), 0),
    makeEmptyFounder(genId(), 1),
  ];
}

export function EquitySplitTool() {
  const [founders, setFounders] = React.useState<FounderInput[]>(defaultFounders);
  const [settings, setSettings] =
    React.useState<EquitySettings>(DEFAULT_SETTINGS);

  const result = React.useMemo(
    () => computeEquitySplit(founders, settings),
    [founders, settings],
  );

  // Mirror inputs to sessionStorage for the Save Founder Pack modal.
  React.useEffect(() => {
    saveEquitySplitState(founders, settings);
  }, [founders, settings]);

  const updateFounder = (id: string, patch: Partial<FounderInput>) =>
    setFounders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );

  const removeFounder = (id: string) =>
    setFounders((prev) => prev.filter((f) => f.id !== id));

  const addFounder = () =>
    setFounders((prev) =>
      prev.length >= MAX_FOUNDERS
        ? prev
        : [...prev, makeEmptyFounder(genId(), prev.length)],
    );

  const resetDemo = () => {
    setFounders(defaultFounders());
    setSettings(DEFAULT_SETTINGS);
  };

  const updateSettings = <K extends keyof EquitySettings>(
    key: K,
    value: EquitySettings[K],
  ) => setSettings((p) => ({ ...p, [key]: value }));

  return (
    <div className="grid lg:grid-cols-12 gap-6 lg:gap-8">
      {/* LEFT — inputs */}
      <section
        aria-labelledby="equity-form"
        className="lg:col-span-5 rounded-2xl border border-surface-200 bg-white p-6 md:p-8"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="equity-form"
            className="text-lg font-semibold text-ink-800 flex items-center gap-2"
          >
            <Users
              strokeWidth={1.75}
              className="h-5 w-5 text-brand-600"
              aria-hidden
            />
            Founders ({founders.length})
          </h2>
          <button
            type="button"
            onClick={resetDemo}
            className="inline-flex items-center gap-1.5 rounded-md border border-surface-200 bg-surface-100/60 px-2.5 py-1.5 text-xs font-medium text-ink-500 hover:border-brand-500/40 hover:text-ink-800 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
          >
            <RotateCcw strokeWidth={1.75} className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {founders.map((f, idx) => (
            <FounderRow
              key={f.id}
              founder={f}
              colorIdx={idx}
              onChange={(patch) => updateFounder(f.id, patch)}
              onRemove={() => removeFounder(f.id)}
              canRemove={founders.length > 1}
            />
          ))}
          <button
            type="button"
            onClick={addFounder}
            disabled={founders.length >= MAX_FOUNDERS}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-surface-200 bg-transparent px-3 py-2 text-xs font-medium text-ink-500 hover:border-brand-500/40 hover:text-ink-800 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-surface-200 disabled:hover:text-ink-500"
          >
            <Plus strokeWidth={1.75} className="h-3.5 w-3.5" />
            Add founder
            {founders.length >= MAX_FOUNDERS && (
              <span className="text-ink-8000">(max {MAX_FOUNDERS})</span>
            )}
          </button>
        </div>

        <hr className="my-6 border-surface-200" />

        <h3 className="text-lg font-semibold text-ink-800 flex items-center gap-2">
          <ShieldCheck
            strokeWidth={1.75}
            className="h-5 w-5 text-brand-600"
            aria-hidden
          />
          Reserves & vesting
        </h3>
        <div className="mt-5 space-y-5">
          <div className="flex items-start gap-3 rounded-xl border border-surface-200 bg-surface-100/40 p-3">
            <input
              id="esop-toggle"
              type="checkbox"
              checked={settings.esopEnabled}
              onChange={(e) =>
                updateSettings("esopEnabled", e.target.checked)
              }
              className="mt-0.5 h-4 w-4 rounded border-surface-200 bg-white text-brand-500 focus:ring-brand-500/30 cursor-pointer"
            />
            <div className="flex-1">
              <Label
                htmlFor="esop-toggle"
                className="text-sm text-ink-600 cursor-pointer"
              >
                Reserve ESOP pool ({settings.esopPct}%)
              </Label>
              <p className="text-xs text-ink-8000 mt-0.5">
                Standard 10% pool for early hires. Carved out of the company,
                not just founders.
              </p>
              {settings.esopEnabled && (
                <Input
                  id="esop-pct"
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  value={settings.esopPct}
                  onChange={(e) =>
                    updateSettings("esopPct", Number(e.target.value) || 0)
                  }
                  className="mt-2 h-9 text-sm font-mono tabular-nums"
                  aria-label="ESOP percentage"
                />
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="first-hire" className="text-sm text-ink-600">
                Reserve for first hire
              </Label>
              <span className="font-mono tabular-nums text-sm text-brand-600">
                {settings.firstHirePct}%
              </span>
            </div>
            <input
              id="first-hire"
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={settings.firstHirePct}
              onChange={(e) =>
                updateSettings("firstHirePct", Number(e.target.value) || 0)
              }
              className="mt-2 w-full accent-brand-500 cursor-pointer"
            />
            <p className="text-xs text-ink-8000 mt-1">
              Optional dedicated slice for an anticipated key hire (e.g. CTO
              you haven&apos;t signed yet).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="brand">
              <Info strokeWidth={1.75} className="h-3 w-3" aria-hidden />
              Vesting: 4 years · 1-year cliff
            </Badge>
            <span className="text-xs text-ink-8000">recommended</span>
          </div>
        </div>
      </section>

      {/* RIGHT — visuals */}
      <section
        aria-labelledby="equity-output"
        className="lg:col-span-7 space-y-6"
      >
        <h2
          id="equity-output"
          className="text-lg font-semibold text-ink-800 flex items-center gap-2"
        >
          <PieIcon
            strokeWidth={1.75}
            className="h-5 w-5 text-brand-600"
            aria-hidden
          />
          Recommended split
        </h2>

        {/* Pie + legend */}
        <div className="rounded-2xl border border-surface-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-8000">
            Cap table v0
          </p>
          <div className="mt-4 grid sm:grid-cols-[180px_1fr] gap-6 items-center">
            <Pie
              segments={[
                ...result.allocations.map((a, i) => ({
                  key: a.id,
                  label: a.name || `Founder ${i + 1}`,
                  value: a.pct,
                  color: FOUNDER_COLORS[i % FOUNDER_COLORS.length],
                })),
                ...(result.reserves.esopPct > 0
                  ? [
                      {
                        key: "esop",
                        label: "ESOP",
                        value: result.reserves.esopPct,
                        color: ESOP_COLOR,
                      },
                    ]
                  : []),
                ...(result.reserves.firstHirePct > 0
                  ? [
                      {
                        key: "first-hire",
                        label: "First hire",
                        value: result.reserves.firstHirePct,
                        color: FIRST_HIRE_COLOR,
                      },
                    ]
                  : []),
              ]}
            />
            <ul className="space-y-1.5 text-sm">
              {result.allocations.map((a, i) => (
                <LegendRow
                  key={a.id}
                  color={FOUNDER_COLORS[i % FOUNDER_COLORS.length]}
                  label={a.name || `Founder ${i + 1}`}
                  pct={a.pct}
                />
              ))}
              {result.reserves.esopPct > 0 && (
                <LegendRow
                  color={ESOP_COLOR}
                  label="ESOP pool"
                  pct={result.reserves.esopPct}
                  muted
                />
              )}
              {result.reserves.firstHirePct > 0 && (
                <LegendRow
                  color={FIRST_HIRE_COLOR}
                  label="First-hire reserve"
                  pct={result.reserves.firstHirePct}
                  muted
                />
              )}
            </ul>
          </div>
        </div>

        {/* Allocation table */}
        <div className="rounded-2xl border border-surface-200 bg-white p-4 md:p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-8000">
            Per-founder breakdown
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.15em] text-ink-8000">
                  <th className="py-2 pr-3 font-medium">Founder</th>
                  <th className="py-2 px-3 font-medium text-right">%</th>
                  <th className="py-2 px-3 font-medium text-right">Points</th>
                  <th className="py-2 px-3 font-medium text-right">Role</th>
                  <th className="py-2 px-3 font-medium text-right">Time</th>
                  <th className="py-2 px-3 font-medium text-right">Idea</th>
                  <th className="py-2 px-3 font-medium text-right">Cash</th>
                  <th className="py-2 px-3 font-medium text-right">Sweat</th>
                  <th className="py-2 px-3 font-medium text-right">IP</th>
                  <th className="py-2 pl-3 font-medium text-right">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200/70">
                {result.allocations.map((a, i) => (
                  <tr key={a.id}>
                    <td className="py-2.5 pr-3 font-medium text-ink-800">
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-block h-2.5 w-2.5 rounded-sm"
                          style={{
                            backgroundColor:
                              FOUNDER_COLORS[i % FOUNDER_COLORS.length],
                          }}
                        />
                        {a.name || `Founder ${i + 1}`}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-brand-600">
                      {formatPercent(a.pct)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-600">
                      {a.points}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-400">
                      {a.breakdown.role}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-400">
                      {a.breakdown.time}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-400">
                      {a.breakdown.idea}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-400">
                      {a.breakdown.cash}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-400">
                      {a.breakdown.sweat}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-400">
                      {a.breakdown.ip}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-ink-400">
                      {a.breakdown.risk}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-[11px] uppercase tracking-[0.15em] text-ink-8000">
                  <td className="pt-3 pr-3 font-medium">Total</td>
                  <td className="pt-3 px-3 text-right font-mono tabular-nums text-ink-500">
                    {formatPercent(result.reserves.foundersPct)}
                  </td>
                  <td className="pt-3 px-3 text-right font-mono tabular-nums text-ink-500">
                    {result.totalPoints}
                  </td>
                  <td colSpan={7} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Vesting timeline */}
        <div className="rounded-2xl border border-surface-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-8000">
            Vesting — 4 years · 1-year cliff
          </p>
          <VestingTimeline
            allocations={result.allocations}
            colors={FOUNDER_COLORS}
          />
        </div>

        {/* Fairness flags */}
        <div className="rounded-2xl border border-surface-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-8000 flex items-center gap-2">
            <AlertTriangle
              strokeWidth={1.75}
              className="h-3.5 w-3.5"
              aria-hidden
            />
            Fairness flags
          </p>
          <ul className="mt-3 space-y-2">
            {result.flags.map((f, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-lg border p-3 text-sm",
                  f.level === "warn"
                    ? "border-amber-500/30 bg-amber-500/5 text-amber-200"
                    : "border-brand-500/20 bg-brand-500/5 text-brand-500",
                )}
              >
                {f.level === "warn" ? (
                  <AlertTriangle
                    strokeWidth={1.75}
                    className="h-4 w-4 mt-0.5 shrink-0"
                    aria-hidden
                  />
                ) : (
                  <Sparkles
                    strokeWidth={1.75}
                    className="h-4 w-4 mt-0.5 shrink-0"
                    aria-hidden
                  />
                )}
                <span className="leading-relaxed">{f.message}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Founder Agreement seeds */}
        <div className="rounded-2xl border border-brand-500/30 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium flex items-center gap-2">
            <Sparkles strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden />
            Founder Agreement seeds
          </p>
          <p className="mt-2 text-sm text-ink-400">
            Bring these bullets to your lawyer — they cover the non-negotiables
            most pre-incorporation teams forget.
          </p>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-ink-500 list-disc pl-5">
            {FOUNDER_AGREEMENT_SEEDS.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>

        {/* Save snapshot CTA (disabled) */}
        <div className="rounded-2xl border border-surface-200 bg-white p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink-800 flex items-center gap-2">
              <Lock strokeWidth={1.75} className="h-4 w-4 text-ink-400" />
              Save snapshot
            </p>
            <p className="mt-1 text-xs text-ink-8000">
              Bundle this split with your idea valuation and funding plan into
              a shareable Founder Pack. Free, no password.
            </p>
          </div>
          <SaveFounderPackButton />
        </div>

        {/* Save to Workspace CTA */}
        <div className="mt-6 rounded-2xl border border-brand-200 bg-brand-50 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink-800">Save this analysis to your workspace</p>
            <p className="text-xs text-ink-500 mt-0.5">Access it anytime from your dashboard</p>
          </div>
          <Link href="/auth/login" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
            Save to Workspace <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <p className="text-center text-xs text-ink-8000">
          Powered by BlockID — when you incorporate, this becomes your Cap
          Table v0.
        </p>
      </section>
    </div>
  );
}

/* ------------------------------ Founder row ----------------------------- */

function FounderRow({
  founder,
  colorIdx,
  onChange,
  onRemove,
  canRemove,
}: {
  founder: FounderInput;
  colorIdx: number;
  onChange: (patch: Partial<FounderInput>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const id = founder.id;
  return (
    <div className="rounded-xl border border-surface-200 bg-surface-100/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-medium text-ink-500">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{
              backgroundColor:
                FOUNDER_COLORS[colorIdx % FOUNDER_COLORS.length],
            }}
          />
          {founder.name || `Founder ${colorIdx + 1}`}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${founder.name || `Founder ${colorIdx + 1}`}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-surface-200 bg-white text-ink-400 hover:border-red-500/40 hover:text-red-400 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
          >
            <Trash2 strokeWidth={1.75} className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <FieldInline label="Name" htmlFor={`${id}-name`}>
          <Input
            id={`${id}-name`}
            value={founder.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="h-9 text-sm"
          />
        </FieldInline>
        <FieldInline label="Role" htmlFor={`${id}-role`}>
          <SelectInline
            id={`${id}-role`}
            value={founder.role}
            options={ROLE_OPTIONS}
            onChange={(v) => onChange({ role: v as FounderRole })}
          />
        </FieldInline>
        <FieldInline label="Time commitment" htmlFor={`${id}-time`}>
          <SelectInline
            id={`${id}-time`}
            value={founder.time}
            options={TIME_OPTIONS}
            onChange={(v) => onChange({ time: v as TimeCommitment })}
          />
        </FieldInline>
        <FieldInline label="Idea origination" htmlFor={`${id}-idea`}>
          <SelectInline
            id={`${id}-idea`}
            value={founder.idea}
            options={IDEA_OPTIONS}
            onChange={(v) => onChange({ idea: v as IdeaOrigination })}
          />
        </FieldInline>
        <FieldInline label="Cash (AUD)" htmlFor={`${id}-cash`}>
          <Input
            id={`${id}-cash`}
            type="number"
            inputMode="decimal"
            min={0}
            step={500}
            value={founder.cashAud}
            onChange={(e) =>
              onChange({ cashAud: Number(e.target.value) || 0 })
            }
            className="h-9 text-sm font-mono tabular-nums"
          />
        </FieldInline>
        <FieldInline
          label="Sweat months (next 12)"
          htmlFor={`${id}-sweat`}
        >
          <Input
            id={`${id}-sweat`}
            type="number"
            inputMode="decimal"
            min={0}
            max={24}
            step={1}
            value={founder.sweatMonths}
            onChange={(e) =>
              onChange({ sweatMonths: Number(e.target.value) || 0 })
            }
            className="h-9 text-sm font-mono tabular-nums"
          />
        </FieldInline>
        <FieldInline label="IP/assets brought (1–5)" htmlFor={`${id}-ip`}>
          <Input
            id={`${id}-ip`}
            type="number"
            inputMode="decimal"
            min={0}
            max={5}
            step={1}
            value={founder.ipAssets}
            onChange={(e) =>
              onChange({ ipAssets: Number(e.target.value) || 0 })
            }
            className="h-9 text-sm font-mono tabular-nums"
          />
        </FieldInline>
        <FieldInline label="Risk taken" htmlFor={`${id}-risk`}>
          <SelectInline
            id={`${id}-risk`}
            value={founder.risk}
            options={RISK_OPTIONS}
            onChange={(v) => onChange({ risk: v as RiskTaken })}
          />
        </FieldInline>
      </div>
    </div>
  );
}

function FieldInline({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="col-span-2 sm:col-span-1 flex flex-col gap-1">
      <Label htmlFor={htmlFor} className="text-xs text-ink-400">
        {label}
      </Label>
      {children}
    </div>
  );
}

function SelectInline({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-[10px] border border-surface-200 bg-white px-2.5 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 cursor-pointer transition-colors"
    >
      {options.map((o) => (
        <option key={o} value={o} className="bg-white">
          {o}
        </option>
      ))}
    </select>
  );
}

/* --------------------------------- Pie ---------------------------------- */

interface PieSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

function Pie({ segments }: { segments: PieSegment[] }) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  const SIZE = 180;
  const R = 80;
  const CX = SIZE / 2;
  const CY = SIZE / 2;

  // Empty state
  if (total <= 0) {
    return (
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-[180px] h-auto mx-auto"
        role="img"
        aria-label="No equity allocated yet"
      >
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="#334155"
          strokeWidth={1}
        />
      </svg>
    );
  }

  let cumulative = 0;
  const filtered = segments.filter((s) => s.value > 0);

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="w-full max-w-[180px] h-auto mx-auto"
      role="img"
      aria-label={`Equity split — ${filtered
        .map((s) => `${s.label} ${s.value.toFixed(1)} percent`)
        .join(", ")}`}
    >
      {filtered.length === 1 ? (
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill={filtered[0].color}
        >
          <title>
            {filtered[0].label} — {filtered[0].value.toFixed(1)}%
          </title>
        </circle>
      ) : (
        filtered.map((s) => {
          const startAngle = (cumulative / total) * Math.PI * 2;
          cumulative += s.value;
          const endAngle = (cumulative / total) * Math.PI * 2;
          const x1 = CX + R * Math.sin(startAngle);
          const y1 = CY - R * Math.cos(startAngle);
          const x2 = CX + R * Math.sin(endAngle);
          const y2 = CY - R * Math.cos(endAngle);
          const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
          const d = [
            `M ${CX} ${CY}`,
            `L ${x1.toFixed(3)} ${y1.toFixed(3)}`,
            `A ${R} ${R} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`,
            "Z",
          ].join(" ");
          return (
            <path key={s.key} d={d} fill={s.color}>
              <title>
                {s.label} — {s.value.toFixed(1)}%
              </title>
            </path>
          );
        })
      )}
      {/* Donut hole for visual centre */}
      <circle cx={CX} cy={CY} r={32} fill="#0B1220" />
      <text
        x={CX}
        y={CY - 2}
        textAnchor="middle"
        fill="#94A3B8"
        fontSize={9}
        fontFamily="var(--font-mono, monospace)"
      >
        Cap table v0
      </text>
      <text
        x={CX}
        y={CY + 12}
        textAnchor="middle"
        fill="#F1F5F9"
        fontSize={13}
        fontWeight={600}
        fontFamily="var(--font-mono, monospace)"
      >
        100%
      </text>
    </svg>
  );
}

function LegendRow({
  color,
  label,
  pct,
  muted = false,
}: {
  color: string;
  label: string;
  pct: number;
  muted?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2 min-w-0">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: color }}
        />
        <span
          className={cn(
            "truncate",
            muted ? "text-ink-400" : "text-ink-600",
          )}
        >
          {label}
        </span>
      </span>
      <span
        className={cn(
          "font-mono tabular-nums",
          muted ? "text-ink-400" : "text-ink-800",
        )}
      >
        {formatPercent(pct)}
      </span>
    </li>
  );
}

/* ----------------------------- Vesting timeline ------------------------- */

function VestingTimeline({
  allocations,
  colors,
}: {
  allocations: Array<{
    id: string;
    name: string;
    pct: number;
    vested: { y0: number; y1: number; y2: number; y3: number; y4: number };
  }>;
  colors: readonly string[];
}) {
  const years = ["y0", "y1", "y2", "y3", "y4"] as const;
  const yearLabels = ["Day 1", "Year 1 (cliff)", "Year 2", "Year 3", "Year 4"];

  // Find max pct for bar scaling.
  const maxPct = Math.max(1, ...allocations.map((a) => a.pct));

  return (
    <div className="mt-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.15em] text-ink-8000">
              <th className="py-2 pr-3 text-left font-medium">Founder</th>
              {yearLabels.map((y) => (
                <th
                  key={y}
                  className="py-2 px-3 text-right font-medium"
                >
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-200/70">
            {allocations.map((a, i) => (
              <tr key={a.id}>
                <td className="py-2.5 pr-3 font-medium text-ink-600">
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{
                        backgroundColor: colors[i % colors.length],
                      }}
                    />
                    {a.name || `Founder ${i + 1}`}
                  </span>
                </td>
                {years.map((y) => {
                  const v = a.vested[y];
                  const w = (v / maxPct) * 100;
                  return (
                    <td
                      key={y}
                      className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-500"
                    >
                      <div className="flex items-center justify-end gap-2">
                        <span
                          aria-hidden
                          className="inline-block h-1.5 rounded-sm"
                          style={{
                            width: `${Math.max(2, w)}%`,
                            maxWidth: 80,
                            backgroundColor: colors[i % colors.length],
                            opacity: y === "y0" ? 0.25 : 0.85,
                          }}
                        />
                        {v.toFixed(1)}%
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-8000">
        Cliff: nothing vests before year 1. After the cliff, the remaining 75%
        vests monthly across years 2–4.
      </p>
    </div>
  );
}
