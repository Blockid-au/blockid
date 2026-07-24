import { describe, expect, it } from "vitest";
import {
  computeContributionMargins,
  formatMarginCell,
  formatWeeklyDigestContributionMarginSection,
} from "./contribution-margin";
import type { NetContributionRow } from "./attributed-net-contribution";

function row(
  reseller_id: string,
  reseller_code: string,
  reseller_display_name: string,
  revenue_cents: number,
  commission_cost_cents: number,
  credit_cogs_cents: number,
): NetContributionRow {
  return {
    reseller_id,
    reseller_code,
    reseller_display_name,
    net: {
      revenue_cents,
      commission_cost_cents,
      credit_cogs_cents,
      net_contribution_cents:
        revenue_cents - commission_cost_cents - credit_cogs_cents,
    },
  };
}

describe("computeContributionMargins — shape", () => {
  it("returns an empty projection for empty input", () => {
    const m = computeContributionMargins([], "2026-07");
    expect(m.reseller_count).toBe(0);
    expect(m.rows).toEqual([]);
    expect(m.portfolio_revenue_cents).toBe(0);
    expect(m.portfolio_net_cents).toBe(0);
    expect(m.portfolio_margin_pct).toBeNull();
    expect(m.month_key).toBe("2026-07");
  });

  it("passes monthKey through unchanged", () => {
    const m = computeContributionMargins(
      [row("r-1", "AAA", "Alpha", 10000, 0, 0)],
      "2027-02",
    );
    expect(m.month_key).toBe("2027-02");
  });
});

describe("computeContributionMargins — margin math", () => {
  it("computes margin as trunc((net / revenue) * 100)", () => {
    // revenue 10000 cents, net 2500 cents ⇒ 25%
    const m = computeContributionMargins(
      [row("r-1", "AAA", "Alpha", 10000, 0, 7500)],
      "2026-07",
    );
    expect(m.rows[0].margin_pct).toBe(25);
  });

  it("trunc keeps loss magnitude visible (-12.7 ⇒ -12)", () => {
    // revenue 10000, net -1270 (commission 12700 - COGS 0) ⇒ -12.7% ⇒ -12
    const m = computeContributionMargins(
      [row("r-1", "AAA", "Alpha", 10000, 11270, 0)],
      "2026-07",
    );
    expect(m.rows[0].margin_pct).toBe(-12);
  });

  it("renders null margin for zero-revenue rows", () => {
    const m = computeContributionMargins(
      [row("r-1", "AAA", "Alpha", 0, 500, 100)],
      "2026-07",
    );
    expect(m.rows[0].margin_pct).toBeNull();
  });

  it("clamps negative revenue to 0 via safeCents (garbled row → null margin)", () => {
    const m = computeContributionMargins(
      [row("r-1", "AAA", "Alpha", -500, 0, 0)],
      "2026-07",
    );
    expect(m.rows[0].revenue_cents).toBe(-500);
    expect(m.rows[0].margin_pct).toBeNull();
  });
});

describe("computeContributionMargins — sort", () => {
  it("sorts by margin desc so most-profitable partner lands first", () => {
    const rows = [
      row("r-1", "BBB", "Bravo", 10000, 0, 5000), // 50%
      row("r-2", "AAA", "Alpha", 10000, 0, 8000), // 20%
      row("r-3", "CCC", "Charlie", 10000, 0, 2000), // 80%
    ];
    const m = computeContributionMargins(rows, "2026-07");
    expect(m.rows.map((r) => r.reseller_code)).toEqual(["CCC", "BBB", "AAA"]);
  });

  it("tie-breaks equal margins by reseller_code asc", () => {
    const rows = [
      row("r-1", "BBB", "Bravo", 10000, 0, 5000), // 50%
      row("r-2", "AAA", "Alpha", 20000, 0, 10000), // 50%
      row("r-3", "CCC", "Charlie", 10000, 0, 5000), // 50%
    ];
    const m = computeContributionMargins(rows, "2026-07");
    expect(m.rows.map((r) => r.reseller_code)).toEqual(["AAA", "BBB", "CCC"]);
  });

  it("sorts null-margin (zero-revenue) rows last", () => {
    const rows = [
      row("r-1", "AAA", "Alpha", 0, 500, 100), // null
      row("r-2", "BBB", "Bravo", 10000, 0, 8000), // 20%
      row("r-3", "CCC", "Charlie", 10000, 0, 5000), // 50%
    ];
    const m = computeContributionMargins(rows, "2026-07");
    expect(m.rows.map((r) => r.reseller_code)).toEqual(["CCC", "BBB", "AAA"]);
    expect(m.rows[2].margin_pct).toBeNull();
  });

  it("groups multiple null-margin rows together at the end", () => {
    const rows = [
      row("r-1", "AAA", "Alpha", 0, 0, 0), // null
      row("r-2", "BBB", "Bravo", 10000, 0, 5000), // 50%
      row("r-3", "CCC", "Charlie", 0, 0, 0), // null
    ];
    const m = computeContributionMargins(rows, "2026-07");
    expect(m.rows.map((r) => r.reseller_code)).toEqual(["BBB", "AAA", "CCC"]);
  });
});

