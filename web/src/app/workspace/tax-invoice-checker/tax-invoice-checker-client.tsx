"use client";

// P5-tax-invoice-checker-ui — client wizard rendered at
// /workspace/tax-invoice-checker. Runs the pure `assessTaxInvoice` helper
// in-browser via useMemo so a founder can paste invoice fields and see the
// ATO tax-invoice classification + missing fields + GST cross-check +
// recommendations flip live. P5-tax-invoice-checker-save adds an on-demand
// "Save assessment" button that POSTs to /api/compliance/tax-invoice-check so
// the founder can persist the current snapshot for a compliance audit trail.

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Save,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { assessTaxInvoice } from "@/lib/compliance/tax-invoice-checker";
import {
  BAND_TO_LABEL,
  MISSING_FIELD_LABEL,
  SAVE_BUTTON_LABEL,
  SAVE_STATUS_MESSAGE,
  TAX_INVOICE_HEADLINE,
  canSaveTaxInvoiceCheck,
  makeEmptyTaxInvoiceFormState,
  pickTaxInvoiceBand,
  toTaxInvoiceInput,
  type TaxInvoiceBand,
  type TaxInvoiceFormState,
  type TaxInvoiceSaveStatus,
} from "./tax-invoice-checker.helpers";

const BAND_STYLES: Record<
  TaxInvoiceBand,
  {
    border: string;
    bg: string;
    text: string;
    Icon: typeof CheckCircle2;
  }
