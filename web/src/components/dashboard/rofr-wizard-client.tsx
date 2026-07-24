"use client";

// P10-rofr-workflow-ui — client wizard rendered on /compliance/s708. Runs the
// pure assessRofrWorkflow helper in-browser (no fetch, no API, no I/O) so a
// founder can paste a cap table + proposed transfer and see the ROFR status +
// pro-rata entitlement per holder + tag-along + s707 on-sale flags flip live.

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Info,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { assessRofrWorkflow } from "@/lib/compliance/rofr-workflow";
import {
  ROFR_STATUS_HEADLINE,
  makeEmptyRofrWizardFormState,
  pickRofrBand,
  toRofrInput,
  type RofrBand,
  type RofrWizardFormState,
} from "./rofr-wizard.helpers";

const BAND_STYLES: Record<
  RofrBand,
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
    text: "text-ink-800",
    Icon: ClipboardList,
  },
};

function InputField(props: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-ink-800">{props.label}</div>
      {props.hint ? (
        <div className="mt-0.5 text-xs text-ink-500">{props.hint}</div>
      ) : null}
      <input
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-2 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </label>
  );
}

function TextAreaField(props: {
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
        rows={props.rows ?? 4}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-2 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 font-mono text-xs text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
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

const SAMPLE_STATE: RofrWizardFormState = {
  cap_table_csv: [
    "founder-a, Alice Cannon, 6000, yes",
    "founder-b, Bob Farquhar, 3000, yes",
    "angel-c, Carol Angel, 1000, no",
  ].join("\n"),
  waivers_csv: "angel-c, 2026-06-01",
  exercises_csv: "founder-b, 2026-06-05, 200",
  seller_id: "founder-a",
  buyer_name: "Series-A Investor Pty Ltd",
  share_count: "1000",
  price_per_share_aud: "3.50",
  notice_date_iso: "2026-06-01",
  original_issue_date_iso: "2023-01-15",
  notice_period_days: "",
  is_related_body_corporate_transfer: false,
};

export function RofrWizardClient() {
  const [state, setState] = React.useState<RofrWizardFormState>(() =>
    makeEmptyRofrWizardFormState(),
  );

  const patch = React.useCallback(
    <K extends keyof RofrWizardFormState>(
      key: K,
      value: RofrWizardFormState[K],
    ) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Live-recompute on every keystroke — the pure helper is O(n) over the cap
  // table so there is no reason to hide the signal behind a Submit button.
  const result = React.useMemo(
    () => assessRofrWorkflow(toRofrInput(state)),
    [state],
  );
  const band = pickRofrBand(result.status);
  const BandStyle = BAND_STYLES[band];

  return (
    <section
      data-testid="rofr-wizard"
      data-status={result.status}
      data-band={band}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-ink-800">
          Run a secondary transfer through the ROFR checker
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Paste your current cap table, the proposed transfer, and any waivers
          or exercises already collected — we&apos;ll compute pro-rata
          entitlement per holder, the notice-window deadline, and the s707
          on-sale + tag-along flags live. Anchored on{" "}
          <em>Corporations Act 2001 (Cth)</em> s707 + Blackbird / AirTree /
          Square Peg standard shareholders&apos;-agreement templates.
        </p>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setState(SAMPLE_STATE)}
            className="rounded-md border border-surface-300 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-100"
          >
            Load sample data
          </button>
          <button
            type="button"
            onClick={() => setState(makeEmptyRofrWizardFormState())}
            className="ml-2 rounded-md border border-surface-300 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-100"
          >
            Clear
          </button>
        </div>
      </header>

      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-ink-800">
            Cap table &amp; existing responses
          </h3>
          <div className="mt-3 grid gap-4">
            <TextAreaField
              label="Cap table (CSV)"
              hint="One holder per line: holder_id, name, held_shares, is_founder (y/n). Tab-separated pastes from Google Sheets / Excel are ok."
              value={state.cap_table_csv}
              onChange={(v) => patch("cap_table_csv", v)}
              placeholder="founder-a, Alice, 6000, yes"
              rows={5}
            />
            <TextAreaField
              label="Waivers already signed (CSV)"
              hint="holder_id, waived_at_iso — blank date defaults to today."
              value={state.waivers_csv}
              onChange={(v) => patch("waivers_csv", v)}
              placeholder="angel-c, 2026-06-01"
              rows={2}
            />
            <TextAreaField
              label="Exercises already received (CSV)"
              hint="holder_id, exercised_at_iso, shares_taken — pro-rata cap applies."
              value={state.exercises_csv}
              onChange={(v) => patch("exercises_csv", v)}
              placeholder="founder-b, 2026-06-05, 200"
              rows={2}
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink-800">
            Proposed transfer
          </h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <InputField
              label="Seller (holder_id)"
              hint="Must match a holder_id in the cap table."
              value={state.seller_id}
              onChange={(v) => patch("seller_id", v)}
              placeholder="founder-a"
            />
            <InputField
              label="Buyer name"
              value={state.buyer_name}
              onChange={(v) => patch("buyer_name", v)}
              placeholder="Series-A Investor Pty Ltd"
            />
            <InputField
              label="Shares to transfer"
              hint="Whole shares."
              value={state.share_count}
              onChange={(v) => patch("share_count", v)}
              type="number"
              placeholder="1000"
            />
            <InputField
              label="Price per share (AUD)"
              hint="Consideration disclosed on the transfer form."
              value={state.price_per_share_aud}
              onChange={(v) => patch("price_per_share_aud", v)}
              type="number"
              placeholder="3.50"
            />
            <InputField
              label="Notice served (ISO date)"
              hint="Date you served (or will serve) the pre-emption notice."
              value={state.notice_date_iso}
              onChange={(v) => patch("notice_date_iso", v)}
              type="date"
            />
            <InputField
              label="Original issue date (ISO)"
              hint="Optional — used for the s707(3) on-sale flag when the shares were issued < 12 months ago."
              value={state.original_issue_date_iso}
              onChange={(v) => patch("original_issue_date_iso", v)}
              type="date"
            />
            <InputField
              label="Notice period (days)"
              hint="Optional — defaults to 15 business days per standard SHAs."
              value={state.notice_period_days}
              onChange={(v) => patch("notice_period_days", v)}
              type="number"
              placeholder="15"
            />
          </div>
          <div className="mt-3">
            <Toggle
              label="Related-body-corporate / spouse / bare-trustee transfer"
              hint="If yes, pre-emption is typically waived under standard SHAs."
              checked={state.is_related_body_corporate_transfer}
              onChange={(v) =>
                patch("is_related_body_corporate_transfer", v)
              }
            />
          </div>
        </section>

        <div
          data-testid="rofr-wizard-result"
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
                {ROFR_STATUS_HEADLINE[result.status]}
              </h3>
              <p className="mt-1 text-xs text-ink-600">
                Notice deadline:{" "}
                <strong>{result.notice_deadline_iso || "—"}</strong> · Shares
                taken by ROFR:{" "}
                <strong>{result.shares_taken_by_rofr}</strong> · Left for buyer:{" "}
                <strong>{result.shares_remaining_for_third_party}</strong>
              </p>
              <p className="mt-2 text-sm text-ink-700">{result.next_action}</p>
            </div>
          </div>

          {(result.tag_along_triggered || result.s707_on_sale_risk) && (
            <div
              data-testid="rofr-wizard-flags"
              data-tag-along={result.tag_along_triggered}
              data-s707-risk={result.s707_on_sale_risk}
              className="mt-4 flex flex-wrap gap-2 text-xs"
            >
              {result.tag_along_triggered ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                  <ShieldAlert strokeWidth={1.75} className="h-3.5 w-3.5" />
                  Tag-along triggered
                </span>
              ) : null}
              {result.s707_on_sale_risk ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-medium text-red-800">
                  <ShieldAlert strokeWidth={1.75} className="h-3.5 w-3.5" />
                  s707 on-sale risk
                </span>
              ) : null}
            </div>
          )}

          {result.eligible_holders.length > 0 ? (
            <div className="mt-4">
              <h4 className={cn("text-sm font-semibold", BandStyle.text)}>
                Pro-rata entitlement per holder
              </h4>
              <div className="mt-2 overflow-hidden rounded-xl border border-surface-200">
                <table
                  data-testid="rofr-wizard-entitlement-table"
                  className="w-full text-sm"
                >
                  <thead className="bg-surface-50 text-xs uppercase text-ink-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Holder
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Entitled
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Exercised
                      </th>
                      <th className="px-3 py-2 text-center font-medium">
                        Waived?
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-200">
                    {result.eligible_holders.map((h) => (
                      <tr key={h.holder_id} className="text-ink-700">
                        <td className="px-3 py-2">
                          {h.name ?? h.holder_id}
                          {h.name ? (
                            <span className="ml-2 text-xs text-ink-400">
                              {h.holder_id}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {h.entitled_shares}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {h.exercised_shares}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {h.waived ? "yes" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

          {result.outstanding_holder_ids.length > 0 ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-surface-200 bg-white p-3 text-xs text-ink-600">
              <Info
                strokeWidth={1.75}
                className="mt-0.5 h-4 w-4 shrink-0 text-brand-600"
              />
              <div>
                Outstanding holders:{" "}
                <strong>{result.outstanding_holder_ids.join(", ")}</strong>
              </div>
            </div>
          ) : null}
        </div>

        <p className="text-xs text-ink-400 leading-relaxed">
          {result.disclaimer}
        </p>
      </div>
    </section>
  );
}
