"use client";

import * as React from "react";
import {
  ArrowRight,
  CheckCircle2,
  Plus,
  RotateCcw,
  Trash2,
  Users,
  TrendingDown,
  Calculator,
  Sparkles,
  Copy,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn, formatAud, formatNumber, formatPercent } from "@/lib/utils";
import {
  computeDiff,
  demoCapTable,
  type Holder,
  type Round,
  type ShareClass,
} from "@/lib/cap-table";

const DEFAULT_ROUND: Round = {
  preMoneyAud: 8_000_000,
  raiseAud: 2_000_000,
  esopTopUpPct: 12,
  esopTimingPreMoney: true,
  leadInvestorName: "Lead VC",
};

const SHARE_CLASS_OPTIONS: { value: ShareClass; label: string }[] = [
  { value: "common", label: "Common" },
  { value: "preferred", label: "Preferred" },
  { value: "esop", label: "ESOP" },
  { value: "safe", label: "SAFE" },
];

// Color tokens for stacked bars / legend swatches. Matches MASTER.md palette.
const COLOR = {
  founder: "#0FB5A9", // teal-500
  esop: "#5EEAD4", // teal-300 — lighter teal for ESOP
  existing: "#94A3B8", // slate-400
  newInvestor: "#F59E0B", // amber-500
} as const;

type RowKind = "founder" | "esop" | "existing" | "newInvestor";

function rowColor(kind: RowKind): string {
  return COLOR[kind];
}

function classifyAfter(holder: {
  isFounder?: boolean;
  isEsop?: boolean;
  isNewInvestor?: boolean;
}): RowKind {
  if (holder.isNewInvestor) return "newInvestor";
  if (holder.isEsop) return "esop";
  if (holder.isFounder) return "founder";
  return "existing";
}

function classifyHolder(h: Holder): RowKind {
  if (h.isFounder) return "founder";
  if (h.shareClass === "esop") return "esop";
  return "existing";
}

function genId(): string {
  return `h-${Math.random().toString(36).slice(2, 9)}`;
}

