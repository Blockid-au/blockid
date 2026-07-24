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
  WGEAInput,
  WGEAResult,
} from "@/lib/compliance/wgea-threshold";
import {
  fromWgeaInput,
  makeEmptyWgeaFormState,
  pickWgeaBand,
  toWgeaInput,
  type WgeaFormState,
} from "./wgea-form.helpers";

interface Props {
  initialInput: WGEAInput | null;
  initialResult: WGEAResult | null;
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
}) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-ink-800">{props.label}</div>
      {props.hint ? (
        <div className="text-xs text-ink-500 mt-0.5">{props.hint}</div>
      ) : null}
      <input
        type={props.type ?? "number"}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-2 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </label>
  );
}

const HEADLINES: Record<WGEAResult["action_required"], string> = {
  report_required: "WGEA report required",
  approaching_threshold: "Approaching the WGEA threshold",
  grace_period: "In the WGEA s3B(2) grace period",
  already_reporting: "WGEA report on file",
  not_required: "Below the WGEA threshold",
};

export function WgeaFormClient(props: Props) {
  const [state, setState] = React.useState<WgeaFormState>(() =>
    props.initialInput ? fromWgeaInput(props.initialInput) : makeEmptyWgeaFormState(),
  );
  const [result, setResult] = React.useState<WGEAResult | null>(
    props.initialResult ?? null,
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const patch = React.useCallback(
    <K extends keyof WgeaFormState>(key: K, value: WgeaFormState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = toWgeaInput(state);
      const res = await fetch("/api/compliance/wgea-threshold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok: boolean;
        result?: WGEAResult;
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

  const band = result ? pickWgeaBand(result) : null;
  const BandStyle = band ? BAND_STYLES[band] : null;

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-brand-600 font-medium">
          <ShieldCheck strokeWidth={1.75} className="h-4 w-4" />
          WGE Act 2012 (Cth) s3 · headcount worksheet
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-ink-800">
          WGEA reporting threshold
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-ink-600 leading-relaxed">
          Enter your Australian headcount (excluding contractors and offshore
          staff). We check whether you cross the 100-employee "relevant
          employer" threshold in s3 of the Workplace Gender Equality Act 2012
          (Cth), and — if you have previously lodged — surface the s3B(2)
          two-period grace window.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-ink-800">
            Current headcount
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField
              label="Australian employees today"
              hint="Count only employees paid by an AU-registered entity. Excludes contractors, agency workers, and offshore staff."
              value={state.current_headcount_au}
              onChange={(v) => patch("current_headcount_au", v)}
              min={0}
            />
            <TextField
              label="Monthly headcount last 12 months"
              hint="Optional. Comma or space separated (oldest → newest). We use the peak for the s3 test — a mid-year spike still counts."
              value={state.monthly_headcount_last_12_months}
              onChange={(v) => patch("monthly_headcount_last_12_months", v)}
              type="text"
              placeholder="60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 108"
            />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink-800">
            Prior reporting history
          </h2>
          <p className="text-xs text-ink-500 mt-1">
            The s3B(2) grace period keeps you a relevant employer for 2 more
            reporting periods after your headcount first drops below 100.
          </p>
          <div className="mt-4 space-y-3">
            <Toggle
              label="We have previously lodged a WGEA report"
              hint="If yes, we apply the s3B(2) grace-period rule instead of dropping you from the reporting cohort immediately."
              checked={state.has_previously_reported}
              onChange={(v) => patch("has_previously_reported", v)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Date most recent report was lodged"
                hint="Optional. ISO date (YYYY-MM-DD)."
                value={state.last_report_lodged_at}
                onChange={(v) => patch("last_report_lodged_at", v)}
                type="date"
              />
              <TextField
                label="Reporting periods since headcount last ≥ 100"
                hint="0 = still above 100. 2+ = grace period has expired."
                value={state.reporting_periods_since_last_over_threshold}
                onChange={(v) =>
                  patch("reporting_periods_since_last_over_threshold", v)
                }
                min={0}
                max={10}
                placeholder="0"
              />
            </div>
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
          data-testid="wgea-result-banner"
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
                Current headcount:{" "}
                <strong>{result.current_headcount_au}</strong> · peak 12mo:{" "}
                <strong>{result.peak_headcount_last_12_months}</strong> ·
                threshold: <strong>{result.threshold_headcount}</strong>
                {result.next_report_due_iso ? (
                  <>
                    {" "}
                    · next report due:{" "}
                    <strong>{result.next_report_due_iso}</strong>
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
