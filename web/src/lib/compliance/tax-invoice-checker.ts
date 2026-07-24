// ATO tax-invoice format checker.
//
// Validates whether a supplier's invoice carries the fields the ATO
// requires for the recipient to claim a GST input-tax credit under:
//   A New Tax System (Goods and Services Tax) Act 1999 (Cth) s 29-70(1)
//   ATO GSTR 2013/1 (waivers + recipient-created tax invoices)
//   https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices
//
// The three ATO thresholds encoded here:
//   1. Under A$82.50 GST-inclusive — no tax invoice required; a receipt
//      with the supplier's ABN is best practice but not mandatory.
//   2. A$82.50 to A$1,000 GST-inclusive (`standard`) — supplier identity
//      + ABN, issue date, description, GST amount OR "Total price includes
//      GST" statement, document labelled "Tax invoice".
//   3. A$1,000 and above GST-inclusive (`large`) — everything in the
//      standard band PLUS recipient identity (name) OR recipient ABN.
//
// Closes docs/plans/atlassian-standard-mapping-goal.md §1 phase 5 P1 gap
// "ATO tax-invoice format checker absent". Ships as a pure lib mirroring
// the abn.ts / gst-threshold.ts / rofr-workflow.ts pattern so downstream
// UI + cron surfaces can consume it without a schema coupling.

import { validateAbnChecksum } from "./abn";

export const TAX_INVOICE_DISCLAIMER =
  "Not tax advice — this checker validates against the ATO valid-tax-invoice rules under A New Tax System (Goods and Services Tax) Act 1999 (Cth) s 29-70(1). Recipient-created tax invoices (s 29-70(3)), input-taxed supplies, GST-free items, and second-hand goods follow different rules. Confirm with a registered tax agent before relying on an invoice for a GST input-tax credit.";

export const TAX_INVOICE_MIN_THRESHOLD_AUD = 82.5 as const;
export const TAX_INVOICE_LARGE_INVOICE_AUD = 1_000 as const;
export const TAX_INVOICE_GST_TOLERANCE_AUD = 0.02 as const;

export interface TaxInvoiceInput {
  supplier_name?: string | null;
  supplier_abn?: string | null;
  recipient_name?: string | null;
  recipient_abn?: string | null;
  issue_date_iso?: string | null;
  description?: string | null;
  gst_inclusive_total_aud: number;
  gst_amount_aud?: number | null;
  /** True when the invoice carries the "Total price includes GST" statement. */
  gst_included_statement?: boolean | null;
  /** True when the document is prominently labelled "Tax invoice". */
  document_labelled_tax_invoice?: boolean | null;
  /** True when every line item is GST-free (fresh food, exports, etc.). */
  supply_is_gst_free?: boolean | null;
  /** True when the supply is input-taxed (residential rent, financial supplies). */
  supply_is_input_taxed?: boolean | null;
}

export type TaxInvoiceBand = "under_threshold" | "standard" | "large";

export type TaxInvoiceMissingField =
  | "gst_inclusive_total"
  | "supplier_name"
  | "supplier_abn"
  | "supplier_abn_invalid"
  | "issue_date"
  | "description"
  | "gst_amount_or_statement"
  | "document_label"
  | "recipient_abn_or_name";

export interface TaxInvoiceResult {
  ok: boolean;
  band: TaxInvoiceBand;
  gst_inclusive_total_aud: number;
  /** total ÷ 11, rounded to cents. Zero for GST-free / input-taxed supplies. */
  computed_gst_component_aud: number;
  missing_fields: TaxInvoiceMissingField[];
  warnings: string[];
  recommendations: string[];
  disclaimer: string;
}

