"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ESICInput, ESICResult } from "@/lib/compliance/esic-eligibility";
import {
  fromEsicInput,
  makeEmptyFormState,
  pickResultBand,
  toEsicInput,
  type EsicFormState,
} from "./esic-form.helpers";

interface Props {
  initialInput: ESICInput | null;
  initialResult: ESICResult | null;
  disclaimer: string;
}

const BAND_STYLES = {
  green: {
    border: "border-emerald-300",
    bg: "bg-emerald-50/60",
    text: "text-emerald-800",
    Icon: CheckCircle2,
    headline: "ESIC self-assessment: eligible",
  },
  amber: {
    border: "border-amber-300",
    bg: "bg-amber-50/60",
    text: "text-amber-800",
    Icon: AlertTriangle,
    headline: "ESIC self-assessment: close, not yet eligible",
  },
  red: {
    border: "border-red-200",
    bg: "bg-red-50/40",
    text: "text-red-800",
    Icon: XCircle,
    headline: "ESIC self-assessment: not eligible",
  },
} as const;

function Toggle(props: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xl border border-surface-200 bg-white p-4 cursor-pointer">
      <div className="flex-1">
        <div className="text-sm font-semibold text-ink-800">{props.label}</div>
        {props.hint ? (
          <div className="text-xs text-ink-500 mt-0.5">{props.hint}</div>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 mt-0.5",
          props.checked ? "bg-brand-600" : "bg-surface-300",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
            props.checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </label>
  );
}

function TextField(props: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "number";
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-ink-800">{props.label}</div>
      {props.hint ? (
        <div className="text-xs text-ink-500 mt-0.5">{props.hint}</div>
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        <input
          type={props.type ?? "number"}
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          className="flex-1 rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {props.suffix ? (
          <span className="text-xs text-ink-500">{props.suffix}</span>
        ) : null}
      </div>
    </label>
  );
}

