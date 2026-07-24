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
import type {
  ModernSlaveryInput,
  ModernSlaveryResult,
} from "@/lib/compliance/modern-slavery-threshold";
import {
  fromModernSlaveryInput,
  makeEmptyModernSlaveryFormState,
  pickModernSlaveryBand,
  toModernSlaveryInput,
  type ModernSlaveryFormState,
} from "./modern-slavery-form.helpers";

interface Props {
  initialInput: ModernSlaveryInput | null;
  initialResult: ModernSlaveryResult | null;
  disclaimer: string;
}

const BAND_STYLES = {
  green: {
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
    border: "border-red-200",
    bg: "bg-red-50/40",
    text: "text-red-800",
    Icon: XCircle,
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
  type?: "text" | "number" | "date";
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
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
          placeholder={props.placeholder}
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

const HEADLINES: Record<ModernSlaveryResult["action_required"], string> = {
  statement_overdue: "Modern Slavery statement overdue",
  statement_due_soon: "Statement due soon",
  statement_required: "Statement required",
  approaching_threshold: "Approaching the A$100M threshold",
  already_lodged: "Statement on file",
  not_required: "Below the reporting threshold",
};

export function ModernSlaveryFormClient(props: Props) {
  const [state, setState] = React.useState<ModernSlaveryFormState>(() =>
    props.initialInput
      ? fromModernSlaveryInput(props.initialInput)
      : makeEmptyModernSlaveryFormState(),
  );
  const [result, setResult] = React.useState<ModernSlaveryResult | null>(
    props.initialResult ?? null,
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const patch = React.useCallback(
    <K extends keyof ModernSlaveryFormState>(
      key: K,
      value: ModernSlaveryFormState[K],
    ) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = toModernSlaveryInput(state);
      const res = await fetch("/api/compliance/modern-slavery-threshold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok: boolean;
        result?: ModernSlaveryResult;
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

  const band = result ? pickModernSlaveryBand(result) : null;
  const BandStyle = band ? BAND_STYLES[band] : null;

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-brand-600 font-medium">
          <ShieldCheck strokeWidth={1.75} className="h-4 w-4" />
          Modern Slavery Act 2018 (Cth) s5 · revenue worksheet
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-ink-800">
          Modern Slavery reporting threshold
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-ink-600 leading-relaxed">
          Enter your consolidated revenue (AASB 10 controlled-entity
          aggregation) for the current and prior financial year. We check
          whether you cross the A$100M s5 threshold and — when you do — surface
          the 6-month post-FY-end statement window in s13.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-ink-800">Revenue</h2>
          <p className="text-xs text-ink-500 mt-1">
            All figures in AUD, consolidated at the parent-entity level. Use
            projected FY revenue if the current period is not yet closed.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField
              label="Current period revenue so far (AUD)"
              hint="Consolidated revenue booked in the current FY to date."
              value={state.current_period_revenue_aud}
              onChange={(v) => patch("current_period_revenue_aud", v)}
              min={0}
              step={1000}
              suffix="AUD"
            />
            <TextField
              label="Projected full-period revenue (AUD)"
              hint="Optional. Your best forecast for the full current FY. If blank we use the current-period figure."
              value={state.projected_full_period_revenue_aud}
              onChange={(v) =>
                patch("projected_full_period_revenue_aud", v)
              }
              min={0}
              step={1000}
              placeholder="e.g. 110000000"
              suffix="AUD"
            />
            <TextField
              label="Last completed FY revenue (AUD)"
              hint="Optional. If the most recently closed FY was above A$100M you may already be a reporting entity."
              value={state.last_full_period_revenue_aud}
              onChange={(v) => patch("last_full_period_revenue_aud", v)}
              min={0}
              step={1000}
              placeholder="e.g. 105000000"
              suffix="AUD"
            />
            <TextField
              label="Current FY end date"
              hint="Optional. Defaults to 30-June. Drives the 6-month s13 statement deadline."
              value={state.current_fy_end_iso}
              onChange={(v) => patch("current_fy_end_iso", v)}
              type="date"
            />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink-800">
            Reporting history &amp; scope
          </h2>
          <div className="mt-4 space-y-3">
            <Toggle
              label="Australian entity OR foreign entity carrying on business in Australia"
              hint="s5 only applies to entities within scope. Leave off only if you have taken formal advice that the entity is out of scope."
              checked={state.is_australian_or_carrying_on_business_in_au}
              onChange={(v) =>
                patch("is_australian_or_carrying_on_business_in_au", v)
              }
            />
            <TextField
              label="Date most recent Modern Slavery statement lodged"
              hint="Optional. ISO date (YYYY-MM-DD). Lets us tag you as already reporting."
              value={state.last_statement_lodged_at}
              onChange={(v) => patch("last_statement_lodged_at", v)}
              type="date"
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
                <Loader2 className="h-4 w-4 animate-spin" /> Saving check…
              </>
            ) : (
              "Save & check"
            )}
          </button>
        </div>
      </form>

      {result && BandStyle ? (
        <section
          data-testid="modern-slavery-result-banner"
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
                {HEADLINES[result.action_required]}
              </h3>
              <p className="text-xs text-ink-600 mt-1">
                Current: <strong>A${result.current_period_revenue_aud.toLocaleString("en-AU")}</strong> ·
                projected: <strong>A${result.projected_full_period_revenue_aud.toLocaleString("en-AU")}</strong> ·
                last FY: <strong>A${result.last_full_period_revenue_aud.toLocaleString("en-AU")}</strong>
                {result.statement_due_iso ? (
                  <>
                    {" "}
                    · statement due: <strong>{result.statement_due_iso}</strong>
                  </>
                ) : null}
                {typeof result.days_until_statement_due === "number" ? (
                  <>
                    {" "}
                    · days until due:{" "}
                    <strong>{result.days_until_statement_due}</strong>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <p className="text-sm text-ink-700 leading-relaxed">
            {result.reasoning}
          </p>
        </section>
      ) : null}

      <p className="text-xs text-ink-400 leading-relaxed">{props.disclaimer}</p>
    </div>
  );
}
