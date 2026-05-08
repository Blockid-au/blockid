"use client";

import * as React from "react";
import {
  Calculator,
  Sparkles,
  TrendingUp,
  Lightbulb,
  Info,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn, formatAud, formatPercent } from "@/lib/utils";
import {
  AU_PRE_INCORP_BAND,
  TAM_PRESETS,
  computeIdeaValuation,
  type FounderTraits,
  type IdeaValuationInput,
  type Score1to5,
  type TeamCompleteness,
  type TractionSignals,
} from "@/lib/idea-valuation";

const SEVERITY_LABELS: Record<Score1to5, string> = {
  1: "Mild",
  2: "Annoying",
  3: "Painful",
  4: "Urgent",
  5: "Critical",
};

const FOUNDER_LABELS: Record<Score1to5, string> = {
  1: "Solo, non-technical",
  2: "First-time, partial",
  3: "Capable team",
  4: "Strong, experienced",
  5: "Repeat / exited",
};

const MATURITY_LABELS: Record<Score1to5, string> = {
  1: "Idea only",
  2: "Wireframes",
  3: "Clickable prototype",
  4: "MVP shipped",
  5: "Paying users",
};

const MOAT_LABELS: Record<Score1to5, string> = {
  1: "None",
  2: "Weak",
  3: "Emerging",
  4: "Defensible",
  5: "Strong (IP/regulatory/data/network)",
};

const COMPETITION_LABELS: Record<Score1to5, string> = {
  1: "Crowded — many incumbents",
  2: "Competitive",
  3: "Some competition",
  4: "Few players",
  5: "Uncontested / new category",
};

const FOUNDER_TRAIT_FIELDS: { key: keyof FounderTraits; label: string }[] = [
  { key: "priorExit", label: "Prior exit" },
  { key: "technical", label: "Technical background" },
  { key: "domainExpert", label: "Domain expert" },
  { key: "hasNetwork", label: "Has investor / customer network" },
  { key: "fullTime", label: "Full-time on this" },
];

const TRACTION_FIELDS: { key: keyof TractionSignals; label: string }[] = [
  { key: "waitlistOver100", label: "Waitlist > 100" },
  { key: "paidLois", label: "Paid LOIs" },
  { key: "pilotSigned", label: "Pilot signed" },
  { key: "payingCustomers", label: "Paying customers" },
  { key: "acceleratorAccepted", label: "Accelerator accepted" },
];

const TEAM_FIELDS: { key: keyof TeamCompleteness; label: string }[] = [
  { key: "hasCEO", label: "Has CEO" },
  { key: "hasCTO", label: "Has CTO / tech lead" },
  { key: "hasCommercial", label: "Has commercial / GTM" },
  { key: "hasDesign", label: "Has design / product" },
];

const DEFAULTS: IdeaValuationInput = {
  tamAud: 800_000_000,
  problemSeverity: 4,
  founderStrength: 3,
  founderTraits: {
    priorExit: false,
    technical: true,
    domainExpert: true,
    hasNetwork: false,
    fullTime: true,
  },
  solutionMaturity: 3,
  traction: {
    waitlistOver100: true,
    paidLois: false,
    pilotSigned: false,
    payingCustomers: false,
    acceleratorAccepted: false,
  },
  moatStrength: 3,
  competitionDensity: 3,
  team: {
    hasCEO: true,
    hasCTO: true,
    hasCommercial: false,
    hasDesign: false,
  },
};

