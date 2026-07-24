"use client";

// P11-acquisition-wizard-ui — client wizard rendered beneath the
// ExitReadinessTile on /dashboard/exit-readiness. Runs the pure
// assessAcquisitionPattern helper in-browser (no fetch, no API, no I/O) so a
// founder can nudge fields on the ~90/10 Atlassian template and see the
// signal + warnings + FIRB gate flip live.

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
  assessAcquisitionPattern,
  type AcquisitionPatternCheck,
} from "@/lib/exits/acquisition-pattern-check";
import {
  ACQUISITION_HEADLINE,
  makeEmptyAcquisitionWizardFormState,
  pickAcquisitionBand,
  toAcquisitionInput,
  type AcquisitionBand,
  type AcquisitionWizardFormState,
} from "./acquisition-wizard.helpers";

const BAND_STYLES: Record<
  AcquisitionBand,
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
};

const FIRB_REASON_LABEL: Record<
  NonNullable<AcquisitionPatternCheck["firb_reason"]>,
  string
> = {
  threshold_exceeded: "headline value at or above the A$339M 2026 threshold",
  sensitive_sector: "target sits in a sensitive-tech / critical-infrastructure sector",
  foreign_govt_influence: "buyer is foreign-government-influenced",
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

function TextArea(props: {
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
      <textarea
        rows={2}
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

export function AcquisitionWizardClient() {
  const [state, setState] = React.useState<AcquisitionWizardFormState>(() =>
    makeEmptyAcquisitionWizardFormState(),
  );

  const patch = React.useCallback(
    <K extends keyof AcquisitionWizardFormState>(
      key: K,
      value: AcquisitionWizardFormState[K],
    ) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Live-recompute on every keystroke — the pure helper is O(1) so there's
  // no reason to hide the signal behind a Submit button.
  const result = React.useMemo(
    () => assessAcquisitionPattern(toAcquisitionInput(state)),
    [state],
  );
  const band = pickAcquisitionBand(result.overall_signal);
  const BandStyle = BAND_STYLES[band];

  return (
    <section
      data-testid="acquisition-wizard"
      data-signal={result.overall_signal}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-ink-800">
          Run your deal through the 90/10 checklist
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Enter a headline value and consideration split — we&apos;ll compare it
          to the Atlassian template (Trello 2017, OpsGenie 2018, Loom 2023) and
          flag change-of-control, FIRB, and RSU-structure gaps live.
        </p>
      </header>

      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-ink-800">Headline &amp; splits</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Headline value (AUD)"
              hint="Enterprise value in AUD. Convert USD at the announcement-date rate."
              value={state.headline_value_aud}
              onChange={(v) => patch("headline_value_aud", v)}
              min={0}
              step={1_000_000}
              placeholder="425000000"
            />
            <NumberField
              label="Change-of-control consents (%)"
              hint="Share of material contracts with counterparty consent already secured. Target ≥ 95% before completion."
              value={state.change_of_control_consents_pct}
              onChange={(v) => patch("change_of_control_consents_pct", v)}
              min={0}
              max={100}
              step={1}
              placeholder="95"
            />
            <NumberField
              label="Cash share (%)"
              hint="Cash paid at completion. Atlassian template runs 85-95%."
              value={state.cash_pct}
              onChange={(v) => patch("cash_pct", v)}
              min={0}
              max={100}
              step={1}
            />
            <NumberField
              label="RSU (retention) share (%)"
              hint="Restricted stock granted to target leadership. Atlassian template runs 5-15%."
              value={state.rsu_pct}
              onChange={(v) => patch("rsu_pct", v)}
              min={0}
              max={100}
              step={1}
            />
            <NumberField
              label="Earnout share (%)"
              hint="Optional. Contingent consideration tied to post-completion milestones."
              value={state.earnout_pct}
              onChange={(v) => patch("earnout_pct", v)}
              min={0}
              max={100}
              step={1}
              placeholder="0"
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink-800">RSU &amp; escrow structure</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="RSU cliff (months)"
              hint="Atlassian template = 12."
              value={state.rsu_cliff_months}
              onChange={(v) => patch("rsu_cliff_months", v)}
              min={0}
              max={48}
              step={1}
            />
            <NumberField
              label="RSU vest length (months)"
              hint="Atlassian template = 24-36 monthly."
              value={state.rsu_vest_months}
              onChange={(v) => patch("rsu_vest_months", v)}
              min={0}
              max={60}
              step={1}
            />
            <NumberField
              label="Escrow share (%)"
              hint="Cash held escrow against indemnity claims. Pattern = 10-15%."
              value={state.escrow_pct}
              onChange={(v) => patch("escrow_pct", v)}
              min={0}
              max={100}
              step={1}
            />
            <NumberField
              label="Escrow hold (months)"
              hint="Pattern = 12-18 months."
              value={state.escrow_months}
              onChange={(v) => patch("escrow_months", v)}
              min={0}
              max={48}
              step={1}
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink-800">Buyer &amp; FIRB context</h3>
          <div className="mt-3 space-y-3">
            <TextArea
              label="Target industry keywords"
              hint="Comma or newline separated. We match against FIRB sensitive-tech / critical-infrastructure keywords (cyber, defence, quantum, biotech, critical minerals, etc.)."
              value={state.target_industry_keywords}
              onChange={(v) => patch("target_industry_keywords", v)}
              placeholder="saas, developer tools"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle
                label="Buyer is listed on a public exchange"
                hint="If yes, the RSU tranche may qualify for Subdiv 83A-C deferred ESS taxation for AU-resident recipients."
                checked={state.buyer_is_listed}
                onChange={(v) => patch("buyer_is_listed", v)}
              />
              <Toggle
                label="Buyer is foreign-government-influenced"
                hint="Sovereign wealth fund, state-owned enterprise, or 20%+ foreign-government-held. Triggers FIRB regardless of deal size."
                checked={state.buyer_is_foreign_govt_influenced}
                onChange={(v) => patch("buyer_is_foreign_govt_influenced", v)}
              />
            </div>
          </div>
        </section>

        <div
          data-testid="acquisition-wizard-result"
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
                {ACQUISITION_HEADLINE[result.overall_signal]}
              </h3>
              <p className="mt-1 text-xs text-ink-600">
                Splits align:{" "}
                <strong>{result.splits_align ? "yes" : "no"}</strong> · RSU
                structure:{" "}
                <strong>{result.rsu_structure_ok ? "ok" : "off"}</strong> ·
                Escrow structure:{" "}
                <strong>{result.escrow_structure_ok ? "ok" : "off"}</strong> ·
                Template match:{" "}
                <strong>
                  {result.matches_atlassian_pattern ? "yes" : "no"}
                </strong>
              </p>
            </div>
          </div>

          {result.firb_pre_lodgment_required && result.firb_reason ? (
            <div
              data-testid="acquisition-wizard-firb"
              data-firb-reason={result.firb_reason}
              className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-800"
            >
              <ShieldAlert strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong>FIRB pre-lodgment required</strong> —{" "}
                {FIRB_REASON_LABEL[result.firb_reason]}. Build runway into
                completion; FIRB is procedural, not a deal-killer, but skipping
                the runway breaks the close date.
              </div>
            </div>
          ) : null}

          {result.warnings.length > 0 ? (
            <div className="mt-4">
              <h4 className={cn("text-sm font-semibold", BandStyle.text)}>
                What needs attention
              </h4>
              <ul className="mt-2 space-y-2 text-sm text-ink-700">
                {result.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertTriangle
                      strokeWidth={1.75}
                      className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                    />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4">
            <h4 className={cn("text-sm font-semibold", BandStyle.text)}>
              Always-on recommendations
            </h4>
            <ul className="mt-2 space-y-2 text-sm text-ink-700">
              {result.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Info
                    strokeWidth={1.75}
                    className="mt-0.5 h-4 w-4 shrink-0 text-brand-600"
                  />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-xs text-ink-400 leading-relaxed">{result.disclaimer}</p>
      </div>
    </section>
  );
}
