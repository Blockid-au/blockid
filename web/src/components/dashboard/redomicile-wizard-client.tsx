"use client";

// P12d-redomicile-wizard — client wizard rendered beneath the
// AcquisitionWizardClient on /dashboard/exit-readiness. Runs the pure
// assessRedomicile helper in-browser (no fetch, no API, no I/O) so a founder
// can flip triggers and see the recommendation + warnings + statutory
// mechanism update live.
//
// Honest posture: the default (all fields empty) reads "grey" — inviting
// input rather than pre-selling a redomicile decision. Even "proceed" comes
// out amber, not green, because the honest founder-facing answer is "engage
// a specialist lawyer first."

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { assessRedomicile } from "@/lib/exits/redomicile-decision-check";
import {
  makeEmptyRedomicileWizardFormState,
  pickRedomicileBand,
  REDOMICILE_HEADLINE,
  REDOMICILE_MECHANISM_LABEL,
  toRedomicileInput,
  type RedomicileBand,
  type RedomicileWizardFormState,
} from "./redomicile-wizard.helpers";

const BAND_STYLES: Record<
  RedomicileBand,
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
    text: "text-ink-600",
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
  testId?: string;
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
        data-testid={props.testId}
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
  testId?: string;
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
        data-testid={props.testId}
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

export function RedomicileWizardClient() {
  const [state, setState] = React.useState<RedomicileWizardFormState>(() =>
    makeEmptyRedomicileWizardFormState(),
  );

  const patch = React.useCallback(
    <K extends keyof RedomicileWizardFormState>(
      key: K,
      value: RedomicileWizardFormState[K],
    ) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const result = React.useMemo(
    () => assessRedomicile(toRedomicileInput(state)),
    [state],
  );
  const band = pickRedomicileBand(result.recommendation, state);
  const BandStyle = BAND_STYLES[band];

  return (
    <section
      data-testid="redomicile-wizard"
      data-band={band}
      data-recommendation={result.recommendation}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-ink-800">
          Run your redomicile through the decision tree
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Chapter 12 Scheme-of-Arrangement walkthrough. Most AU startups never
          need to redomicile — the wizard defaults to &quot;hold&quot; so you
          can rule it out cleanly rather than sell an offshoring project to
          yourself.
        </p>
      </header>

      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-ink-800">Triggers</h3>
          <div className="mt-3 grid gap-3">
            <Toggle
              label="A Delaware / US-listed acquirer has approached you"
              hint="Section 368(a) reorganisation treatment usually requires the target to be a US-tax entity — a scheme flip is often the acquirer's ask."
              checked={state.has_delaware_acquirer_signal}
              onChange={(v) => patch("has_delaware_acquirer_signal", v)}
              testId="redomicile-toggle-delaware-acquirer"
            />
            <Toggle
              label="You are planning a US listing (NASDAQ / NYSE)"
              hint="Australian dual-class structures are blocked by ASX Listing Rule 6.9. A Delaware C-corp or UK Plc intermediary is the standard workaround."
              checked={state.plans_us_listing}
              onChange={(v) => patch("plans_us_listing", v)}
              testId="redomicile-toggle-plans-us-listing"
            />
            <Toggle
              label="You need dual-class founder control (10:1 voting)"
              hint="Only counts as a trigger when combined with a US listing plan — otherwise there is nothing to redomicile for."
              checked={state.wants_dual_class_founder_control}
              onChange={(v) => patch("wants_dual_class_founder_control", v)}
              testId="redomicile-toggle-dual-class"
            />
            <Toggle
              label="You have received a scrip-only offer (no cash)"
              hint="Signals Subdiv 124-M scrip-for-scrip rollover may apply — a huge tax benefit if the transaction is structured correctly."
              checked={state.has_scrip_only_offer}
              onChange={(v) => patch("has_scrip_only_offer", v)}
              testId="redomicile-toggle-scrip-only"
            />
            <Toggle
              label="Your core IP already sits in a Delaware entity"
              hint="If the operating AU op-co is essentially a service company invoicing its own Delaware IP-holder, the redomicile is largely accounting cleanup."
              checked={state.ip_already_in_delaware}
              onChange={(v) => patch("ip_already_in_delaware", v)}
              testId="redomicile-toggle-ip-in-delaware"
            />
            <Toggle
              label="You are pre-Series-A"
              hint="Overrides every other trigger — redomicile absorbs 4-9 months of legal + tax attention that a pre-PMF team cannot spare."
              checked={state.is_pre_series_a}
              onChange={(v) => patch("is_pre_series_a", v)}
              testId="redomicile-toggle-pre-series-a"
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink-800">Cap table &amp; runway</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="US-resident cap table (%)"
              hint="Voting-rights share held by US-tax residents. PFIC (IRC §1297) exposure risk starts around 50%."
              value={state.us_resident_cap_table_pct}
              onChange={(v) => patch("us_resident_cap_table_pct", v)}
              min={0}
              max={100}
              step={1}
              placeholder="30"
              testId="redomicile-input-us-cap-pct"
            />
            <NumberField
              label="Annual burn (AUD)"
              hint="Rule of thumb: redomicile absorbs ~A$300k-A$800k over 4-9 months. Below ~A$100k/yr burn we recommend reconsidering."
              value={state.annual_burn_aud}
              onChange={(v) => patch("annual_burn_aud", v)}
              min={0}
              step={10_000}
              placeholder="500000"
              testId="redomicile-input-annual-burn"
            />
          </div>
        </section>

        <section
          data-testid="redomicile-result"
          className={cn(
            "rounded-xl border p-4",
            BandStyle.border,
            BandStyle.bg,
          )}
        >
          <div className="flex items-start gap-3">
            <BandStyle.Icon className={cn("h-5 w-5 shrink-0", BandStyle.text)} />
            <div className="flex-1">
              <div className={cn("text-base font-semibold", BandStyle.text)}>
                {REDOMICILE_HEADLINE[result.recommendation]}
              </div>
              <div className="mt-1 text-sm text-ink-600">
                Triggers detected:{" "}
                <span
                  data-testid="redomicile-trigger-count"
                  className="font-semibold text-ink-800"
                >
                  {result.triggers.length}
                </span>
                {result.mechanism ? (
                  <>
                    {" · "}Mechanism:{" "}
                    <span
                      data-testid="redomicile-mechanism"
                      className="font-semibold text-ink-800"
                    >
                      {REDOMICILE_MECHANISM_LABEL[result.mechanism]}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {result.warnings.length > 0 ? (
            <ul
              data-testid="redomicile-warnings"
              className="mt-4 space-y-2 border-t border-surface-200 pt-4"
            >
              {result.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <ul
            data-testid="redomicile-next-steps"
            className="mt-4 space-y-2 border-t border-surface-200 pt-4"
          >
            {result.next_steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-xs text-ink-500">{result.disclaimer}</p>
      </div>
    </section>
  );
}
