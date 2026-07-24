import { describe, expect, it } from "vitest";

import {
  TAX_INVOICE_DISCLAIMER,
  TAX_INVOICE_GST_TOLERANCE_AUD,
  TAX_INVOICE_LARGE_INVOICE_AUD,
  TAX_INVOICE_MIN_THRESHOLD_AUD,
  assessTaxInvoice,
  type TaxInvoiceInput,
} from "./tax-invoice-checker";

// Auschain PTY LTD ABN — valid modulus-89.
const VALID_SUPPLIER_ABN = "79 659 615 111";
// One digit flipped from the valid ABN so the checksum breaks.
const INVALID_SUPPLIER_ABN = "79 659 615 112";
const VALID_RECIPIENT_ABN = "51 824 753 556"; // ACNC / ATO example ABN

function buildStandardInvoice(overrides: Partial<TaxInvoiceInput> = {}): TaxInvoiceInput {
  return {
    supplier_name: "Auschain PTY LTD",
    supplier_abn: VALID_SUPPLIER_ABN,
    issue_date_iso: "2026-07-24",
    description: "BlockID.au subscription — 12 months",
    gst_inclusive_total_aud: 330,
    gst_amount_aud: 30,
    document_labelled_tax_invoice: true,
    ...overrides,
  };
}

function buildLargeInvoice(overrides: Partial<TaxInvoiceInput> = {}): TaxInvoiceInput {
  return {
    ...buildStandardInvoice({
      gst_inclusive_total_aud: 5_500,
      gst_amount_aud: 500,
    }),
    recipient_name: "Beta Angel Syndicate Pty Ltd",
    recipient_abn: VALID_RECIPIENT_ABN,
    ...overrides,
  };
}

describe("classifyBand", () => {
  it("under-threshold invoices need no full tax invoice", () => {
    const r = assessTaxInvoice({ gst_inclusive_total_aud: 45.5 });
    expect(r.band).toBe("under_threshold");
    expect(r.ok).toBe(true);
    expect(r.missing_fields).toEqual([]);
    expect(r.warnings[0]).toMatch(/best practice/);
    expect(r.recommendations[0]).toMatch(/data-room/);
    expect(r.disclaimer).toBe(TAX_INVOICE_DISCLAIMER);
  });

  it("zero-total invoices flag gst_inclusive_total as missing", () => {
    const r = assessTaxInvoice({ gst_inclusive_total_aud: 0 });
    expect(r.band).toBe("under_threshold");
    expect(r.ok).toBe(false);
    expect(r.missing_fields).toContain("gst_inclusive_total");
  });

  it("A$82.50 boundary lands in the standard band", () => {
    const r = assessTaxInvoice(buildStandardInvoice({ gst_inclusive_total_aud: TAX_INVOICE_MIN_THRESHOLD_AUD }));
    expect(r.band).toBe("standard");
  });

  it("A$999.99 stays in the standard band; A$1,000 flips to large", () => {
    const belowLarge = assessTaxInvoice(buildStandardInvoice({ gst_inclusive_total_aud: 999.99 }));
    const atLarge = assessTaxInvoice(buildLargeInvoice({ gst_inclusive_total_aud: TAX_INVOICE_LARGE_INVOICE_AUD }));
    expect(belowLarge.band).toBe("standard");
    expect(atLarge.band).toBe("large");
  });
});

describe("standard-band mandatory fields", () => {
  it("green path — all fields present + supplier ABN valid", () => {
    const r = assessTaxInvoice(buildStandardInvoice());
    expect(r.ok).toBe(true);
    expect(r.missing_fields).toEqual([]);
    expect(r.computed_gst_component_aud).toBe(30); // 330 / 11 = 30
    expect(r.recommendations[0]).toMatch(/data-room folder 3.*folder 11/);
  });

  it("missing supplier_name / issue_date / description / label all surface", () => {
    const r = assessTaxInvoice(
      buildStandardInvoice({
        supplier_name: "",
        issue_date_iso: "",
        description: "   ",
        document_labelled_tax_invoice: false,
      }),
    );
    expect(r.ok).toBe(false);
    expect(new Set(r.missing_fields)).toEqual(
      new Set(["supplier_name", "issue_date", "description", "document_label"]),
    );
    expect(r.recommendations[0]).toMatch(/Fix the missing fields/);
  });

  it("blank supplier ABN → supplier_abn; wrong-checksum ABN → supplier_abn_invalid", () => {
    const blank = assessTaxInvoice(buildStandardInvoice({ supplier_abn: "" }));
    const bad = assessTaxInvoice(buildStandardInvoice({ supplier_abn: INVALID_SUPPLIER_ABN }));
    expect(blank.missing_fields).toContain("supplier_abn");
    expect(blank.missing_fields).not.toContain("supplier_abn_invalid");
    expect(bad.missing_fields).toContain("supplier_abn_invalid");
    expect(bad.missing_fields).not.toContain("supplier_abn");
  });

  it("invalid issue_date_iso strings fail validation", () => {
    const r = assessTaxInvoice(buildStandardInvoice({ issue_date_iso: "not-a-date" }));
    expect(r.missing_fields).toContain("issue_date");
  });
});

