"use client";

// P12c-lp-report-ui — client composer for the accelerator LP-report founder
// slot. Runs the pure `assessLpReportSlot()` policy library in-browser (no
// fetch, no API, no I/O) so a founder can see the anonymisation redactions +
// warnings + coarsened bands flip live as they fill in the form.
//
// Mirrors the P11-acquisition-wizard-ui pattern intentionally: pure helpers
// live in `lp-report-composer.helpers.ts`; this file owns the UI shell +
// data-testid hooks so a future Playwright spec can attach without helper
// edits.

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  assessLpReportSlot,
  LP_REPORT_ANONYMISATION_DISCLAIMER,
  type LpReportRedaction,
  type LpReportSlotAssessment,
} from "@/lib/investor-pack/lp-report-anonymisation";
import {
  LP_REPORT_HEADLINE,
  makeEmptyLpReportComposerFormState,
  pickLpReportBand,
  toLpReportSlotInput,
  type LpReportBand,
  type LpReportComposerFormState,
} from "./lp-report-composer.helpers";

const BAND_STYLES: Record<
  LpReportBand,
  {
    border: string;
    bg: string;
    text: string;
    Icon: typeof CheckCircle2;
  }
> = {
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
  grey: {
    border: "border-surface-300",
    bg: "bg-surface-50",
    text: "text-ink-700",
    Icon: Info,
  },
};

function NumberField(props: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-ink-800">{props.label}</div>
      {props.hint ? (
        <div className="mt-0.5 text-xs text-ink-500">{props.hint}</div>
      ) : null}
      <input
        type="number"
        inputMode="decimal"
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

function TextField(props: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-ink-800">{props.label}</div>
      {props.hint ? (
        <div className="mt-0.5 text-xs text-ink-500">{props.hint}</div>
      ) : null}
      <input
        type="text"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="mt-2 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </label>
  );
}

function TextArea(props: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-ink-800">{props.label}</div>
      {props.hint ? (
        <div className="mt-0.5 text-xs text-ink-500">{props.hint}</div>
      ) : null}
      <textarea
        rows={props.rows ?? 3}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="mt-2 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </label>
  );
}