export function assessTaxInvoice(input: TaxInvoiceInput): TaxInvoiceResult {
  const total = coerceAmount(input.gst_inclusive_total_aud);
  const band = classifyBand(total);
  const isGstFree = !!input.supply_is_gst_free;
  const isInputTaxed = !!input.supply_is_input_taxed;
  const isNonTaxableSupply = isGstFree || isInputTaxed;
  const gstComponent = isNonTaxableSupply ? 0 : roundCents(total / 11);

  const missing: TaxInvoiceMissingField[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (total <= 0) {
    missing.push("gst_inclusive_total");
  }

  if (band === "under_threshold") {
    if (total > 0) {
      warnings.push(
        `Under A$${TAX_INVOICE_MIN_THRESHOLD_AUD.toFixed(2)} GST-inclusive — a full tax invoice is not required, but a receipt showing the supplier's ABN is best practice for the data-room audit trail.`,
      );
    }
    recommendations.push(
      "Store the receipt in data-room folder 3 (Financial Projections) or folder 11 (Tax) so the ATO's 5-year retention rule is met even for under-threshold supplies.",
    );
    return {
      ok: total > 0,
      band,
      gst_inclusive_total_aud: total,
      computed_gst_component_aud: gstComponent,
      missing_fields: missing,
      warnings,
      recommendations,
      disclaimer: TAX_INVOICE_DISCLAIMER,
    };
  }

  if (!nonEmpty(input.supplier_name)) missing.push("supplier_name");
  if (!nonEmpty(input.supplier_abn)) {
    missing.push("supplier_abn");
  } else if (!validateAbnChecksum(input.supplier_abn ?? null)) {
    missing.push("supplier_abn_invalid");
  }
  if (!validIsoDate(input.issue_date_iso)) missing.push("issue_date");
  if (!nonEmpty(input.description)) missing.push("description");
  if (!input.document_labelled_tax_invoice) missing.push("document_label");

  const gstAmountShown =
    typeof input.gst_amount_aud === "number" &&
    Number.isFinite(input.gst_amount_aud) &&
    (input.gst_amount_aud as number) >= 0;
  const statementShown = !!input.gst_included_statement;

  if (isNonTaxableSupply) {
    if (isGstFree) {
      recommendations.push(
        "Mark GST-free line items separately per s 29-70(1)(c)(x) — the invoice must show which items are GST-free vs taxable.",
      );
    }
    if (isInputTaxed) {
      recommendations.push(
        "Input-taxed supplies (residential rent, financial supplies) don't attract GST and the recipient cannot claim a GST credit — label the invoice clearly.",
      );
    }
    if (gstAmountShown && (input.gst_amount_aud as number) > 0) {
      warnings.push(
        "GST amount is greater than zero even though the supply is marked GST-free or input-taxed — one of the flags is wrong.",
      );
    }
  } else if (!gstAmountShown && !statementShown) {
    missing.push("gst_amount_or_statement");
  } else if (gstAmountShown) {
    const declared = input.gst_amount_aud as number;
    const diff = Math.abs(declared - gstComponent);
    if (diff > TAX_INVOICE_GST_TOLERANCE_AUD) {
      warnings.push(
        `Declared GST amount A$${declared.toFixed(2)} differs from expected A$${gstComponent.toFixed(2)} (total ÷ 11 for a 10% GST-inclusive supply).`,
      );
    }
  }

  if (band === "large") {
    const recipientProvided = nonEmpty(input.recipient_name) || nonEmpty(input.recipient_abn);
    if (!recipientProvided) {
      missing.push("recipient_abn_or_name");
    }
    if (nonEmpty(input.recipient_abn) && !validateAbnChecksum(input.recipient_abn ?? null)) {
      warnings.push(
        "Recipient ABN fails modulus-89 checksum — verify it's exactly the correct 11 digits before lodging the input-tax credit.",
      );
    }
  }

  const ok = missing.length === 0;
  if (!ok) {
    recommendations.unshift(
      "Fix the missing fields above — the ATO can reject a GST input-tax credit if the tax-invoice format is incomplete.",
    );
  } else {
    recommendations.push(
      "Store the invoice in data-room folder 3 (Financial Projections) or folder 11 (Tax) — the ATO can audit up to 4 years back and expects contemporaneous records.",
    );
  }

  return {
    ok,
    band,
    gst_inclusive_total_aud: total,
    computed_gst_component_aud: gstComponent,
    missing_fields: missing,
    warnings,
    recommendations,
    disclaimer: TAX_INVOICE_DISCLAIMER,
  };
}

function classifyBand(total: number): TaxInvoiceBand {
  if (total < TAX_INVOICE_MIN_THRESHOLD_AUD) return "under_threshold";
  if (total >= TAX_INVOICE_LARGE_INVOICE_AUD) return "large";
  return "standard";
}

function coerceAmount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function validIsoDate(value: string | null | undefined): boolean {
  if (!nonEmpty(value)) return false;
  const d = new Date(value as string);
  return !Number.isNaN(d.getTime());
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}
