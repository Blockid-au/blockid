"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Scale,
  XCircle,
} from "lucide-react";
import {
  assessStructureDecision,
  OFFSHORE_PARENT_MIN_REVENUE_AUD,
  type StructureDecision,
} from "@/lib/fundraise/structure-decision";
import {
  makeEmptyStructureDecisionFormState,
  pickStructureBand,
  STRUCTURE_HEADLINE,
  toStructureDecisionInput,
  type StructureBand,
  type StructureDecisionFormState,
} from "./structure-decision-form.helpers";

const BAND_STYLES: Record<
  StructureBand,
  {
    border: string;
    bg: string;
    text: string;
    Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  }
> = {
  slate: {
    border: "border-slate-300",
    bg: "bg-slate-50",
    text: "text-slate-700",
    Icon: Info,
  },
  emerald: {
    border: "border-emerald-300",
    bg: "bg-emerald-50/60",
    text: "text-emerald-800",
    Icon: CheckCircle2,
  },
  amber: {
    border: "border-amber-300",
    bg: "bg-amber-50/60",
    text: "text-amber-800",
    Icon: AlertTriangle,
  },
  red: {
    border: "border-red-300",
    bg: "bg-red-50/60",
    text: "text-red-800",
    Icon: XCircle,
  },
};

const QUESTIONS: {
  key: keyof StructureDecisionFormState;
  label: string;
  hint?: string;
}[] = [
  {
    key: "wants_us_listing",
    label: "Do you plan to list on a US exchange (NASDAQ / NYSE)?",
    hint: "Atlassian 2015 NASDAQ IPO used a UK-Plc dual-class parent (Companies Act 2006 Part 26 Scheme).",
  },
  {
    key: "wants_asx_listing",
    label: "Do you plan to list on the ASX?",
    hint: "ASX Listing Rule 6.9 requires one-vote-per-share on a poll — no waiver track for founder-control dual-class.",
  },
  {
    key: "wants_founder_control_after_dilution",
    label: "Do you want founder voting control preserved after 2+ Series rounds of dilution?",
  },
  {
    key: "expects_2plus_venture_rounds",
    label: "Do you expect to raise 2 or more venture rounds?",
  },
  {
    key: "has_us_offshore_parent_appetite",
    label: "Do you have appetite (~A$300k–A$800k budget + 6–12 months) for a UK-Plc / Delaware-C-corp restructure?",
  },
  {
    key: "has_specialist_counsel_engaged",
    label: "Have you already engaged cross-border corporate + tax counsel (Corrs / HSF / DLA / Cooley)?",
  },
];

export function StructureDecisionFormClient() {
  const [state, setState] = React.useState<StructureDecisionFormState>(
    makeEmptyStructureDecisionFormState,
  );
  const [result, setResult] = React.useState<StructureDecision | null>(null);

  const patch = React.useCallback(
    <K extends keyof StructureDecisionFormState>(
      key: K,
      value: StructureDecisionFormState[K],
    ) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const wire = toStructureDecisionInput(state);
    setResult(assessStructureDecision(wire));
  }

  function handleReset() {
    setState(makeEmptyStructureDecisionFormState());
    setResult(null);
  }

  const band = result
    ? pickStructureBand(result.recommendation, result.blocked_paths.length)
    : null;
  const bandStyle = band ? BAND_STYLES[band] : null;

  return (
    <section
      aria-label="Chapter 10 dual-class decision quiz"
      className="rounded-2xl border border-border bg-background p-6 space-y-6"
    >
      <header>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-brand-600 font-medium">
          <Scale strokeWidth={1.75} className="h-4 w-4" />
          Chapter 10 · Single-class vs dual-class quiz
        </div>
        <h2 className="mt-2 text-xl font-semibold text-ink-800">
          Model your share-structure decision
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-600 leading-relaxed">
          The honest AU default is single-class. This quiz walks the four
          founder-control + listing questions the Chapter 10 dual-class
          decision section covers and tells you whether the offshore-parent
          restructure is worth the six-figure legal budget for your situation.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-ink-800">
            Answer any question you can
          </legend>
          {QUESTIONS.map((q) => (
            <label
              key={q.key}
              className="flex items-start gap-3 rounded-lg border border-surface-200 bg-surface-50 p-3 text-sm text-ink-700"
            >
              <input
                type="checkbox"
                checked={Boolean(state[q.key])}
                onChange={(e) =>
                  patch(
                    q.key,
                    e.target.checked as StructureDecisionFormState[typeof q.key],
                  )
                }
                className="mt-0.5 h-4 w-4 shrink-0"
                data-testid={`structure-q-${q.key}`}
              />
              <span className="space-y-1">
                <span className="block font-medium text-ink-800">{q.label}</span>
                {q.hint ? (
                  <span className="block text-xs text-ink-500">{q.hint}</span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>

        <label className="block">
          <div className="text-sm font-semibold text-ink-800">
            Latest annual revenue (AUD, optional)
          </div>
          <div className="text-xs text-ink-500 mt-1">
            Threshold for the offshore-parent option is A${OFFSHORE_PARENT_MIN_REVENUE_AUD.toLocaleString("en-AU")}.
            Below this, most firms will steer you to single-class-with-protections.
          </div>
          <input
            type="number"
            min="0"
            step="1"
            value={state.annual_revenue_aud}
            onChange={(e) => patch("annual_revenue_aud", e.target.value)}
            placeholder="5000000"
            className="mt-2 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            data-testid="structure-q-annual_revenue_aud"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="h-11 px-6 rounded-2xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700"
            data-testid="structure-submit"
          >
            Run structure decision
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="h-11 px-6 rounded-2xl border border-border text-sm font-semibold text-ink-700 hover:bg-surface-100"
          >
            Reset
          </button>
        </div>
      </form>

      {result && bandStyle ? (
        <section
          data-testid="structure-result-banner"
          data-recommendation={result.recommendation}
          className={`rounded-2xl border-2 p-6 space-y-3 ${bandStyle.border} ${bandStyle.bg}`}
        >
          <div className="flex items-start gap-3">
            <bandStyle.Icon
              strokeWidth={1.75}
              className={`h-7 w-7 mt-0.5 shrink-0 ${bandStyle.text}`}
            />
            <div>
              <h3 className={`text-lg font-bold ${bandStyle.text}`}>
                {STRUCTURE_HEADLINE[result.recommendation]}
              </h3>
              {result.triggers.length > 0 ? (
                <p className="text-xs text-ink-600 mt-1">
                  Signals: <strong>{result.triggers.join(", ")}</strong>
                </p>
              ) : null}
            </div>
          </div>

          {result.blocked_paths.length > 0 ? (
            <div className="rounded-lg border border-red-200 bg-white/60 p-3 text-sm text-red-800">
              <strong>Blocked paths:</strong> {result.blocked_paths.join(", ")}
            </div>
          ) : null}

          {result.warnings.length > 0 ? (
            <ul className="list-disc list-outside pl-5 space-y-1 text-sm text-ink-700">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          {result.next_steps.length > 0 ? (
            <div>
              <p className="text-sm font-semibold text-ink-800">Next steps</p>
              <ol className="list-decimal list-outside pl-5 mt-1 space-y-1 text-sm text-ink-700">
                {result.next_steps.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      ) : null}

      <p className="text-xs text-ink-400 leading-relaxed">
        {result?.disclaimer ??
          "Answer at least one question and press Run to see the disclaimer with the recommendation."}
      </p>
    </section>
  );
}
