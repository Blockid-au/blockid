import { describe, expect, it } from "vitest";

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
  type TaxInvoiceFormState,
} from "./tax-invoice-checker.helpers";

// Auschain PTY LTD ABN — valid modulus-89.
const VALID_SUPPLIER_ABN = "79 659 615 111";

function withState(overrides: Partial<TaxInvoiceFormState>): TaxInvoiceFormState {
  return { ...makeEmptyTaxInvoiceFormState(), ...overrides };
}

describe("makeEmptyTaxInvoiceFormState", () => {
  it("returns 12 blank / false fields", () => {
    const s = makeEmptyTaxInvoiceFormState();
    expect(s.supplier_name).toBe("");
    expect(s.supplier_abn).toBe("");
    expect(s.recipient_name).toBe("");
    expect(s.recipient_abn).toBe("");
    expect(s.issue_date_iso).toBe("");
    expect(s.description).toBe("");
    expect(s.gst_inclusive_total_aud).toBe("");
    expect(s.gst_amount_aud).toBe("");
    expect(s.gst_included_statement).toBe(false);
    expect(s.document_labelled_tax_invoice).toBe(false);
    expect(s.supply_is_gst_free).toBe(false);
    expect(s.supply_is_input_taxed).toBe(false);
  });
});

describe("toTaxInvoiceInput", () => {
  it("collapses blank string fields to undefined so the checker's optional branches fire", () => {
    const wire = toTaxInvoiceInput(makeEmptyTaxInvoiceFormState());
    expect(wire.supplier_name).toBeUndefined();
    expect(wire.supplier_abn).toBeUndefined();
    expect(wire.recipient_name).toBeUndefined();
    expect(wire.recipient_abn).toBeUndefined();
    expect(wire.issue_date_iso).toBeUndefined();
    expect(wire.description).toBeUndefined();
    expect(wire.gst_amount_aud).toBeUndefined();
    // Required total falls back to 0 so the checker classifies under_threshold.
    expect(wire.gst_inclusive_total_aud).toBe(0);
  });

  it("round-trips a fully-populated standard invoice", () => {
    const wire = toTaxInvoiceInput(
      withState({
        supplier_name: "Auschain PTY LTD",
        supplier_abn: VALID_SUPPLIER_ABN,
        issue_date_iso: "2026-07-24",
        description: "BlockID subscription — 12 months",
        gst_inclusive_total_aud: "330",
        gst_amount_aud: "30",
        document_labelled_tax_invoice: true,
      }),
    );
    expect(wire.supplier_name).toBe("Auschain PTY LTD");
    expect(wire.supplier_abn).toBe(VALID_SUPPLIER_ABN);
    expect(wire.gst_inclusive_total_aud).toBe(330);
    expect(wire.gst_amount_aud).toBe(30);
    expect(wire.document_labelled_tax_invoice).toBe(true);
  });

  it("trims whitespace so a paste with padding still round-trips", () => {
    const wire = toTaxInvoiceInput(
      withState({
        supplier_name: "  Auschain PTY LTD  ",
        supplier_abn: `  ${VALID_SUPPLIER_ABN}  `,
        gst_inclusive_total_aud: "  330  ",
      }),
    );
    expect(wire.supplier_name).toBe("Auschain PTY LTD");
    expect(wire.supplier_abn).toBe(VALID_SUPPLIER_ABN);
    expect(wire.gst_inclusive_total_aud).toBe(330);
  });

  it("garbage numeric inputs coerce cleanly (total → 0, optional gst → undefined)", () => {
    const wire = toTaxInvoiceInput(
      withState({
        gst_inclusive_total_aud: "not-a-number",
        gst_amount_aud: "also-broken",
      }),
    );
    expect(wire.gst_inclusive_total_aud).toBe(0);
    expect(wire.gst_amount_aud).toBeUndefined();
  });

  it("propagates all four boolean flags", () => {
    const wire = toTaxInvoiceInput(
      withState({
        gst_included_statement: true,
        document_labelled_tax_invoice: true,
        supply_is_gst_free: true,
        supply_is_input_taxed: true,
      }),
    );
    expect(wire.gst_included_statement).toBe(true);
    expect(wire.document_labelled_tax_invoice).toBe(true);
    expect(wire.supply_is_gst_free).toBe(true);
    expect(wire.supply_is_input_taxed).toBe(true);
  });
});

