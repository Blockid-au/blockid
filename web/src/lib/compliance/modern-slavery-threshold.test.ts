// Pure-helper coverage for modern-slavery-threshold.ts. Contract:
//   docs/plans/atlassian-standard-mapping-goal.md §1 phase 11 + §2 folder 12 item 12.6
//   (Modern Slavery A$100M consolidated-revenue threshold detector, P1n).
//
// Modern Slavery Act 2018 (Cth) s5 (A$100M threshold) + s13 (statement due
// within 6 months of FY end) + s16 (7 mandatory reporting criteria).

import { describe, it, expect } from "vitest";
import {
  MODERN_SLAVERY_THRESHOLD_AUD,
  MODERN_SLAVERY_APPROACHING_AUD,
  MODERN_SLAVERY_STATEMENT_WINDOW_MONTHS,
  MODERN_SLAVERY_DISCLAIMER,
  assessModernSlavery,
  assessModernSlaveryFromRevenue,
} from "./modern-slavery-threshold";

// A "now" the tests can pin — fixed FY end (30-Jun-2026), so "current FY end"
// defaults to 2027-06-30 (since NOW is after 30-Jun-2026).
const NOW = new Date("2026-07-24T00:00:00Z");

describe("assessModernSlavery — branch matrix", () => {
  it("returns not_required when revenue is well below A$100M", () => {
    const r = assessModernSlavery(
      { current_period_revenue_aud: 5_000_000 },
      NOW,
    );
    expect(r.action_required).toBe("not_required");
    expect(r.urgency).toBe("ok");
    expect(r.is_reporting_entity).toBe(false);
    expect(r.is_above_threshold).toBe(false);
    expect(r.statement_due_iso).toBeUndefined();
    expect(r.disclaimer).toBe(MODERN_SLAVERY_DISCLAIMER);
  });

  it("returns approaching_threshold when revenue is in the A$80M-99M warning band", () => {
    const r = assessModernSlavery(
      {
        current_period_revenue_aud: 45_000_000,
        projected_full_period_revenue_aud: 92_000_000,
      },
      NOW,
    );
    expect(r.action_required).toBe("approaching_threshold");
    expect(r.urgency).toBe("warning");
    expect(r.is_above_threshold).toBe(false);
    expect(r.reasoning).toMatch(/s6/);
  });

  it("fires statement_required when projected revenue crosses A$100M mid-period", () => {
    const r = assessModernSlavery(
      {
        current_period_revenue_aud: 45_000_000,
        projected_full_period_revenue_aud: 110_000_000,
      },
      NOW,
    );
    expect(r.action_required).toBe("statement_required");
    expect(r.urgency).toBe("warning");
    expect(r.is_reporting_entity).toBe(true);
    expect(r.is_above_threshold).toBe(true);
    // Default FY end for NOW=2026-07-24 is 2027-06-30 → statement due 2027-12-30.
    expect(r.statement_due_iso).toBe("2027-12-30");
    expect(r.reasoning).toMatch(/s16/);
  });

  it("fires statement_due_soon after FY has ended and last FY revenue crossed A$100M", () => {
    const r = assessModernSlavery(
      {
        current_period_revenue_aud: 20_000_000,
        last_full_period_revenue_aud: 120_000_000,
        current_fy_end_iso: "2026-06-30", // FY already ended relative to NOW
      },
      NOW,
    );
    expect(r.action_required).toBe("statement_due_soon");
    expect(r.urgency).toBe("critical");
    expect(r.is_reporting_entity).toBe(true);
    expect(r.statement_due_iso).toBe("2026-12-30");
    expect(r.days_until_statement_due).toBeGreaterThan(0);
    expect(r.reasoning).toMatch(/s13\(2\)/);
  });

  it("fires statement_overdue when the 6-month window has passed", () => {
    const r = assessModernSlavery(
      {
        current_period_revenue_aud: 20_000_000,
        last_full_period_revenue_aud: 120_000_000,
        current_fy_end_iso: "2025-06-30", // ended 13 months before NOW
      },
      NOW,
    );
    expect(r.action_required).toBe("statement_overdue");
    expect(r.urgency).toBe("critical");
    expect(r.is_reporting_entity).toBe(true);
    expect(r.statement_due_iso).toBe("2025-12-30");
    expect(r.days_until_statement_due).toBeLessThan(0);
    expect(r.reasoning).toMatch(/days overdue/);
  });

  it("returns already_lodged when a statement has been lodged and last FY was above threshold", () => {
    const r = assessModernSlavery(
      {
        current_period_revenue_aud: 20_000_000,
        last_full_period_revenue_aud: 150_000_000,
        current_fy_end_iso: "2026-06-30",
        last_statement_lodged_at: "2026-11-15",
      },
      NOW,
    );
    expect(r.action_required).toBe("already_lodged");
    expect(r.urgency).toBe("ok");
    expect(r.reasoning).toMatch(/2026-11-15/);
    expect(r.statement_due_iso).toBe("2026-12-30");
  });

  it("returns not_required for a foreign entity that does not carry on business in Australia", () => {
    const r = assessModernSlavery(
      {
        current_period_revenue_aud: 500_000_000,
        is_australian_or_carrying_on_business_in_au: false,
      },
      NOW,
    );
    expect(r.action_required).toBe("not_required");
    expect(r.is_reporting_entity).toBe(false);
    expect(r.reasoning).toMatch(/s5 does not apply/);
  });

  it("tolerates NaN, negative, and missing revenue inputs without throwing", () => {
    const r = assessModernSlavery(
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        current_period_revenue_aud: Number.NaN as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        projected_full_period_revenue_aud: -1_000 as any,
      },
      NOW,
    );
    expect(r.current_period_revenue_aud).toBe(0);
    expect(r.projected_full_period_revenue_aud).toBe(0);
    expect(r.action_required).toBe("not_required");
  });
});

