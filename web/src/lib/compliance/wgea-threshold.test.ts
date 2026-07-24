// Pure-helper coverage for wgea-threshold.ts. Contract:
//   docs/plans/atlassian-standard-mapping-goal.md §1 phase 11 + §2 folder 12 item 12.5
//   (WGEA 100-employee threshold detector, spun off as P1n).
//
// WGE Act 2012 (Cth): 100-employee threshold at s3; s3B(2) 2-period grace.
// Reporting period 1-Apr → 31-Mar; public report due 31-May-following.

import { describe, it, expect } from "vitest";
import {
  WGEA_HEADCOUNT_THRESHOLD,
  WGEA_APPROACHING_HEADCOUNT,
  WGEA_GRACE_PERIODS,
  WGEA_DISCLAIMER,
  assessWGEA,
  assessWGEAFromHeadcount,
} from "./wgea-threshold";

const NOW = new Date("2026-07-24T00:00:00Z");

describe("assessWGEA — branch matrix", () => {
  it("returns not_required when headcount is well below 100", () => {
    const r = assessWGEA(
      { current_headcount_au: 20, has_previously_reported: false },
      NOW,
    );
    expect(r.action_required).toBe("not_required");
    expect(r.urgency).toBe("ok");
    expect(r.is_relevant_employer).toBe(false);
    expect(r.is_above_threshold).toBe(false);
    expect(r.next_report_due_iso).toBeUndefined();
    expect(r.disclaimer).toBe(WGEA_DISCLAIMER);
  });

  it("returns approaching_threshold when headcount is in the 80-99 warning band", () => {
    const r = assessWGEA(
      { current_headcount_au: 92, has_previously_reported: false },
      NOW,
    );
    expect(r.action_required).toBe("approaching_threshold");
    expect(r.urgency).toBe("warning");
    expect(r.is_above_threshold).toBe(false);
    expect(r.reasoning).toMatch(/six gender-equality-indicator/);
  });

  it("fires report_required when current headcount is at or above 100", () => {
    const r = assessWGEA(
      { current_headcount_au: 120, has_previously_reported: false },
      NOW,
    );
    expect(r.action_required).toBe("report_required");
    expect(r.urgency).toBe("critical");
    expect(r.is_relevant_employer).toBe(true);
    expect(r.is_above_threshold).toBe(true);
    expect(r.next_report_due_iso).toBe("2027-05-31");
    expect(r.reasoning).toMatch(/s3 WGE Act 2012/);
  });

  it("fires report_required when the historical peak crossed 100 even if current has dipped", () => {
    const r = assessWGEA(
      {
        current_headcount_au: 95,
        monthly_headcount_last_12_months: [90, 92, 95, 100, 105, 110, 108, 104, 101, 99, 96, 95],
        has_previously_reported: false,
      },
      NOW,
    );
    expect(r.action_required).toBe("report_required");
    expect(r.peak_headcount_last_12_months).toBe(110);
    expect(r.is_above_threshold).toBe(true);
  });

  it("keeps a previously-reporting employer in grace_period for two more periods after dropping below 100", () => {
    const r = assessWGEA(
      {
        current_headcount_au: 85,
        has_previously_reported: true,
        reporting_periods_since_last_over_threshold: 0,
      },
      NOW,
    );
    expect(r.action_required).toBe("grace_period");
    expect(r.urgency).toBe("warning");
    expect(r.is_relevant_employer).toBe(true);
    expect(r.reasoning).toMatch(/s3B\(2\)/);
    expect(r.reasoning).toMatch(/2 more reporting periods/);
  });

  it("exits grace_period after WGEA_GRACE_PERIODS reporting periods elapse", () => {
    const r = assessWGEA(
      {
        current_headcount_au: 40,
        has_previously_reported: true,
        reporting_periods_since_last_over_threshold: WGEA_GRACE_PERIODS,
      },
      NOW,
    );
    // Grace expired — with headcount 40, falls to not_required.
    expect(r.action_required).toBe("not_required");
    expect(r.is_relevant_employer).toBe(false);
  });

  it("returns already_reporting when a WGEA report was recently lodged and employer remains relevant", () => {
    const r = assessWGEA(
      {
        current_headcount_au: 150,
        has_previously_reported: true,
        last_report_lodged_at: "2026-05-31",
      },
      NOW,
    );
    expect(r.action_required).toBe("already_reporting");
    expect(r.urgency).toBe("ok");
    expect(r.reasoning).toMatch(/2026-05-31/);
    expect(r.next_report_due_iso).toBe("2027-05-31");
  });

  it("tolerates NaN, negative, and non-numeric headcount inputs without throwing", () => {
    const r = assessWGEA(
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        current_headcount_au: Number.NaN as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        monthly_headcount_last_12_months: [Number.NaN, -5, "oops"] as any,
        has_previously_reported: false,
      },
      NOW,
    );
    expect(r.current_headcount_au).toBe(0);
    expect(r.peak_headcount_last_12_months).toBe(0);
    expect(r.action_required).toBe("not_required");
  });
});

describe("assessWGEAFromHeadcount — shortcut", () => {
  it("crosses the threshold when headcount ≥ 100", () => {
    const r = assessWGEAFromHeadcount(100);
    expect(r.action_required).toBe("report_required");
    expect(r.is_above_threshold).toBe(true);
  });

  it("stays under threshold when headcount < 80", () => {
    const r = assessWGEAFromHeadcount(50);
    expect(r.action_required).toBe("not_required");
  });

  it("honours a lodged report when passed through the shortcut", () => {
    const r = assessWGEAFromHeadcount(120, {
      has_previously_reported: true,
      last_report_lodged_at: "2026-05-15",
    });
    expect(r.action_required).toBe("already_reporting");
    expect(r.reasoning).toMatch(/2026-05-15/);
  });
});

describe("next_report_due_iso — deadline rolls to next year once past 31-May", () => {
  it("July 2026 lookup → next deadline is 2027-05-31", () => {
    const r = assessWGEA(
      { current_headcount_au: 200, has_previously_reported: false },
      new Date("2026-07-24T00:00:00Z"),
    );
    expect(r.next_report_due_iso).toBe("2027-05-31");
  });

  it("March 2026 lookup → next deadline is 2026-05-31 (same year)", () => {
    const r = assessWGEA(
      { current_headcount_au: 200, has_previously_reported: false },
      new Date("2026-03-01T00:00:00Z"),
    );
    expect(r.next_report_due_iso).toBe("2026-05-31");
  });
});

describe("constants", () => {
  it("pins WGEA statutory numbers", () => {
    expect(WGEA_HEADCOUNT_THRESHOLD).toBe(100);
    expect(WGEA_APPROACHING_HEADCOUNT).toBe(80);
    expect(WGEA_GRACE_PERIODS).toBe(2);
  });
});