describe("computeContributionMargins — portfolio aggregate", () => {
  it("sums revenue + net across all rows", () => {
    const rows = [
      row("r-1", "AAA", "Alpha", 10000, 1000, 500), // net 8500
      row("r-2", "BBB", "Bravo", 5000, 500, 250), // net 4250
    ];
    const m = computeContributionMargins(rows, "2026-07");
    expect(m.portfolio_revenue_cents).toBe(15000);
    expect(m.portfolio_net_cents).toBe(12750);
    expect(m.portfolio_margin_pct).toBe(85); // 12750/15000 = 85%
  });

  it("returns null portfolio margin when total revenue is zero", () => {
    const rows = [
      row("r-1", "AAA", "Alpha", 0, 500, 100),
      row("r-2", "BBB", "Bravo", 0, 200, 50),
    ];
    const m = computeContributionMargins(rows, "2026-07");
    expect(m.portfolio_revenue_cents).toBe(0);
    expect(m.portfolio_margin_pct).toBeNull();
  });

  it("reseller_count matches input length even when some are null-margin", () => {
    const rows = [
      row("r-1", "AAA", "Alpha", 10000, 0, 5000),
      row("r-2", "BBB", "Bravo", 0, 500, 100),
    ];
    const m = computeContributionMargins(rows, "2026-07");
    expect(m.reseller_count).toBe(2);
  });
});

describe("formatMarginCell", () => {
  it("renders null as em dash", () => {
    expect(formatMarginCell(null)).toBe("—");
  });

  it("renders positive integer with % suffix", () => {
    expect(formatMarginCell(42)).toBe("42%");
  });

  it("renders negative integer with leading minus", () => {
    expect(formatMarginCell(-15)).toBe("-15%");
  });

  it("renders zero as 0%", () => {
    expect(formatMarginCell(0)).toBe("0%");
  });
});

describe("formatWeeklyDigestContributionMarginSection", () => {
  it("returns empty string for zero rows", () => {
    const m = computeContributionMargins([], "2026-07");
    expect(formatWeeklyDigestContributionMarginSection(m)).toBe("");
  });

  it("includes the month key in the header", () => {
    const m = computeContributionMargins(
      [row("r-1", "AAA", "Alpha", 10000, 0, 5000)],
      "2026-07",
    );
    const html = formatWeeklyDigestContributionMarginSection(m);
    expect(html).toContain("Contribution margin % — 2026-07");
  });

  it("highlights negative-margin rows amber", () => {
    const m = computeContributionMargins(
      [row("r-1", "AAA", "Alpha", 10000, 12000, 0)], // net -2000, -20%
      "2026-07",
    );
    const html = formatWeeklyDigestContributionMarginSection(m);
    expect(html).toContain('background:#fff8e1');
    expect(html).toContain("-20%");
  });

  it("does not highlight zero-margin rows", () => {
    const m = computeContributionMargins(
      [row("r-1", "AAA", "Alpha", 10000, 10000, 0)], // net 0, 0%
      "2026-07",
    );
    const html = formatWeeklyDigestContributionMarginSection(m);
    expect(html).not.toContain("background:#fff8e1");
  });

  it("does not highlight null-margin (zero-revenue) rows", () => {
    const m = computeContributionMargins(
      [row("r-1", "AAA", "Alpha", 0, 500, 100)],
      "2026-07",
    );
    const html = formatWeeklyDigestContributionMarginSection(m);
    expect(html).not.toContain("background:#fff8e1");
    expect(html).toContain(">—<");
  });

  it("HTML-escapes display name + month key", () => {
    const m = computeContributionMargins(
      [row("r-1", "AAA", "<script>alert(1)</script>", 10000, 0, 5000)],
      "2026-07<x>",
    );
    const html = formatWeeklyDigestContributionMarginSection(m);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("2026-07&lt;x&gt;");
  });

  it("renders portfolio footer with aggregate margin", () => {
    const m = computeContributionMargins(
      [
        row("r-1", "AAA", "Alpha", 10000, 0, 5000), // net 5000, 50%
        row("r-2", "BBB", "Bravo", 10000, 0, 8000), // net 2000, 20%
      ],
      "2026-07",
    );
    const html = formatWeeklyDigestContributionMarginSection(m);
    // Portfolio: revenue 20000, net 7000 ⇒ 35%
    expect(html).toContain("<strong>Portfolio</strong>");
    expect(html).toContain("<strong>35%</strong>");
    expect(html).toContain("<strong>A$200.00</strong>"); // revenue 20000c
    expect(html).toContain("<strong>A$70.00</strong>"); // net 7000c
  });

  it("renders 5 body columns per row (code / display / revenue / net / margin)", () => {
    const m = computeContributionMargins(
      [row("r-1", "AAA", "Alpha", 10000, 0, 5000)],
      "2026-07",
    );
    const html = formatWeeklyDigestContributionMarginSection(m);
    const bodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    expect(bodyMatch).not.toBeNull();
    const tdCount = (bodyMatch![1].match(/<td/g) ?? []).length;
    expect(tdCount).toBe(5);
  });

  it("uses signed AUD formatting (-A$D.CC) for negative net contribution", () => {
    const m = computeContributionMargins(
      [row("r-1", "AAA", "Alpha", 10000, 12000, 0)], // net -2000c
      "2026-07",
    );
    const html = formatWeeklyDigestContributionMarginSection(m);
    expect(html).toContain("-A$20.00");
  });
});