function Toggle(props: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-surface-200 bg-white p-4">
      <div className="flex-1">
        <div className="text-sm font-semibold text-ink-800">{props.label}</div>
        {props.hint ? (
          <div className="mt-0.5 text-xs text-ink-500">{props.hint}</div>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
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

function renderRedaction(r: LpReportRedaction): string {
  return r.reason;
}

function RedactedSlotPreview({ result }: { result: LpReportSlotAssessment }) {
  const { slot } = result;
  const rows: Array<{ label: string; value: string }> = [
    { label: "Cohort ID", value: slot.cohortId },
    { label: "Sector", value: slot.sector ?? "—" },
    {
      label: "Growth phase",
      value: slot.growthPhase != null ? String(slot.growthPhase) : "—",
    },
    {
      label: "Valuation band",
      value: slot.valuationBand?.label ?? "—",
    },
    {
      label: "Headcount band",
      value: slot.headcountBand?.label ?? "—",
    },
    {
      label: "Growth band",
      value: slot.growthBand ?? "—",
    },
    {
      label: "Monthly revenue series",
      value:
        slot.monthlyRevenueSeriesAud && slot.monthlyRevenueSeriesAud.length > 0
          ? `${slot.monthlyRevenueSeriesAud.length} months exposed`
          : "hidden",
    },
  ];
  return (
    <div
      data-testid="lp-report-composer-slot-preview"
      className="mt-4 rounded-xl border border-surface-200 bg-white p-4"
    >
      <div className="text-sm font-semibold text-ink-800">
        What the reseller will receive
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm text-ink-700 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4">
            <dt className="text-ink-500">{row.label}</dt>
            <dd className="font-medium text-ink-800 text-right">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function LpReportComposerClient() {
  const [state, setState] = React.useState<LpReportComposerFormState>(() =>
    makeEmptyLpReportComposerFormState(),
  );

  const patch = React.useCallback(
    <K extends keyof LpReportComposerFormState>(
      key: K,
      value: LpReportComposerFormState[K],
    ) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const result = React.useMemo(
    () => assessLpReportSlot(toLpReportSlotInput(state)),
    [state],
  );
  const band = pickLpReportBand(result, state);
  const BandStyle = BAND_STYLES[band];

  return (
    <section
      data-testid="lp-report-composer"
      data-band={band}
      data-ok={result.ok ? "true" : "false"}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-ink-800">
          Preview your LP-report contribution slot
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Fill in what your accelerator would receive this quarter — we&apos;ll
          run it through the k-anonymity + APP 6 policy library and show you
          the redactions before you commit to the bundle.
        </p>
      </header>

      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-ink-800">Reseller cohort</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <TextField
              label="Cohort ID (optional)"
              hint="A deterministic tag the reseller assigns you. Leave blank for anon."
              value={state.cohort_id}
              onChange={(v) => patch("cohort_id", v)}
              placeholder="cohort-2026-Q3"
            />
            <NumberField
              label="Cohort size"
              hint="Total founders in the reseller's cohort this quarter. Below k = everything blanked."
              value={state.cohort_size}
              onChange={(v) => patch("cohort_size", v)}
              min={0}
              step={1}
              placeholder="12"
            />
            <NumberField
              label="Peers in your growth band"
              hint="How many other founders share your sector + growth-band slice. Optional."
              value={state.peers_in_same_growth_band}
              onChange={(v) => patch("peers_in_same_growth_band", v)}
              min={0}
              step={1}
              placeholder="6"
            />
          </div>
          <div className="mt-3">
            <Toggle
              label="Reveal the raw monthly revenue curve"
              hint="Off by default. Even at k+ the curve shape can identify you. Only tick if the reseller has justified the exposure."
              checked={state.reveal_shape}
              onChange={(v) => patch("reveal_shape", v)}
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink-800">
            Identity fields (auto-stripped)
          </h3>
          <p className="mt-1 text-xs text-ink-500">
            These are always stripped or coarsened before the reseller sees them.
            Fill them in so you can confirm the policy is doing what it says.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <TextField
              label="Company name"
              value={state.company_name}
              onChange={(v) => patch("company_name", v)}
              placeholder="Contoso Pty Ltd"
            />
            <TextField
              label="Founder names"
              hint="Comma separated."
              value={state.founder_names_csv}
              onChange={(v) => patch("founder_names_csv", v)}
              placeholder="Alice, Bob"
            />
            <TextField
              label="Customer logos"
              hint="Comma separated. Always stripped (APP 6 + s18 ACL)."
              value={state.customer_logos_csv}
              onChange={(v) => patch("customer_logos_csv", v)}
              placeholder="Woolworths, Coles"
            />
            <TextField
              label="Sector"
              hint="Low-risk — always exposed."
              value={state.sector}
              onChange={(v) => patch("sector", v)}
              placeholder="saas"
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink-800">
            Metrics (coarsened before exposure)
          </h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Latest valuation (AUD)"
              hint="Coarsened to a 5-band chip. Exact numbers never surface."
              value={state.latest_valuation_aud}
              onChange={(v) => patch("latest_valuation_aud", v)}
              min={0}
              step={100_000}
              placeholder="12500000"
            />
            <NumberField
              label="ARR / MRR (AUD)"
              hint="Used only if no monthly series is supplied."
              value={state.arr_aud}
              onChange={(v) => patch("arr_aud", v)}
              min={0}
              step={10_000}
              placeholder="2400000"
            />
            <NumberField
              label="Headcount"
              hint="Coarsened to a 5-band chip."
              value={state.headcount}
              onChange={(v) => patch("headcount", v)}
              min={0}
              step={1}
              placeholder="18"
            />
            <NumberField
              label="Growth phase (1–12)"
              hint="Low-risk — always exposed."
              value={state.growth_phase}
              onChange={(v) => patch("growth_phase", v)}
              min={1}
              max={12}
              step={1}
              placeholder="6"
            />
          </div>
          <div className="mt-3">
            <TextArea
              label="Trailing-12mo monthly revenue (AUD)"
              hint="Comma or whitespace separated. Bucketed into a growth-band chip when Reveal is off (default)."
              value={state.monthly_revenue_series_aud_csv}
              onChange={(v) => patch("monthly_revenue_series_aud_csv", v)}
              placeholder="150000, 170000, 200000, 230000, ..."
            />
          </div>
        </section>

        <div
          data-testid="lp-report-composer-result"
          data-band={band}
          className={cn(
            "rounded-2xl border-2 p-6",
            BandStyle.border,
            BandStyle.bg,
          )}
        >
          <div className="flex items-start gap-3">
            <BandStyle.Icon
              strokeWidth={1.75}
              className={cn("mt-0.5 h-7 w-7 shrink-0", BandStyle.text)}
            />
            <div className="flex-1">
              <h3 className={cn("text-lg font-bold", BandStyle.text)}>
                {LP_REPORT_HEADLINE[band]}
              </h3>
              <p className="mt-1 text-xs text-ink-600">
                Assessment: <strong>{result.ok ? "ok to bundle" : "blocked"}</strong> ·
                Redactions: <strong>{result.redactions.length}</strong> ·
                Warnings: <strong>{result.warnings.length}</strong>
              </p>
            </div>
          </div>

          {result.warnings.length > 0 ? (
            <div
              data-testid="lp-report-composer-warnings"
              className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-800"
            >
              <ShieldAlert strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0" />
              <ul className="space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.redactions.length > 0 ? (
            <div
              data-testid="lp-report-composer-redactions"
              className="mt-4"
            >
              <h4 className={cn("text-sm font-semibold", BandStyle.text)}>
                What we&apos;ll strip or coarsen
              </h4>
              <ul className="mt-2 space-y-2 text-sm text-ink-700">
                {result.redactions.map((r, i) => (
                  <li
                    key={i}
                    data-redaction-kind={r.kind}
                    className="flex items-start gap-2"
                  >
                    <AlertTriangle
                      strokeWidth={1.75}
                      className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                    />
                    <span>{renderRedaction(r)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <RedactedSlotPreview result={result} />
        </div>

        <p className="text-xs text-ink-400 leading-relaxed">
          {LP_REPORT_ANONYMISATION_DISCLAIMER}
        </p>
      </div>
    </section>
  );
}