describe("assessModernSlaveryFromRevenue — shortcut", () => {
  it("crosses the threshold when current revenue ≥ A$100M", () => {
    const r = assessModernSlaveryFromRevenue(105_000_000);
    expect(r.action_required).toBe("statement_required");
    expect(r.is_above_threshold).toBe(true);
  });

  it("returns approaching when in the warning band", () => {
    const r = assessModernSlaveryFromRevenue(85_000_000);
    expect(r.action_required).toBe("approaching_threshold");
  });

  it("stays under threshold when revenue is well below A$80M", () => {
    const r = assessModernSlaveryFromRevenue(2_500_000);
    expect(r.action_required).toBe("not_required");
    expect(r.urgency).toBe("ok");
  });

  it("propagates carrying_on_business_in_au=false to a not_required verdict", () => {
    const r = assessModernSlaveryFromRevenue(500_000_000, {
      is_australian_or_carrying_on_business_in_au: false,
    });
    expect(r.action_required).toBe("not_required");
  });
});

describe("statement_due_iso — 6-month window after FY end", () => {
  it("30-Jun-2026 FY end → statement due 2026-12-30", () => {
    const r = assessModernSlavery(
      {
        current_period_revenue_aud: 200_000_000,
        current_fy_end_iso: "2026-06-30",
      },
      new Date("2026-05-01T00:00:00Z"),
    );
    expect(r.statement_due_iso).toBe("2026-12-30");
  });

  it("31-Dec-2026 FY end → statement due 2027-06-30", () => {
    const r = assessModernSlavery(
      {
        current_period_revenue_aud: 200_000_000,
        current_fy_end_iso: "2026-12-31",
      },
      new Date("2026-05-01T00:00:00Z"),
    );
    expect(r.statement_due_iso).toBe("2027-06-30");
  });
});

describe("constants", () => {
  it("pins Modern Slavery statutory numbers", () => {
    expect(MODERN_SLAVERY_THRESHOLD_AUD).toBe(100_000_000);
    expect(MODERN_SLAVERY_APPROACHING_AUD).toBe(80_000_000);
    expect(MODERN_SLAVERY_STATEMENT_WINDOW_MONTHS).toBe(6);
  });
});
