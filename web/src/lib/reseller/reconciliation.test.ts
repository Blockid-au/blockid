import { describe, it, expect } from "vitest";
import {
  csvEscape,
  formatDriftEmail,
  formatReconciliationCsv,
  formatReconciliationEmail,
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