export function IdeaValuationTool() {
  const [input, setInput] = React.useState<IdeaValuationInput>(DEFAULTS);
  const out = React.useMemo(() => computeIdeaValuation(input), [input]);

  const setScore =
    <K extends keyof IdeaValuationInput>(key: K) =>
    (value: IdeaValuationInput[K]) =>
      setInput((p) => ({ ...p, [key]: value }));

  const toggleFounderTrait = (key: keyof FounderTraits) =>
    setInput((p) => ({
      ...p,
      founderTraits: { ...p.founderTraits, [key]: !p.founderTraits[key] },
    }));

  const toggleTraction = (key: keyof TractionSignals) =>
    setInput((p) => ({
      ...p,
      traction: { ...p.traction, [key]: !p.traction[key] },
    }));

  const toggleTeam = (key: keyof TeamCompleteness) =>
    setInput((p) => ({
      ...p,
      team: { ...p.team, [key]: !p.team[key] },
    }));

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <section
        aria-labelledby="idea-inputs"
        className="rounded-2xl border border-ink-700 bg-ink-900 p-6 md:p-8"
      >
        <h2
          id="idea-inputs"
          className="text-lg font-semibold text-slate-50 flex items-center gap-2"
        >
          <Calculator strokeWidth={1.75} className="h-5 w-5 text-teal-400" />
          Idea-stage signals
        </h2>

        <div className="mt-6 space-y-7">
          {/* TAM */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="tam">Total addressable market (AUD)</Label>
            <Input
              id="tam"
              type="number"
              min={0}
              step={1_000_000}
              value={input.tamAud}
              onChange={(e) =>
                setInput((p) => ({
                  ...p,
                  tamAud: Number(e.target.value) || 0,
                }))
              }
              className="font-mono tabular-nums"
            />
            <div className="mt-1 flex flex-wrap gap-2">
              {TAM_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    setInput((p) => ({ ...p, tamAud: preset.value }))
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    input.tamAud === preset.value
                      ? "border-teal-500/60 bg-teal-500/10 text-teal-200"
                      : "border-ink-700 bg-ink-900 text-slate-400 hover:border-teal-500/40 hover:text-slate-200",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <RadioGroup
            id="problem"
            label="Problem severity"
            value={input.problemSeverity}
            onChange={(v) => setScore("problemSeverity")(v)}
            labels={SEVERITY_LABELS}
          />

          <RadioGroup
            id="founder"
            label="Founder strength"
            value={input.founderStrength}
            onChange={(v) => setScore("founderStrength")(v)}
            labels={FOUNDER_LABELS}
          />
          <CheckboxGroup
            label="Founder traits"
            fields={FOUNDER_TRAIT_FIELDS}
            values={input.founderTraits}
            onToggle={(k) => toggleFounderTrait(k as keyof FounderTraits)}
          />

          <RadioGroup
            id="maturity"
            label="Solution maturity"
            value={input.solutionMaturity}
            onChange={(v) => setScore("solutionMaturity")(v)}
            labels={MATURITY_LABELS}
          />

          <CheckboxGroup
            label="Traction signals"
            fields={TRACTION_FIELDS}
            values={input.traction}
            onToggle={(k) => toggleTraction(k as keyof TractionSignals)}
          />

          <RadioGroup
            id="moat"
            label="Moat strength"
            value={input.moatStrength}
            onChange={(v) => setScore("moatStrength")(v)}
            labels={MOAT_LABELS}
          />

          <RadioGroup
            id="competition"
            label="Competition density"
            value={input.competitionDensity}
            onChange={(v) => setScore("competitionDensity")(v)}
            labels={COMPETITION_LABELS}
          />

          <CheckboxGroup
            label="Team completeness"
            fields={TEAM_FIELDS}
            values={input.team}
            onToggle={(k) => toggleTeam(k as keyof TeamCompleteness)}
          />

          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setInput(DEFAULTS)}
            >
              Reset to defaults
            </Button>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="idea-outputs"
        className="rounded-2xl border border-ink-700 bg-ink-900 p-6 md:p-8 flex flex-col"
      >
        <h2
          id="idea-outputs"
          className="text-lg font-semibold text-slate-50 flex items-center gap-2"
        >
          <Sparkles strokeWidth={1.75} className="h-5 w-5 text-teal-400" />
          Pre-money estimate
        </h2>

        <div className="mt-6 rounded-xl border border-teal-500/30 bg-teal-500/5 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-teal-300 font-medium">
            Defensible band (AUD)
          </p>
          <p className="mt-2 font-mono tabular-nums text-3xl md:text-4xl font-semibold text-slate-50">
            {formatAud(out.lowAud)} – {formatAud(out.highAud)}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Mid-point{" "}
            <span className="font-mono tabular-nums text-slate-200">
              {formatAud(out.midAud)}
            </span>{" "}
            · Scorecard multiplier{" "}
            <span className="font-mono tabular-nums text-slate-200">
              {out.scorecardMultiplier.toFixed(2)}x
            </span>
          </p>
          <p className="mt-3 flex items-start gap-2 text-xs text-slate-400">
            <Info strokeWidth={1.75} className="h-4 w-4 mt-0.5 text-teal-400" />
            <span>{out.confidence}</span>
          </p>
        </div>

        <div className="mt-7">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Per-factor breakdown
          </p>
          <ul className="mt-3 space-y-3">
            {out.factors.map((f) => (
              <li key={f.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-slate-200">
                    {f.label}
                  </span>
                  <span className="font-mono tabular-nums text-xs text-slate-400">
                    {formatAud(f.valueAud)} / {formatAud(f.capAud)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full rounded-full bg-ink-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-teal-500"
                    style={{
                      width: `${Math.min(100, f.fillRatio * 100).toFixed(1)}%`,
                    }}
                    aria-label={`${f.label} ${formatPercent(f.fillRatio * 100, 0)}`}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">{f.note}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-7 rounded-xl border border-ink-700 bg-ink-950/60 p-5">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-amber-300 font-medium">
            <Lightbulb strokeWidth={1.75} className="h-4 w-4" />
            What would lift this most
          </p>
          {out.suggestions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              You&apos;re near the ceiling for an idea-stage estimate. Real
              upside now comes from negotiation and hard signal.
            </p>
          ) : (
            <ol className="mt-3 space-y-3">
              {out.suggestions.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="font-mono tabular-nums text-xs text-teal-300 mt-0.5">
                    {i + 1}.
                  </span>
                  <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-100">
                        {s.title}
                      </span>
                      <span className="font-mono tabular-nums text-xs text-teal-300">
                        +{formatAud(s.upliftAud)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="mt-7 rounded-xl border border-ink-700 bg-ink-950/60 p-5">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400 font-medium">
            <TrendingUp strokeWidth={1.75} className="h-4 w-4 text-teal-400" />
            How this compares
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Typical AU pre-incorporation pre-money sits between{" "}
            <span className="font-mono tabular-nums text-slate-50">
              {formatAud(AU_PRE_INCORP_BAND.lowAud)}
            </span>{" "}
            and{" "}
            <span className="font-mono tabular-nums text-slate-50">
              {formatAud(AU_PRE_INCORP_BAND.highAud)}
            </span>{" "}
            in 2025.
          </p>
          <CompareBar
            lowAud={out.lowAud}
            highAud={out.highAud}
            bandLow={AU_PRE_INCORP_BAND.lowAud}
            bandHigh={AU_PRE_INCORP_BAND.highAud}
          />
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Idea-stage estimate. Real valuation is set by negotiation with your
          first investor — use this number as an anchor, not a quote.
        </p>
      </section>
    </div>
  );
}

function RadioGroup({
  id,
  label,
  value,
  onChange,
  labels,
}: {
  id: string;
  label: string;
  value: Score1to5;
  onChange: (v: Score1to5) => void;
  labels: Record<Score1to5, string>;
}) {
  const options: Score1to5[] = [1, 2, 3, 4, 5];
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-slate-200">
        {label}
      </legend>
      <div
        className="mt-2 grid grid-cols-5 gap-2"
        role="radiogroup"
        aria-label={label}
      >
        {options.map((n) => {
          const selected = value === n;
          const inputId = `${id}-${n}`;
          return (
            <label
              key={n}
              htmlFor={inputId}
              className={cn(
                "cursor-pointer rounded-[10px] border px-2 py-2 text-center transition-colors",
                selected
                  ? "border-teal-500/60 bg-teal-500/10 text-teal-200"
                  : "border-ink-700 bg-ink-900 text-slate-400 hover:border-teal-500/40 hover:text-slate-200",
              )}
            >
              <input
                id={inputId}
                type="radio"
                name={id}
                value={n}
                checked={selected}
                onChange={() => onChange(n)}
                className="sr-only"
              />
              <span className="block font-mono tabular-nums text-base font-semibold">
                {n}
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        <span className="font-mono tabular-nums text-slate-300">{value}</span> ·{" "}
        {labels[value]}
      </p>
    </fieldset>
  );
}

function CheckboxGroup<T extends string>({
  label,
  fields,
  values,
  onToggle,
}: {
  label: string;
  fields: { key: T; label: string }[];
  values: Record<T, boolean>;
  onToggle: (key: T) => void;
}) {
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-slate-200">
        {label}
      </legend>
      <div className="mt-2 grid sm:grid-cols-2 gap-2">
        {fields.map((f) => {
          const checked = values[f.key];
          return (
            <label
              key={f.key}
              className={cn(
                "flex items-center gap-2.5 cursor-pointer rounded-[10px] border px-3 py-2.5 text-sm transition-colors",
                checked
                  ? "border-teal-500/60 bg-teal-500/10 text-slate-100"
                  : "border-ink-700 bg-ink-900 text-slate-400 hover:border-teal-500/40 hover:text-slate-200",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(f.key)}
                className="h-4 w-4 rounded border-ink-700 bg-ink-900 text-teal-500 focus:ring-teal-500/40"
              />
              <span>{f.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function CompareBar({
  lowAud,
  highAud,
  bandLow,
  bandHigh,
}: {
  lowAud: number;
  highAud: number;
  bandLow: number;
  bandHigh: number;
}) {
  // Scale from 0 to max(highAud, bandHigh) * 1.1.
  const max = Math.max(highAud, bandHigh) * 1.1 || 1;
  const x = (n: number) => (n / max) * 100;
  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className="mt-3 w-full h-6"
      role="img"
      aria-label={`Your range ${formatAud(lowAud)} to ${formatAud(highAud)} compared with the AU pre-incorp band of ${formatAud(bandLow)} to ${formatAud(bandHigh)}.`}
    >
      <rect x={0} y={10} width={100} height={4} fill="#1E293B" rx={2} />
      <rect
        x={x(bandLow)}
        y={10}
        width={Math.max(0.5, x(bandHigh) - x(bandLow))}
        height={4}
        fill="#94A3B8"
        rx={2}
      />
      <rect
        x={x(lowAud)}
        y={6}
        width={Math.max(0.5, x(highAud) - x(lowAud))}
        height={12}
        fill="#0FB5A9"
        rx={2}
      />
    </svg>
  );
}