export function CapTableDiffTool() {
  const [holders, setHolders] = React.useState<Holder[]>(() => demoCapTable());
  const [round, setRound] = React.useState<Round>(DEFAULT_ROUND);
  const [email, setEmail] = React.useState("");
  const [submitState, setSubmitState] = React.useState<
    "idle" | "submitting" | "ok" | "err"
  >("idle");
  const [copyState, setCopyState] = React.useState<"idle" | "ok">("idle");

  const diff = React.useMemo(
    () => computeDiff(holders, round),
    [holders, round],
  );

  const updateHolder = (id: string, patch: Partial<Holder>) =>
    setHolders((prev) =>
      prev.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    );

  const removeHolder = (id: string) =>
    setHolders((prev) => prev.filter((h) => h.id !== id));

  const addHolder = () =>
    setHolders((prev) => [
      ...prev,
      {
        id: genId(),
        name: "New holder",
        shares: 500_000,
        shareClass: "common",
      },
    ]);

  const resetDemo = () => {
    setHolders(demoCapTable());
    setRound(DEFAULT_ROUND);
  };

  const updateRound = <K extends keyof Round>(key: K, value: Round[K]) =>
    setRound((p) => ({ ...p, [key]: value }));

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState("ok");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      // Silent fail — clipboard blocked.
    }
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email || submitState === "submitting") return;
    setSubmitState("submitting");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "cap_table_diff",
          email,
          payload: {
            holders,
            round,
            summary: diff.summary,
            pricing: diff.pricing,
          },
        }),
      });
      if (!res.ok) throw new Error("Network error");
      setSubmitState("ok");
    } catch {
      setSubmitState("err");
    }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-6 lg:gap-8">
      {/* LEFT — form */}
      <section
        aria-labelledby="captable-form"
        className="lg:col-span-5 rounded-2xl border border-ink-700 bg-ink-900 p-6 md:p-8"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="captable-form"
            className="text-lg font-semibold text-slate-50 flex items-center gap-2"
          >
            <Users
              strokeWidth={1.75}
              className="h-5 w-5 text-teal-400"
              aria-hidden
            />
            Current cap table
          </h2>
          <button
            type="button"
            onClick={resetDemo}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800/60 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-teal-500/40 hover:text-slate-50 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
          >
            <RotateCcw strokeWidth={1.75} className="h-3.5 w-3.5" />
            Reset to demo
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {holders.map((h) => (
            <HolderRow
              key={h.id}
              holder={h}
              onChange={(patch) => updateHolder(h.id, patch)}
              onRemove={() => removeHolder(h.id)}
              canRemove={holders.length > 1}
            />
          ))}
          <button
            type="button"
            onClick={addHolder}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-ink-700 bg-transparent px-3 py-2 text-xs font-medium text-slate-300 hover:border-teal-500/40 hover:text-slate-50 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
          >
            <Plus strokeWidth={1.75} className="h-3.5 w-3.5" />
            Add holder
          </button>
        </div>

        <hr className="my-6 border-ink-700" />

        <h3 className="text-lg font-semibold text-slate-50 flex items-center gap-2">
          <Calculator
            strokeWidth={1.75}
            className="h-5 w-5 text-teal-400"
            aria-hidden
          />
          New round
        </h3>
        <div className="mt-5 grid sm:grid-cols-2 gap-4">
          <Field label="Pre-money valuation (AUD)" htmlFor="pre">
            <Input
              id="pre"
              type="number"
              inputMode="decimal"
              min={0}
              step={100000}
              value={round.preMoneyAud}
              onChange={(e) =>
                updateRound("preMoneyAud", Number(e.target.value) || 0)
              }
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="Raise amount (AUD)" htmlFor="raise">
            <Input
              id="raise"
              type="number"
              inputMode="decimal"
              min={0}
              step={50000}
              value={round.raiseAud}
              onChange={(e) =>
                updateRound("raiseAud", Number(e.target.value) || 0)
              }
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="Target ESOP post-money (%)" htmlFor="esop">
            <Input
              id="esop"
              type="number"
              inputMode="decimal"
              min={0}
              max={40}
              step={0.5}
              value={round.esopTopUpPct}
              onChange={(e) =>
                updateRound("esopTopUpPct", Number(e.target.value) || 0)
              }
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="Lead investor name" htmlFor="lead">
            <Input
              id="lead"
              type="text"
              value={round.leadInvestorName}
              onChange={(e) => updateRound("leadInvestorName", e.target.value)}
              placeholder="Lead VC"
            />
          </Field>
        </div>
      </section>

      {/* RIGHT — visual + diff */}
      <section
        aria-labelledby="captable-diff"
        className="lg:col-span-7 space-y-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="captable-diff"
            className="text-lg font-semibold text-slate-50 flex items-center gap-2"
          >
            <TrendingDown
              strokeWidth={1.75}
              className="h-5 w-5 text-teal-400"
              aria-hidden
            />
            Diff
          </h2>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800/60 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-teal-500/40 hover:text-slate-50 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
            aria-live="polite"
          >
            <Copy strokeWidth={1.75} className="h-3.5 w-3.5" />
            {copyState === "ok" ? "Copied" : "Copy share URL"}
          </button>
        </div>

        {/* Round summary tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryTile
            label="Post-money"
            value={formatAud(diff.pricing.postMoneyAud)}
          />
          <SummaryTile
            label="New share price"
            value={
              diff.pricing.newSharePriceAud > 0
                ? `$${diff.pricing.newSharePriceAud.toFixed(4)}`
                : "—"
            }
          />
          <SummaryTile
            label="Founder %"
            value={formatPercent(diff.summary.foundersAfterPct)}
            tone="teal"
          />
          <SummaryTile
            label="ESOP %"
            value={formatPercent(diff.summary.esopAfterPct)}
            tone="teal-soft"
          />
        </div>

        {/* Stacked bars */}
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Ownership — before vs. after
          </p>
          <div className="mt-4 space-y-5">
            <StackedBar
              label="Before"
              segments={diff.before.holders.map((h) => ({
                key: h.id,
                name: h.name,
                pct: (h.shares / Math.max(1, diff.before.totalShares)) * 100,
                kind: classifyHolder(h),
              }))}
            />
            <StackedBar
              label="After"
              segments={diff.rows.map((r) => ({
                key: `${r.name}-after`,
                name: r.name,
                pct: r.pctAfter,
                kind: classifyAfter(r),
              }))}
            />
          </div>
          <Legend />
        </div>

        {/* Diff table */}
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4 md:p-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0">
                <tr className="text-left text-[11px] uppercase tracking-[0.15em] text-slate-500">
                  <th className="py-2 pr-3 font-medium">Holder</th>
                  <th className="py-2 px-3 font-medium text-right">
                    Shares before
                  </th>
                  <th className="py-2 px-3 font-medium text-right">
                    Shares after
                  </th>
                  <th className="py-2 px-3 font-medium text-right">% before</th>
                  <th className="py-2 px-3 font-medium text-right">% after</th>
                  <th className="py-2 pl-3 font-medium text-right">Δ%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {diff.rows.map((r) => {
                  const kind = classifyAfter(r);
                  const accent =
                    kind === "founder"
                      ? "text-amber-300"
                      : kind === "esop"
                        ? "text-teal-300"
                        : kind === "newInvestor"
                          ? "text-slate-200"
                          : "text-slate-300";
                  const deltaTone =
                    r.deltaPct < -1
                      ? "text-red-400"
                      : r.deltaPct > 1
                        ? "text-green-400"
                        : "text-slate-400";
                  const sign = r.deltaPct > 0 ? "+" : "";
                  return (
                    <tr key={r.name + r.sharesAfter}>
                      <td className={cn("py-2.5 pr-3 font-medium", accent)}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-hidden
                            className="inline-block h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: rowColor(kind) }}
                          />
                          {r.name}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                        {formatNumber(r.sharesBefore)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-50">
                        {formatNumber(r.sharesAfter)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-400">
                        {formatPercent(r.pctBefore)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-50">
                        {formatPercent(r.pctAfter)}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 pl-3 text-right font-mono tabular-nums",
                          deltaTone,
                        )}
                      >
                        {sign}
                        {r.deltaPct.toFixed(1)}pp
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Plain-English summary */}
        <div className="rounded-2xl border border-teal-500/30 bg-ink-900 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-teal-400 font-medium flex items-center gap-2">
            <Sparkles strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden />
            Plain English
          </p>
          <p className="mt-3 text-sm md:text-base leading-relaxed text-slate-300">
            {diff.plainEnglish}
          </p>
        </div>
      </section>

      {/* Email capture (full-width row) */}
      <form
        onSubmit={onSubmit}
        className="lg:col-span-12 rounded-2xl border border-teal-500/30 bg-ink-900 p-6 md:p-8"
        noValidate
      >
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-teal-400 font-medium">
              Save this scenario
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-50">
              Get a full Investor-Ready Score on these numbers
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              We&apos;ll email a magic link to generate your verified score and
              a shareable link with this cap table diff baked in.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Label htmlFor="captable-email">Work email</Label>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                id="captable-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="founder@yourstartup.com.au"
                className="flex-1"
                aria-invalid={submitState === "err"}
              />
              <Button
                type="submit"
                variant="primary"
                disabled={submitState === "submitting"}
              >
                {submitState === "ok"
                  ? "Sent"
                  : submitState === "submitting"
                    ? "Sending…"
                    : "Get my Score"}
                {submitState === "ok" ? (
                  <CheckCircle2 strokeWidth={1.75} className="h-5 w-5" />
                ) : (
                  <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
                )}
              </Button>
            </div>
            {submitState === "err" && (
              <p
                role="alert"
                aria-live="assertive"
                className="text-sm text-amber-300"
              >
                Couldn&apos;t send right now. Try again.
              </p>
            )}
          </div>
        </div>
      </form>
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

function HolderRow({
  holder,
  onChange,
  onRemove,
  canRemove,
}: {
  holder: Holder;
  onChange: (patch: Partial<Holder>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const nameId = `holder-${holder.id}-name`;
  const sharesId = `holder-${holder.id}-shares`;
  const classId = `holder-${holder.id}-class`;
  const founderId = `holder-${holder.id}-founder`;
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-800/40 p-3">
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-12 sm:col-span-5">
          <Label htmlFor={nameId} className="text-xs text-slate-400">
            Name
          </Label>
          <Input
            id={nameId}
            value={holder.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="mt-1 h-9 text-sm"
          />
        </div>
        <div className="col-span-7 sm:col-span-3">
          <Label htmlFor={sharesId} className="text-xs text-slate-400">
            Shares
          </Label>
          <Input
            id={sharesId}
            type="number"
            inputMode="decimal"
            min={0}
            step={10000}
            value={holder.shares}
            onChange={(e) =>
              onChange({ shares: Number(e.target.value) || 0 })
            }
            className="mt-1 h-9 text-sm font-mono tabular-nums"
          />
        </div>
        <div className="col-span-5 sm:col-span-3">
          <Label htmlFor={classId} className="text-xs text-slate-400">
            Class
          </Label>
          <ShareClassSelect
            id={classId}
            value={holder.shareClass}
            onChange={(v) => onChange({ shareClass: v })}
          />
        </div>
        <div className="col-span-12 sm:col-span-1 flex justify-end">
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${holder.name}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink-700 bg-ink-900 text-slate-400 hover:border-red-500/40 hover:text-red-400 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
            >
              <Trash2 strokeWidth={1.75} className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          id={founderId}
          type="checkbox"
          checked={!!holder.isFounder}
          onChange={(e) => onChange({ isFounder: e.target.checked })}
          className="h-4 w-4 rounded border-ink-700 bg-ink-900 text-teal-500 focus:ring-teal-500/30 cursor-pointer"
        />
        <Label htmlFor={founderId} className="text-xs text-slate-400 cursor-pointer">
          Mark as founder
        </Label>
      </div>
    </div>
  );
}

/** Minimal shadcn-style select following MASTER.md input rules. */
function ShareClassSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: ShareClass;
  onChange: (v: ShareClass) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as ShareClass)}
      className="mt-1 h-9 w-full rounded-[10px] border border-ink-700 bg-ink-900 px-2.5 text-sm text-slate-50 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 cursor-pointer transition-colors"
    >
      {SHARE_CLASS_OPTIONS.map((o) => (
        <option key={o.value} value={o.value} className="bg-ink-900">
          {o.label}
        </option>
      ))}
    </select>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "teal" | "teal-soft";
}) {
  const valueClass =
    tone === "teal"
      ? "text-teal-300"
      : tone === "teal-soft"
        ? "text-teal-200"
        : "text-slate-50";
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 transition-colors hover:border-teal-500/40">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
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

interface BarSegment {
  key: string;
  name: string;
  pct: number;
  kind: RowKind;
}

function StackedBar({
  label,
  segments,
}: {
  label: string;
  segments: BarSegment[];
}) {
  const total = segments.reduce((acc, s) => acc + s.pct, 0) || 1;
  const filtered = segments.filter((s) => s.pct > 0);
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-slate-500">
        <span>{label}</span>
        <span className="font-mono tabular-nums text-slate-400">
          100.0%
        </span>
      </div>
      <svg
        viewBox="0 0 400 28"
        preserveAspectRatio="none"
        className="mt-2 w-full h-7"
        role="img"
        aria-label={`${label} cap table — ${filtered
          .map((s) => `${s.name} ${s.pct.toFixed(1)} percent`)
          .join(", ")}`}
      >
        {filtered.map((s, i) => {
          const offset =
            (filtered
              .slice(0, i)
              .reduce((acc, p) => acc + p.pct, 0) /
              total) *
            400;
          const w = (s.pct / total) * 400;
          const isFirst = i === 0;
          const isLast = i === filtered.length - 1;
          return (
            <rect
              key={s.key}
              x={offset + (isFirst ? 0 : 0.5)}
              y={0}
              width={Math.max(0, w - (isFirst || isLast ? 0.5 : 1))}
              height={28}
              fill={rowColor(s.kind)}
              rx={isFirst || isLast ? 4 : 0}
            >
              <title>
                {s.name} — {s.pct.toFixed(1)}%
              </title>
            </rect>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
        {filtered.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-sm"
              style={{ backgroundColor: rowColor(s.kind) }}
            />
            <span className="text-slate-300">{s.name}</span>
            <span className="font-mono tabular-nums text-slate-400">
              {s.pct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend() {
  const items: { kind: RowKind; label: string }[] = [
    { kind: "founder", label: "Founders" },
    { kind: "esop", label: "ESOP" },
    { kind: "existing", label: "Existing investors" },
    { kind: "newInvestor", label: "New investor" },
  ];
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] uppercase tracking-[0.15em] text-slate-500">
      {items.map((i) => (
        <li key={i.kind} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: rowColor(i.kind) }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
