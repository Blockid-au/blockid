// Pure form helpers for the ATO tax-invoice checker wizard (P5-tax-invoice-checker-ui).
//
// The client wizard runs `assessTaxInvoice` in-browser via `useMemo` on every
// keystroke — no fetch, no persistence, no schema. Keeping the state→input
// mapping + traffic-light band + copy pack out of the React component lets the
// branches be pinned by vitest without a DOM.
//
// Wire shape (TaxInvoiceInput / TaxInvoiceResult / TaxInvoiceMissingField) is
// owned by web/src/lib/compliance/tax-invoice-checker.ts.

import type {
  TaxInvoiceInput,
  TaxInvoiceMissingField,
  TaxInvoiceResult,
} from "@/lib/compliance/tax-invoice-checker";

/** Form state — every number field is a string so <input> can round-trip. */
export interface TaxInvoiceFormState {
  supplier_name: string;
  supplier_abn: string;
  recipient_name: string;
  recipient_abn: string;
  issue_date_iso: string;
  description: string;
  gst_inclusive_total_aud: string;
  gst_amount_aud: string;
  gst_included_statement: boolean;
  document_labelled_tax_invoice: boolean;
  supply_is_gst_free: boolean;
  supply_is_input_taxed: boolean;
}

export function makeEmptyTaxInvoiceFormState(): TaxInvoiceFormState {
  return {
    supplier_name: "",
    supplier_abn: "",
    recipient_name: "",
    recipient_abn: "",
    issue_date_iso: "",
    description: "",
    gst_inclusive_total_aud: "",
    gst_amount_aud: "",
    gst_included_statement: false,
    document_labelled_tax_invoice: false,
    supply_is_gst_free: false,
    supply_is_input_taxed: false,
  };
}

function parseAmount(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 0;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : 0;
}

function optionalString(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalAmount(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/** Convert form state into the pure `assessTaxInvoice` input. */
export function toTaxInvoiceInput(state: TaxInvoiceFormState): TaxInvoiceInput {
  return {
    supplier_name: optionalString(state.supplier_name),
    supplier_abn: optionalString(state.supplier_abn),
    recipient_name: optionalString(state.recipient_name),
    recipient_abn: optionalString(state.recipient_abn),
    issue_date_iso: optionalString(state.issue_date_iso),
    description: optionalString(state.description),
    gst_inclusive_total_aud: parseAmount(state.gst_inclusive_total_aud),
    gst_amount_aud: optionalAmount(state.gst_amount_aud),
    gst_included_statement: state.gst_included_statement,
    document_labelled_tax_invoice: state.document_labelled_tax_invoice,
    supply_is_gst_free: state.supply_is_gst_free,
    supply_is_input_taxed: state.supply_is_input_taxed,
  };
}

export type TaxInvoiceBand = "green" | "amber" | "red" | "grey";

/**
 * Traffic-light band for the result banner.
 *
 *   grey  — nothing typed yet (total <= 0 and no supplier data)
 *   red   — standard/large band with missing mandatory fields
 *   amber — under_threshold OR ok=true but warnings present
 *   green — ok=true with no warnings
 */
export function pickTaxInvoiceBand(
  result: TaxInvoiceResult,
  state: TaxInvoiceFormState,
): TaxInvoiceBand {
  const nothingTyped =
    result.gst_inclusive_total_aud <= 0 &&
    state.supplier_name.trim().length === 0 &&
    state.supplier_abn.trim().length === 0;
  if (nothingTyped) return "grey";
  if (!result.ok) return "red";
  if (result.warnings.length > 0) return "amber";
  return "green";
}

/** Distinct headline per band so the wizard + tests share one source of truth. */
export const TAX_INVOICE_HEADLINE: Record<TaxInvoiceBand, string> = {
  grey: "Enter invoice details to check ATO compliance",
  green: "Valid ATO tax invoice",
  amber: "Tax invoice valid, with warnings",
  red: "Missing ATO-required fields — invoice may be rejected",
};

/** Founder-facing copy for each missing-field code. */
export const MISSING_FIELD_LABEL: Record<TaxInvoiceMissingField, string> = {
  gst_inclusive_total: "GST-inclusive total is missing (must be greater than zero)",
  supplier_name: "Supplier name is missing",
  supplier_abn: "Supplier ABN is missing",
  supplier_abn_invalid: "Supplier ABN fails the modulus-89 checksum",
  issue_date: "Issue date is missing or malformed",
  description: "Line-item description is missing",
  gst_amount_or_statement:
    "GST amount OR the 'Total price includes GST' statement is missing",
  document_label: "Document is not labelled 'Tax invoice'",
  recipient_abn_or_name:
    "Recipient identity (name or ABN) is required on A$1,000+ invoices",
};

export const BAND_TO_LABEL: Record<TaxInvoiceResult["band"], string> = {
  under_threshold: "Under A$82.50 — no full tax invoice required",
  standard: "Standard invoice (A$82.50 – A$999.99)",
  large: "Large invoice (A$1,000+)",
};
