import { describe, it, expect } from "vitest";
import {
  csvEscape,
  computeGstDelta,
  formatDriftEmail,
  formatGstDriftEmail,
  formatReconciliationCsv,
  formatReconciliationEmail,
  GST_TOLERANCE_CENTS,
  sumClearedCents,
  type ReconciliationRow,
  type StripeDriftRow,
} from "./reconciliation";

const sampleRows: ReconciliationRow[] = [
  {
    reseller_id: "aaa",
    reseller_code: "INFOVISION",
    reseller_display_name: "InfoVision",
    billing_model: "wholesale",
    cleared_count: 4,
    cleared_commission_aud_cents: 0,
  },
  {
    reseller_id: "bbb",
    reseller_code: "PARTNER20",
    reseller_display_name: 'Alpha, "Bravo" & Co',
    billing_model: "retail",
    cleared_count: 2,
    cleared_commission_aud_cents: 15840,
  },
];

describe("csvEscape", () => {
  it("wraps values with commas, quotes, or newlines", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
    expect(csvEscape(0)).toBe("0");
  });
});

describe("formatReconciliationCsv", () => {
  it("orders rows by code and includes AUD column", () => {
    const csv = formatReconciliationCsv("2026-07", sampleRows);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(
      "# BlockID reseller commission reconciliation — 2026-07",
    );
    expect(lines[1]).toBe(
      "reseller_id,reseller_code,reseller_display_name,billing_model,cleared_count,cleared_commission_aud_cents,cleared_commission_aud",
    );
    expect(lines[2]).toBe("aaa,INFOVISION,InfoVision,wholesale,4,0,0.00");
    expect(lines[3]).toBe(
      'bbb,PARTNER20,"Alpha, ""Bravo"" & Co",retail,2,15840,158.40',
    );
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("handles empty input with headers only", () => {
    const csv = formatReconciliationCsv("2026-07", []);
    const lines = csv.trimEnd().split("\n");
    expect(lines.length).toBe(2);
  });
});

describe("sumClearedCents", () => {
  it("totals every row", () => {
    expect(sumClearedCents(sampleRows)).toBe(15840);
    expect(sumClearedCents([])).toBe(0);
  });
});

describe("formatReconciliationEmail", () => {
  it("renders total and per-row cells", () => {
    const html = formatReconciliationEmail("2026-07", sampleRows);
    expect(html).toContain("Reseller reconciliation — 2026-07");
    expect(html).toContain("A$158.40");
    expect(html).toContain("Alpha, &quot;Bravo&quot; &amp; Co");
    expect(html).toContain("INFOVISION");
  });

  it("shows fallback when no rows", () => {
    const html = formatReconciliationEmail("2026-07", []);
    expect(html).toContain("No cleared commissions this month");
    expect(html).toContain("A$0.00");
  });
});

describe("computeGstDelta", () => {
  it("classifies equal totals as within tolerance", () => {
    const r = computeGstDelta("2026-07", 12345, 12345, 3);
    expect(r).toMatchObject({
      month: "2026-07",
      ledger_gst_aud_cents: 12345,
      stripe_gst_aud_cents: 12345,
      delta_cents: 0,
      abs_delta_cents: 0,
      within_tolerance: true,
      stripe_invoice_count: 3,
    });
  });

  it("holds at the boundary (exactly A$1 delta = within tolerance)", () => {
    const r = computeGstDelta("2026-07", 10100, 10000);
    expect(r.delta_cents).toBe(GST_TOLERANCE_CENTS);
    expect(r.within_tolerance).toBe(true);
  });

  it("flips at boundary + 1 cent", () => {
    const r = computeGstDelta("2026-07", 10101, 10000);
    expect(r.delta_cents).toBe(101);
    expect(r.within_tolerance).toBe(false);
  });

  it("treats negative deltas symmetrically", () => {
    const r = computeGstDelta("2026-07", 9899, 10000);
    expect(r.delta_cents).toBe(-101);
    expect(r.abs_delta_cents).toBe(101);
    expect(r.within_tolerance).toBe(false);
  });

  it("zeroes report as within tolerance", () => {
    const r = computeGstDelta("2026-07", 0, 0, 0);
    expect(r.within_tolerance).toBe(true);
    expect(r.stripe_invoice_count).toBe(0);
  });

  it("truncates fractional cent inputs", () => {
    const r = computeGstDelta("2026-07", 12345.7, 12345.2);
    expect(r.ledger_gst_aud_cents).toBe(12345);
    expect(r.stripe_gst_aud_cents).toBe(12345);
    expect(r.delta_cents).toBe(0);
  });
});

describe("formatReconciliationEmail with GST section", () => {
  it("appends GST reconciliation block when supplied", () => {
    const html = formatReconciliationEmail(
      "2026-07",
      sampleRows,
      computeGstDelta("2026-07", 27500, 27500, 12),
    );
    expect(html).toContain("GST reconciliation — 2026-07");
    expect(html).toContain("A$275.00");
    expect(html).toContain("within A$1.00 tolerance");
    expect(html).toContain("12 invoices");
  });

  it("marks drift when out of tolerance", () => {
    const html = formatReconciliationEmail(
      "2026-07",
      sampleRows,
      computeGstDelta("2026-07", 30000, 27500, 1),
    );
    expect(html).toContain("EXCEEDS A$1.00 tolerance");
    expect(html).toContain("1 invoice"); // singular
  });

  it("omits GST section when not supplied", () => {
    const html = formatReconciliationEmail("2026-07", sampleRows);
    expect(html).not.toContain("GST reconciliation");
  });
});

describe("formatGstDriftEmail", () => {
  it("summarises the delta with plain-text guidance", () => {
    const html = formatGstDriftEmail(
      computeGstDelta("2026-07", 12500, 10000, 7),
    );
    expect(html).toContain("GST reconciliation drift — 2026-07");
    expect(html).toContain("A$125.00");
    expect(html).toContain("A$100.00");
    expect(html).toContain("A$25.00"); // delta
    expect(html).toContain("7 invoices");
    expect(html).toContain("BAS lodgement");
  });

  it("uses singular invoice noun when count is 1", () => {
    const html = formatGstDriftEmail(
      computeGstDelta("2026-07", 200, 0, 1),
    );
    expect(html).toContain("1 invoice)");
  });
});

describe("formatDriftEmail", () => {
  it("summarises drift rows with escaped fields", () => {
    const rows: StripeDriftRow[] = [
      {
        code: "INFOVISION20",
        reseller_code: "INFOVISION",
        tier_pct: 20,
        stripe_promotion_code_id: "promo_123",
        reason: "inactive_in_stripe",
      },
      {
        code: "PARTNER<10>",
        reseller_code: "PARTNER",
        tier_pct: 10,
        stripe_promotion_code_id: "promo_456",
        reason: "not_found",
      },
    ];
    const html = formatDriftEmail(rows, "2026-07-21T00:00:00Z");
    expect(html).toContain("promo_123");
    expect(html).toContain("2 code(s)");
    expect(html).toContain("PARTNER&lt;10&gt;");
  });
});