export function EsicAssessmentClient(props: Props) {
  const [state, setState] = React.useState<EsicFormState>(() =>
    props.initialInput ? fromEsicInput(props.initialInput) : makeEmptyFormState(),
  );
  const [result, setResult] = React.useState<ESICResult | null>(
    props.initialResult ?? null,
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const patch = React.useCallback(
    <K extends keyof EsicFormState>(key: K, value: EsicFormState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = toEsicInput(state);
      const res = await fetch("/api/compliance/esic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok: boolean;
        result?: ESICResult;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.result) {
        setError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      setResult(json.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }

  const band = result ? pickResultBand(result) : null;
  const BandStyle = band ? BAND_STYLES[band] : null;

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-brand-600 font-medium">
          <ShieldCheck strokeWidth={1.75} className="h-4 w-4" />
          Div 360 ITAA97 · self-assessment worksheet
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-ink-800">
          ESIC Eligibility Self-Assessment
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-ink-600 leading-relaxed">
          Walk the two limbs of the Early Stage Innovation Company test: the
          early-stage size caps (limb 1) and the innovation gate (limb 2 —
          100-point test OR five principles-based sub-tests). Saved answers
          feed the Fundraise ESIC gate and your data-room evidence pack.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-10">
        {/* ── Limb 1: early stage ────────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800">
            Limb 1 — Early-stage test
          </h2>
          <p className="text-xs text-ink-500 mt-1">
            All four caps must be true. R&D-heavy companies get 6 years instead
            of 3.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField
              label="Incorporation year"
              hint="Year the company was registered with ASIC"
              value={state.company_incorporated_year}
              onChange={(v) => patch("company_incorporated_year", v)}
              min={1990}
              max={new Date().getUTCFullYear()}
            />
            <TextField
              label="Incorporation month"
              hint="1-12; leave 1 if you're unsure"
              value={state.company_incorporated_month}
              onChange={(v) => patch("company_incorporated_month", v)}
              min={1}
              max={12}
            />
            <TextField
              label="Prior-year assessable income (AUD)"
              hint="Cap: A$200,000 excluding ARC / AAERC grants"
              value={state.turnover_prior_year_aud}
              onChange={(v) => patch("turnover_prior_year_aud", v)}
              min={0}
              step={1000}
            />
            <TextField
              label="Prior-year total expenses (AUD)"
              hint="Cap: A$1,000,000"
              value={state.total_expenses_prior_year_aud}
              onChange={(v) => patch("total_expenses_prior_year_aud", v)}
              min={0}
              step={1000}
            />
          </div>
          <div className="mt-4 space-y-3">
            <Toggle
              label="Listed on any stock exchange"
              hint="Listed companies cannot qualify — leave off unless post-IPO"
              checked={state.is_listed}
              onChange={(v) => patch("is_listed", v)}
            />
            <Toggle
              label="Company has R&D expenditure"
              hint="Unlocks the 6-year age cap instead of 3 years"
              checked={state.has_r_and_d_expenditure}
              onChange={(v) => patch("has_r_and_d_expenditure", v)}
            />
          </div>
        </section>

        {/* ── Limb 2a: 100-point test ────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800">
            Limb 2a — 100-point innovation test
          </h2>
          <p className="text-xs text-ink-500 mt-1">
            Score ≥ 100 to pass this limb. Trademarks are NOT eligible under
            s 360-45.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Toggle
              label="Australian standard patent (+50)"
              checked={state.points_australian_patent}
              onChange={(v) => patch("points_australian_patent", v)}
            />
            <Toggle
              label="Innovation patent / registered design (+25)"
              checked={state.points_innovation_patent}
              onChange={(v) => patch("points_innovation_patent", v)}
            />
            <Toggle
              label="Plant Breeder's Rights (+25)"
              checked={state.points_plant_breeder_rights}
              onChange={(v) => patch("points_plant_breeder_rights", v)}
            />
            <Toggle
              label="Trademarks (0 pts, tracked for feedback)"
              checked={state.points_trademarks}
              onChange={(v) => patch("points_trademarks", v)}
            />
            <Toggle
              label="AusIndustry-accredited accelerator alumnus (+50)"
              checked={state.points_accelerator_alumni}
              onChange={(v) => patch("points_accelerator_alumni", v)}
            />
            <Toggle
              label="Licensed tech from AU university / PFRA (+25)"
              checked={state.points_licensed_technology_from_university}
              onChange={(v) =>
                patch("points_licensed_technology_from_university", v)
              }
            />
            <TextField
              label="Third-party capital raised (AUD)"
              hint="≥ A$50,000 in current or prior income year → +50 pts"
              value={state.points_third_party_capital_raised_aud}
              onChange={(v) =>
                patch("points_third_party_capital_raised_aud", v)
              }
              min={0}
              step={1000}
            />
            <TextField
              label="R&D as % of prior-year expenses"
              hint="15-50% → +50 pts · >50% → +75 pts"
              value={state.points_r_and_d_expenditure_pct}
              onChange={(v) => patch("points_r_and_d_expenditure_pct", v)}
              min={0}
              max={100}
              step={1}
              suffix="%"
            />
          </div>
        </section>

        {/* ── Limb 2b: principles-based test ─────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800">
            Limb 2b — Principles-based test
          </h2>
          <p className="text-xs text-ink-500 mt-1">
            All five sub-tests must be true to pass this limb (an alternative
            path to limb 2a).
          </p>
          <div className="mt-4 space-y-3">
            <Toggle
              label="Genuinely focused on developing a new or improved product / service / process"
              checked={state.principles_new_or_improved}
              onChange={(v) => patch("principles_new_or_improved", v)}
            />
            <Toggle
              label="High growth potential"
              checked={state.principles_high_growth}
              onChange={(v) => patch("principles_high_growth", v)}
            />
            <Toggle
              label="Can scale broader than the local market"
              checked={state.principles_scalable}
              onChange={(v) => patch("principles_scalable", v)}
            />
            <Toggle
              label="Has competitive advantage"
              checked={state.principles_competitive_advantage}
              onChange={(v) =>
                patch("principles_competitive_advantage", v)
              }
            />
            <Toggle
              label="Can demonstrate a broader-than-local market"
              checked={state.principles_broader_market}
              onChange={(v) => patch("principles_broader_market", v)}
            />
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="h-11 px-6 rounded-2xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving assessment…
              </>
            ) : (
              "Save & assess"
            )}
          </button>
        </div>
      </form>

      {result && BandStyle ? (
        <section
          data-testid="esic-result-banner"
          className={cn(
            "rounded-2xl border-2 p-6 space-y-4",
            BandStyle.border,
            BandStyle.bg,
          )}
        >
          <div className="flex items-start gap-3">
            <BandStyle.Icon
              strokeWidth={1.75}
              className={cn("h-7 w-7 mt-0.5 shrink-0", BandStyle.text)}
            />
            <div>
              <h3 className={cn("text-lg font-bold", BandStyle.text)}>
                {BandStyle.headline}
              </h3>
              <p className="text-xs text-ink-600 mt-1">
                100-point score: <strong>{result.eligible_innovation_100pt}</strong> ·
                principles pass: <strong>{result.eligible_innovation_principles ? "yes" : "no"}</strong> ·
                early-stage pass: <strong>{result.eligible_early_stage ? "yes" : "no"}</strong>
              </p>
            </div>
          </div>
          {result.gaps.length > 0 ? (
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-500 font-medium">
                Gaps
              </div>
              <ul className="mt-2 list-disc pl-5 text-sm text-ink-700 space-y-1">
                {result.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.recommendations.length > 0 ? (
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-500 font-medium">
                Recommendations
              </div>
              <ul className="mt-2 list-disc pl-5 text-sm text-ink-700 space-y-1">
                {result.recommendations.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <p className="text-xs text-ink-400 leading-relaxed">
        {props.disclaimer}
      </p>
    </div>
  );
}