> = {
  grey: {
    border: "border-surface-300",
    bg: "bg-surface-50",
    text: "text-ink-700",
    Icon: Info,
  },
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

function TextField(props: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "number" | "date";
  step?: string;
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
        type={props.type ?? "text"}
        step={props.step}
        placeholder={props.placeholder}
        value={props.value}
        data-testid={props.testId}
        onChange={(e) => props.onChange(e.target.value)}
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
        data-testid={props.testId}
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

const SAMPLE_STATE: TaxInvoiceFormState = {
  supplier_name: "Auschain PTY LTD",
  supplier_abn: "79 659 615 111",
  recipient_name: "",
  recipient_abn: "",
  issue_date_iso: "2026-07-24",
  description: "BlockID.au subscription — 12 months",
  gst_inclusive_total_aud: "330",
  gst_amount_aud: "30",
  gst_included_statement: false,
  document_labelled_tax_invoice: true,
  supply_is_gst_free: false,
  supply_is_input_taxed: false,
};

export function TaxInvoiceCheckerClient() {
  const [state, setState] = React.useState<TaxInvoiceFormState>(() =>
    makeEmptyTaxInvoiceFormState(),
  );

  const patch = React.useCallback(
    <K extends keyof TaxInvoiceFormState>(
      key: K,
      value: TaxInvoiceFormState[K],
    ) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const result = React.useMemo(
    () => assessTaxInvoice(toTaxInvoiceInput(state)),
    [state],
  );
  const band = pickTaxInvoiceBand(result, state);
  const BandStyle = BAND_STYLES[band];

  const isLargeBand = result.band === "large";

  const [saveStatus, setSaveStatus] =
    React.useState<TaxInvoiceSaveStatus>("idle");
  const savePossible = canSaveTaxInvoiceCheck(state);

  // Reset a saved / error indicator whenever the form changes so the founder
  // knows the button will save the *current* state, not the last-saved one.
  React.useEffect(() => {
    setSaveStatus((prev) => (prev === "saving" ? prev : "idle"));
  }, [state]);

  const handleSave = React.useCallback(async () => {
    if (!savePossible) return;
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/compliance/tax-invoice-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toTaxInvoiceInput(state)),
      });
      if (!res.ok) {
        setSaveStatus("error");
        return;
      }
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [savePossible, state]);

  return (
    <section
      data-testid="tax-invoice-checker"
      data-band={band}
      data-invoice-band={result.band}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <header className="mb-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-brand-600 font-medium">
          <ShieldCheck strokeWidth={1.75} className="h-4 w-4" />
          GST Act s 29-70(1) · tax-invoice format
        </div>
        <h2 className="mt-2 text-lg font-semibold text-ink-800">
          Check a supplier tax invoice
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Paste the fields from a supplier invoice — we&apos;ll validate against
          the ATO tax-invoice rules and flag any missing fields that would
          block your GST input-tax credit.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setState(SAMPLE_STATE)}
          className="h-9 rounded-lg border border-surface-300 bg-white px-3 text-xs font-semibold text-ink-700 hover:bg-surface-50"
        >
          Load sample invoice
        </button>
        <button
          type="button"
          onClick={() => setState(makeEmptyTaxInvoiceFormState())}
          className="h-9 rounded-lg border border-surface-300 bg-white px-3 text-xs font-semibold text-ink-700 hover:bg-surface-50"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!savePossible || saveStatus === "saving"}
          data-testid="tax-invoice-save"
          data-save-status={saveStatus}
          className={cn(
            "h-9 rounded-lg border px-3 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors",
            saveStatus === "saved"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : saveStatus === "error"
                ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                : "border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <Save strokeWidth={1.75} className="h-3.5 w-3.5" />
          {SAVE_BUTTON_LABEL[saveStatus]}
        </button>
        {saveStatus !== "idle" ? (
          <span
            data-testid="tax-invoice-save-message"
            data-save-status={saveStatus}
            className={cn(
              "text-xs",
              saveStatus === "saved" && "text-emerald-700",
              saveStatus === "error" && "text-red-700",
              saveStatus === "saving" && "text-ink-500",
            )}
          >
            {SAVE_STATUS_MESSAGE[saveStatus]}
          </span>
        ) : null}
      </div>

      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-ink-800">Supplier</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <TextField
              label="Supplier name"
              hint="Legal entity name as it appears on the invoice."
              value={state.supplier_name}
              onChange={(v) => patch("supplier_name", v)}
              placeholder="Auschain PTY LTD"
              testId="tax-invoice-supplier-name"
            />
            <TextField
              label="Supplier ABN"
              hint="11 digits — we run the ATO modulus-89 checksum."
              value={state.supplier_abn}
              onChange={(v) => patch("supplier_abn", v)}
              placeholder="79 659 615 111"
              testId="tax-invoice-supplier-abn"
            />
            <TextField
              label="Issue date"
              hint="ISO date (YYYY-MM-DD)."
              value={state.issue_date_iso}
              onChange={(v) => patch("issue_date_iso", v)}
              type="date"
              testId="tax-invoice-issue-date"
            />
            <TextField
              label="Line-item description"
              hint="A brief description of what was supplied."
              value={state.description}
              onChange={(v) => patch("description", v)}
              placeholder="BlockID subscription — 12 months"
              testId="tax-invoice-description"
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink-800">Amounts</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <TextField
              label="GST-inclusive total (AUD)"
              hint="Total charged to you including GST."
              value={state.gst_inclusive_total_aud}
              onChange={(v) => patch("gst_inclusive_total_aud", v)}
              type="number"
              step="0.01"
              placeholder="330"
              testId="tax-invoice-total"
            />
            <TextField
              label="GST amount shown (AUD)"
              hint="Optional if the invoice carries the 'Total price includes GST' statement. Cross-checked against total ÷ 11."
              value={state.gst_amount_aud}
              onChange={(v) => patch("gst_amount_aud", v)}
              type="number"
              step="0.01"
              placeholder="30"
              testId="tax-invoice-gst-amount"
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Toggle
              label="Invoice carries 'Total price includes GST' statement"
              hint="Sufficient in place of a discrete GST amount on the standard band."
              checked={state.gst_included_statement}
              onChange={(v) => patch("gst_included_statement", v)}
              testId="tax-invoice-gst-statement"
            />
            <Toggle
              label="Document is prominently labelled 'Tax invoice'"
              hint="Required for the standard + large bands per s 29-70(1)(c)(i)."
              checked={state.document_labelled_tax_invoice}
              onChange={(v) => patch("document_labelled_tax_invoice", v)}
              testId="tax-invoice-labelled"
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink-800">
            Recipient (required on invoices A$1,000+)
          </h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <TextField
              label="Recipient name"
              hint="Your entity name."
              value={state.recipient_name}
              onChange={(v) => patch("recipient_name", v)}
              placeholder="Your startup Pty Ltd"
              testId="tax-invoice-recipient-name"
            />
            <TextField
              label="Recipient ABN"
              hint="Optional if recipient name supplied. Checksum-verified."
              value={state.recipient_abn}
              onChange={(v) => patch("recipient_abn", v)}
              placeholder="51 824 753 556"
              testId="tax-invoice-recipient-abn"
            />
          </div>
          {!isLargeBand ? (
            <p className="mt-2 text-xs text-ink-500">
              Only checked for invoices A$1,000+ — under that threshold the
              ATO allows the supplier to omit recipient identity.
            </p>
          ) : null}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink-800">
            Supply classification
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Toggle
              label="Every line item is GST-free"
              hint="Fresh food, exports, medical services, etc. GST amount should be zero."
              checked={state.supply_is_gst_free}
              onChange={(v) => patch("supply_is_gst_free", v)}
              testId="tax-invoice-gst-free"
            />
            <Toggle
              label="Supply is input-taxed"
              hint="Residential rent or financial supplies — recipient cannot claim a GST credit."
              checked={state.supply_is_input_taxed}
              onChange={(v) => patch("supply_is_input_taxed", v)}
              testId="tax-invoice-input-taxed"
            />
          </div>
        </section>

        <div
          data-testid="tax-invoice-result"
          data-band={band}
          data-ok={result.ok ? "true" : "false"}
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
                {TAX_INVOICE_HEADLINE[band]}
              </h3>
              <p className="mt-1 text-xs text-ink-600">
                Band: <strong>{BAND_TO_LABEL[result.band]}</strong>
                {result.gst_inclusive_total_aud > 0 ? (
                  <>
                    {" "}· Total:{" "}
                    <strong>
                      A${result.gst_inclusive_total_aud.toFixed(2)}
                    </strong>
                  </>
                ) : null}
                {result.computed_gst_component_aud > 0 ? (
                  <>
                    {" "}· Expected GST (÷11):{" "}
                    <strong>
                      A${result.computed_gst_component_aud.toFixed(2)}
                    </strong>
                  </>
                ) : null}
              </p>
            </div>
          </div>

          {result.missing_fields.length > 0 ? (
            <div
              data-testid="tax-invoice-missing"
              className="mt-4"
            >
              <h4 className={cn("text-sm font-semibold", BandStyle.text)}>
                Missing ATO-required fields
              </h4>
              <ul className="mt-2 space-y-2 text-sm text-ink-700">
                {result.missing_fields.map((code) => (
                  <li
                    key={code}
                    data-missing-code={code}
                    className="flex items-start gap-2"
                  >
                    <XCircle
                      strokeWidth={1.75}
                      className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
                    />
                    <span>{MISSING_FIELD_LABEL[code]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.warnings.length > 0 ? (
            <div
              data-testid="tax-invoice-warnings"
              className="mt-4"
            >
              <h4 className={cn("text-sm font-semibold", BandStyle.text)}>
                Warnings
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

          {result.recommendations.length > 0 ? (
            <div className="mt-4">
              <h4 className={cn("text-sm font-semibold", BandStyle.text)}>
                Recommendations
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
          ) : null}
        </div>

        <p className="text-xs text-ink-400 leading-relaxed">
          {result.disclaimer}
        </p>
      </div>
    </section>
  );
}