describe("pickTaxInvoiceBand", () => {
  it("returns grey on a blank form", () => {
    const state = makeEmptyTaxInvoiceFormState();
    const result = assessTaxInvoice(toTaxInvoiceInput(state));
    expect(pickTaxInvoiceBand(result, state)).toBe("grey");
  });

  it("returns amber for an under-threshold receipt (ok=true with warning)", () => {
    const state = withState({
      supplier_name: "Corner Cafe",
      gst_inclusive_total_aud: "45.50",
    });
    const result = assessTaxInvoice(toTaxInvoiceInput(state));
    expect(result.band).toBe("under_threshold");
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(pickTaxInvoiceBand(result, state)).toBe("amber");
  });

  it("returns green for a valid standard tax invoice with no warnings", () => {
    const state = withState({
      supplier_name: "Auschain PTY LTD",
      supplier_abn: VALID_SUPPLIER_ABN,
      issue_date_iso: "2026-07-24",
      description: "BlockID subscription — 12 months",
      gst_inclusive_total_aud: "330",
      gst_amount_aud: "30",
      document_labelled_tax_invoice: true,
    });
    const result = assessTaxInvoice(toTaxInvoiceInput(state));
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(pickTaxInvoiceBand(result, state)).toBe("green");
  });

  it("returns red when a standard invoice is missing mandatory fields", () => {
    const state = withState({
      supplier_name: "Auschain PTY LTD",
      gst_inclusive_total_aud: "330",
      // no ABN, no date, no description, no label — many misses
    });
    const result = assessTaxInvoice(toTaxInvoiceInput(state));
    expect(result.ok).toBe(false);
    expect(result.missing_fields.length).toBeGreaterThan(0);
    expect(pickTaxInvoiceBand(result, state)).toBe("red");
  });

  it("returns amber for a valid invoice with a GST tolerance warning", () => {
    const state = withState({
      supplier_name: "Auschain PTY LTD",
      supplier_abn: VALID_SUPPLIER_ABN,
      issue_date_iso: "2026-07-24",
      description: "BlockID subscription — 12 months",
      gst_inclusive_total_aud: "330",
      // Declared GST wildly off from 330÷11 = 30 → warning, not missing.
      gst_amount_aud: "45",
      document_labelled_tax_invoice: true,
    });
    const result = assessTaxInvoice(toTaxInvoiceInput(state));
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(pickTaxInvoiceBand(result, state)).toBe("amber");
  });
});

describe("copy packs", () => {
  it("TAX_INVOICE_HEADLINE has distinct wording for every band", () => {
    const headlines = new Set(Object.values(TAX_INVOICE_HEADLINE));
    expect(headlines.size).toBe(4);
    for (const h of headlines) expect(h.length).toBeGreaterThan(0);
  });

  it("MISSING_FIELD_LABEL covers every TaxInvoiceMissingField code", () => {
    const keys = Object.keys(MISSING_FIELD_LABEL);
    // Keep this list in sync with tax-invoice-checker.ts if new codes appear.
    expect(keys.sort()).toEqual(
      [
        "description",
        "document_label",
        "gst_amount_or_statement",
        "gst_inclusive_total",
        "issue_date",
        "recipient_abn_or_name",
        "supplier_abn",
        "supplier_abn_invalid",
        "supplier_name",
      ].sort(),
    );
    for (const label of Object.values(MISSING_FIELD_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("BAND_TO_LABEL surfaces the ATO threshold anchors in the copy", () => {
    expect(BAND_TO_LABEL.under_threshold).toMatch(/82\.50/);
    expect(BAND_TO_LABEL.standard).toMatch(/82\.50/);
    expect(BAND_TO_LABEL.large).toMatch(/1,000/);
  });
});

describe("canSaveTaxInvoiceCheck (P5-tax-invoice-checker-save)", () => {
  it("returns false on a fully blank form so we don't insert an empty snapshot", () => {
    expect(canSaveTaxInvoiceCheck(makeEmptyTaxInvoiceFormState())).toBe(false);
  });

  it("returns true once a positive total is typed even without supplier data", () => {
    expect(
      canSaveTaxInvoiceCheck(
        withState({ gst_inclusive_total_aud: "45.50" }),
      ),
    ).toBe(true);
  });

  it("returns true when only supplier data is typed (drafting a template row)", () => {
    expect(
      canSaveTaxInvoiceCheck(withState({ supplier_name: "Auschain PTY LTD" })),
    ).toBe(true);
    expect(
      canSaveTaxInvoiceCheck(withState({ supplier_abn: VALID_SUPPLIER_ABN })),
    ).toBe(true);
  });

  it("returns false when total is zero / negative / garbage AND no supplier data", () => {
    expect(
      canSaveTaxInvoiceCheck(withState({ gst_inclusive_total_aud: "0" })),
    ).toBe(false);
    expect(
      canSaveTaxInvoiceCheck(withState({ gst_inclusive_total_aud: "-10" })),
    ).toBe(false);
    expect(
      canSaveTaxInvoiceCheck(
        withState({ gst_inclusive_total_aud: "not-a-number" }),
      ),
    ).toBe(false);
  });

  it("treats whitespace-only supplier fields as blank", () => {
    expect(
      canSaveTaxInvoiceCheck(
        withState({ supplier_name: "   ", supplier_abn: "  " }),
      ),
    ).toBe(false);
  });
});

describe("save status copy packs (P5-tax-invoice-checker-save)", () => {
  it("SAVE_BUTTON_LABEL has distinct copy for every status", () => {
    const labels = new Set(Object.values(SAVE_BUTTON_LABEL));
    expect(labels.size).toBe(4);
    for (const l of labels) expect(l.length).toBeGreaterThan(0);
    // Idle + error should not read as "saving" so the founder doesn't think the
    // button is stuck.
    expect(SAVE_BUTTON_LABEL.idle).not.toMatch(/…/);
    expect(SAVE_BUTTON_LABEL.error).toMatch(/retry/i);
  });

  it("SAVE_STATUS_MESSAGE surfaces founder-facing copy for saving / saved / error", () => {
    expect(SAVE_STATUS_MESSAGE.saving).toMatch(/snapshot/i);
    expect(SAVE_STATUS_MESSAGE.saved).toMatch(/history/i);
    expect(SAVE_STATUS_MESSAGE.error).toMatch(/failed/i);
  });
});