describe("GST amount vs 'includes GST' statement", () => {
  it("no gst_amount and no statement → gst_amount_or_statement missing", () => {
    const r = assessTaxInvoice(
      buildStandardInvoice({
        gst_amount_aud: null,
        gst_included_statement: false,
      }),
    );
    expect(r.missing_fields).toContain("gst_amount_or_statement");
  });

  it("only 'Total price includes GST' statement is sufficient", () => {
    const r = assessTaxInvoice(
      buildStandardInvoice({
        gst_amount_aud: null,
        gst_included_statement: true,
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.missing_fields).toEqual([]);
  });

  it("declared GST amount within A$0.02 tolerance passes silently", () => {
    const r = assessTaxInvoice(
      buildStandardInvoice({
        gst_inclusive_total_aud: 330,
        gst_amount_aud: 30 + TAX_INVOICE_GST_TOLERANCE_AUD,
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("declared GST amount outside tolerance surfaces a warning", () => {
    const r = assessTaxInvoice(
      buildStandardInvoice({
        gst_inclusive_total_aud: 330,
        gst_amount_aud: 42,
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes("A$42.00") && w.includes("A$30.00"))).toBe(true);
  });
});

describe("large-invoice recipient identification", () => {
  it("A$1,000+ without recipient_name or recipient_abn → recipient_abn_or_name missing", () => {
    const r = assessTaxInvoice(
      buildLargeInvoice({ recipient_name: "", recipient_abn: null }),
    );
    expect(r.band).toBe("large");
    expect(r.missing_fields).toContain("recipient_abn_or_name");
  });

  it("recipient_name alone satisfies the large-invoice rule", () => {
    const r = assessTaxInvoice(
      buildLargeInvoice({ recipient_name: "Beta Angel Syndicate Pty Ltd", recipient_abn: null }),
    );
    expect(r.ok).toBe(true);
    expect(r.missing_fields).not.toContain("recipient_abn_or_name");
  });

  it("recipient_abn checksum failure surfaces as a warning, not a missing field", () => {
    const r = assessTaxInvoice(
      buildLargeInvoice({ recipient_name: "", recipient_abn: INVALID_SUPPLIER_ABN }),
    );
    expect(r.ok).toBe(true);
    expect(r.missing_fields).not.toContain("recipient_abn_or_name");
    expect(r.warnings.some((w) => w.includes("modulus-89"))).toBe(true);
  });
});

describe("GST-free / input-taxed supplies", () => {
  it("GST-free supply skips the GST amount check + adds a labelling recommendation", () => {
    const r = assessTaxInvoice(
      buildStandardInvoice({
        gst_amount_aud: null,
        gst_included_statement: false,
        supply_is_gst_free: true,
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.missing_fields).not.toContain("gst_amount_or_statement");
    expect(r.computed_gst_component_aud).toBe(0);
    expect(r.recommendations.some((rec) => rec.includes("GST-free"))).toBe(true);
  });

  it("input-taxed supply skips the GST amount check + adds a labelling recommendation", () => {
    const r = assessTaxInvoice(
      buildStandardInvoice({
        gst_amount_aud: null,
        gst_included_statement: false,
        supply_is_input_taxed: true,
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.computed_gst_component_aud).toBe(0);
    expect(r.recommendations.some((rec) => rec.toLowerCase().includes("input-taxed"))).toBe(true);
  });

  it("GST-free but positive GST amount → warning about flag mismatch", () => {
    const r = assessTaxInvoice(
      buildStandardInvoice({
        supply_is_gst_free: true,
        gst_amount_aud: 30,
      }),
    );
    expect(r.warnings.some((w) => w.includes("GST-free or input-taxed"))).toBe(true);
  });
});

describe("input tolerance", () => {
  it("non-finite total coerces to 0", () => {
    const r = assessTaxInvoice({ gst_inclusive_total_aud: Number.NaN });
    expect(r.gst_inclusive_total_aud).toBe(0);
    expect(r.missing_fields).toContain("gst_inclusive_total");
  });

  it("negative total coerces to 0", () => {
    const r = assessTaxInvoice({ gst_inclusive_total_aud: -50 });
    expect(r.gst_inclusive_total_aud).toBe(0);
    expect(r.band).toBe("under_threshold");
  });
});
