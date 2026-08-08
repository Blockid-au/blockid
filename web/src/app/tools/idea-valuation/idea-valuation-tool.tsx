"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  Calculator,
  Sparkles,
  TrendingUp,
  Lightbulb,
  Info,
  ArrowRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SaveFounderPackButton } from "@/components/save-founder-pack-button";
import { cn, formatAud, formatPercent } from "@/lib/utils";
import {
  AU_PRE_INCORP_BAND,
  TAM_PRESETS,
  computeIdeaValuation,
  validateCombinations,
  type FounderTraits,
  type IdeaValuationInput,
  type Score1to5,
  type TeamCompleteness,
  type TractionSignals,
} from "@/lib/idea-valuation";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { saveIdeaEvalState } from "@/lib/idea-phase/session-state";

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
  const searchParams = useSearchParams();
  const fromClarify = searchParams.get("from_clarify") === "1";
  const ideaHint = searchParams.get("idea_hint") ?? "";

  const [input, setInput] = React.useState<IdeaValuationInput>(DEFAULTS);
  const [ideaName, setIdeaName] = React.useState<string>("");
  const [ideaPitch, setIdeaPitch] = React.useState<string>("");
  const out = React.useMemo(() => computeIdeaValuation(input), [input]);
  const warnings = React.useMemo(() => validateCombinations(input), [input]);

  // Mirror inputs to sessionStorage so the Save Founder Pack modal can pick
  // them up when the user clicks "Save my Founder Pack" anywhere on the site.
  React.useEffect(() => {
    saveIdeaEvalState(input, ideaName || null);
  }, [input, ideaName]);

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
    <div className="space-y-6">
      {/* ── HERO: estimate first, above the fold ── */}
      <section aria-labelledby="idea-outputs" className="rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/8 via-white to-white p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-medium flex items-center gap-2">
              <Sparkles strokeWidth={1.75} className="h-4 w-4" />
              {ideaName.trim() ? `${ideaName.trim()} — pre-money estimate` : "Pre-money estimate · updates live"}
            </p>
            <p id="idea-outputs" className="mt-2 font-mono tabular-nums text-4xl md:text-5xl font-bold text-ink-900 tracking-tight">
              {formatAud(out.lowAud)} – {formatAud(out.highAud)}
            </p>
            <p className="mt-2 text-sm text-ink-400">
              Mid-point{" "}
              <span className="font-mono tabular-nums text-ink-600 font-medium">
                {formatAud(out.midAud)}
              </span>
              {" · "}Scorecard{" "}
              <span className="font-mono tabular-nums text-ink-600 font-medium">
                {out.scorecardMultiplier.toFixed(2)}x
              </span>
              {" · "}±35% idea-stage band
            </p>
          </div>
          <div className="flex-shrink-0">
            <SaveFounderPackButton className="h-10 w-full sm:w-auto" />
          </div>
        </div>

        <p className="mt-3 flex items-start gap-2 text-xs text-ink-500">
          <Info strokeWidth={1.75} className="h-4 w-4 mt-0.5 text-brand-600 flex-shrink-0" />
          <span>{out.confidence}</span>
        </p>

        {warnings.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/8 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-600 mb-2">
              ⚠ Investor reality check
            </p>
            <ul className="space-y-1.5">
              {warnings.map((w, i) => (
                <li key={i} className="text-xs text-amber-800 leading-relaxed">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Compact per-factor bar strip */}
        <div className="mt-5 grid grid-cols-5 gap-2">
          {out.factors.map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5" title={`${f.label}: ${formatAud(f.valueAud)} / ${formatAud(f.capAud)}`}>
              <div className="h-1.5 w-full rounded-full bg-surface-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, f.fillRatio * 100).toFixed(1)}%` }}
                />
              </div>
              <span className="text-[10px] text-ink-400 leading-none truncate">{f.label}</span>
            </div>
          ))}
        </div>
      </section>

      {fromClarify && ideaHint && (
        <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-3 flex items-start gap-3">
          <ArrowRight strokeWidth={1.75} className="h-4 w-4 mt-0.5 text-brand-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-brand-700">Carried over from Idea Clarify</p>
            <p className="mt-0.5 text-xs text-ink-500 truncate">{ideaHint}</p>
            <p className="mt-1 text-xs text-ink-400">
              Score each signal honestly — your idea description is context, not a free pass on the sliders.
            </p>
          </div>
        </div>
      )}

      {/* ── TWO-COLUMN: signals (left) | detail + save (right) ── */}
      <div className="grid lg:grid-cols-2 gap-8">
        <section
          aria-labelledby="idea-inputs"
          className="rounded-2xl border border-surface-200 bg-white p-6 md:p-8"
        >
          <h2
            id="idea-inputs"
            className="text-base font-semibold text-ink-800 flex items-center gap-2"
          >
            <Calculator strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            Refine the signals
          </h2>

          {/* Idea name + pitch inline at top of form */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="idea-name-top" className="text-sm">Name</Label>
              <Input
                id="idea-name-top"
                placeholder="e.g. Acme"
                value={ideaName}
                onChange={(e) => setIdeaName(e.target.value)}
                maxLength={120}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="idea-pitch-top" className="text-sm">
                One-line pitch <span className="text-ink-400">(optional)</span>
              </Label>
              <Input
                id="idea-pitch-top"
                placeholder="AU SaaS for tradies..."
                value={ideaPitch}
                onChange={(e) => setIdeaPitch(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>

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
                        ? "border-brand-500/60 bg-brand-500/10 text-brand-500"
                        : "border-surface-200 bg-white text-ink-400 hover:border-brand-500/40 hover:text-ink-600",
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
              tooltip="Berkus pillar 1 — Sound Idea. Score how acutely your target users feel this problem: 1 = mild inconvenience, 5 = something they lose money or sleep over. Calibrate with real customer interviews, not assumptions."
              anchorChecks={[
                "Have you interviewed 10+ potential customers who named this problem unprompted (not in response to a leading question)?",
                "Can you quantify the cost of this problem — in AUD lost, hours wasted, or risk exposure — per affected user per month?",
              ]}
              value={input.problemSeverity}
              onChange={(v) => setScore("problemSeverity")(v)}
              labels={SEVERITY_LABELS}
            />

            <RadioGroup
              id="founder"
              label="Founder strength"
              tooltip="Berkus pillar 3 — Quality Team. Scorecard method rates this 0–25% of the multiplier. Seed investors back the team first. Be honest: investors will find out your track record."
              anchorChecks={[
                "Is there a public record (LinkedIn, Crunchbase, media) of the prior exit or relevant domain success you're claiming?",
                "Is every founding member working on this full-time or with a signed commitment to go full-time at a defined milestone?",
              ]}
              value={input.founderStrength}
              onChange={(v) => setScore("founderStrength")(v)}
              labels={FOUNDER_LABELS}
            />
            <CheckboxGroup
              label="Founder traits"
              tooltip="Verified credentials that make the founder rating credible. These are checkable facts — prior exit is public record, domain expertise should be on LinkedIn."
              fields={FOUNDER_TRAIT_FIELDS}
              values={input.founderTraits}
              onToggle={(k) => toggleFounderTrait(k as keyof FounderTraits)}
            />

            <RadioGroup
              id="maturity"
              label="Solution maturity"
              tooltip="Berkus pillar 2 — Prototype. Investors care about de-risking execution: a working prototype proves the team can ship. Score based on what exists today, not what you're planning to build."
              anchorChecks={[
                "Is there a URL or TestFlight link an investor could click on today to see this working?",
                "How many unique users have activated (taken a core action) in the last 30 days?",
              ]}
              value={input.solutionMaturity}
              onChange={(v) => setScore("solutionMaturity")(v)}
              labels={MATURITY_LABELS}
            />

            <CheckboxGroup
              label="Traction signals"
              tooltip="Berkus pillars 4 & 5 — Strategic Relationships + Product Rollout. Paid LOIs and pilots outweigh free waitlists 3:1. Paying customers are the single biggest valuation lever at idea-stage."
              fields={TRACTION_FIELDS}
              values={input.traction}
              onToggle={(k) => toggleTraction(k as keyof TractionSignals)}
            />

            <RadioGroup
              id="moat"
              label="Moat strength"
              tooltip="Scorecard multiplier component (worth up to +0.25x). True moats are hard to copy: proprietary data, network effects, regulatory licence, or deep tech IP. 'We'll move fast' is not a moat."
              anchorChecks={[
                "What specifically would it take a well-funded competitor to replicate your moat within 12 months?",
                "Is your moat documented — filed patent, signed data agreement, regulatory licence number, or demonstrable network size?",
              ]}
              value={input.moatStrength}
              onChange={(v) => setScore("moatStrength")(v)}
              labels={MOAT_LABELS}
            />

            <RadioGroup
              id="competition"
              label="Competition density"
              tooltip="Scorecard multiplier component (worth up to +0.15x). An uncontested market can mean huge opportunity or no demand — be ready to explain which. AU seed investors discount 'no competitors' claims."
              anchorChecks={[
                "Have you searched 3+ variations of your value proposition on Google, ProductHunt, Crunchbase, and AngelList?",
                "If you believe this is uncontested: what is your hypothesis for why a gap this large still exists?",
              ]}
              value={input.competitionDensity}
              onChange={(v) => setScore("competitionDensity")(v)}
              labels={COMPETITION_LABELS}
            />

            <CheckboxGroup
              label="Team completeness"
              tooltip="Berkus pillar 3 sub-factor. Missing a CTO in a tech startup or a commercial lead in a B2B startup is a direct valuation discount. Advisors don't count — equity-holding co-founders do."
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

        {/* Right column: factor detail + suggestions + compare + save */}
        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-surface-200 bg-white p-6 md:p-8">
            <p className="text-xs uppercase tracking-[0.2em] text-ink-800 font-medium">
              Per-factor breakdown
            </p>
            <ul className="mt-4 space-y-4">
              {out.factors.map((f) => (
                <li key={f.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-ink-600">
                      {f.label}
                    </span>
                    <span className="font-mono tabular-nums text-xs text-ink-400">
                      {formatAud(f.valueAud)} / {formatAud(f.capAud)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full rounded-full bg-surface-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-300"
                      style={{
                        width: `${Math.min(100, f.fillRatio * 100).toFixed(1)}%`,
                      }}
                      aria-label={`${f.label} ${formatPercent(f.fillRatio * 100, 0)}`}
                    />
                  </div>
                  <p className="mt-1 text-xs text-ink-500">{f.note}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-surface-200 bg-surface-50 p-6">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-500 font-medium">
              <Lightbulb strokeWidth={1.75} className="h-4 w-4 text-amber-500" />
              What would lift this most
            </p>
            {out.suggestions.length === 0 ? (
              <p className="mt-3 text-sm text-ink-400">
                You&apos;re near the ceiling for idea-stage. Real upside now comes from negotiation and hard signal.
              </p>
            ) : (
              <ol className="mt-3 space-y-3">
                {out.suggestions.map((s, i) => (
                  <li key={s.title} className="flex gap-3">
                    <span className="font-mono tabular-nums text-xs text-brand-600 mt-0.5">
                      {i + 1}.
                    </span>
                    <div>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-semibold text-ink-700">
                          {s.title}
                        </span>
                        <span className="font-mono tabular-nums text-xs text-brand-600">
                          +{formatAud(s.upliftAud)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-400">{s.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="rounded-2xl border border-surface-200 bg-white p-6">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-400 font-medium">
              <TrendingUp strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
              How this compares
            </p>
            <p className="mt-2 text-sm text-ink-500">
              Typical AU pre-incorporation pre-money sits between{" "}
              <span className="font-mono tabular-nums text-ink-800">
                {formatAud(AU_PRE_INCORP_BAND.lowAud)}
              </span>{" "}
              and{" "}
              <span className="font-mono tabular-nums text-ink-800">
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
          </section>

          <section className="rounded-2xl border border-brand-500/40 bg-gradient-to-br from-white to-brand-500/5 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
              Lock this in
            </p>
            <p className="mt-2 text-sm text-ink-500">
              Save{" "}
              {ideaName.trim() ? (
                <span className="font-semibold text-ink-700">{ideaName.trim()}</span>
              ) : (
                "this valuation"
              )}{" "}
              as a shareable{" "}
              <span className="font-semibold text-ink-700">Founder Pack</span>{" "}
              — PDF + dashboard with view tracking. Free, no password.
            </p>
            <div className="mt-4">
              <SaveFounderPackButton className="h-11 w-full" />
            </div>
            <p className="mt-3 text-xs text-ink-400">
              Idea-stage estimate. Real valuation is set by your first investor — use this as an anchor, not a quote.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function RadioGroup({
  id,
  label,
  tooltip,
  anchorChecks,
  value,
  onChange,
  labels,
}: {
  id: string;
  label: string;
  tooltip?: string;
  anchorChecks?: string[];
  value: Score1to5;
  onChange: (v: Score1to5) => void;
  labels: Record<Score1to5, string>;
}) {
  const options: Score1to5[] = [1, 2, 3, 4, 5];
  const showAnchor = value >= 4 && anchorChecks && anchorChecks.length > 0;
  return (
    <fieldset>
      <legend className="flex items-center gap-1.5 text-sm font-medium text-ink-600">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
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
                  ? "border-brand-500/60 bg-brand-500/10 text-brand-500"
                  : "border-surface-200 bg-white text-ink-400 hover:border-brand-500/40 hover:text-ink-600",
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
      <p className="mt-1.5 text-xs text-ink-800">
        <span className="font-mono tabular-nums text-ink-500">{value}</span> ·{" "}
        {labels[value]}
      </p>
      {showAnchor && (
        <div className="mt-2 rounded-lg border border-amber-300/50 bg-amber-50/60 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700 mb-1.5">
            Investor calibration — can you confirm?
          </p>
          <ul className="space-y-1">
            {anchorChecks!.map((check, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-amber-900 leading-relaxed">
                <span className="mt-0.5 font-mono text-amber-500">›</span>
                {check}
              </li>
            ))}
          </ul>
        </div>
      )}
    </fieldset>
  );
}

function CheckboxGroup<T extends string>({
  label,
  tooltip,
  fields,
  values,
  onToggle,
}: {
  label: string;
  tooltip?: string;
  fields: { key: T; label: string }[];
  values: Record<T, boolean>;
  onToggle: (key: T) => void;
}) {
  return (
    <fieldset>
      <legend className="flex items-center gap-1.5 text-sm font-medium text-ink-600">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
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
                  ? "border-brand-500/60 bg-brand-500/10 text-ink-700"
                  : "border-surface-200 bg-white text-ink-400 hover:border-brand-500/40 hover:text-ink-600",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(f.key)}
                className="h-4 w-4 rounded border-surface-200 bg-white text-brand-500 focus:ring-brand-500/40"
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
        fill="#3B7DD8"
        rx={2}
      />
    </svg>
  );
}
