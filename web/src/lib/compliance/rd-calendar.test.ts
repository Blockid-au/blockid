// Pure-helper coverage for rd-calendar.ts. Contract: docs/plans/atlassian-standard-mapping-goal.md
// §1 phase 6 (R&D Tax Incentive AusIndustry registration deadline alert, P1
// spun off the P6 "no AusIndustry registration-deadline (10 months post-FY end)
// alert wired to compliance-calendar" gap).
//
// AusIndustry rule ref:
//   https://business.gov.au/grants-and-programs/research-and-development-tax-incentive
//   https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/incentives-and-concessions/research-and-development-tax-incentive
//
// Registration deadline = 10 months after end of the income year in which the
// R&D activities were conducted. Standard AU FY = 1 Jul → 30 Jun, so FY2024-25
// activities must be registered by 30 April 2026.

import { describe, it, expect } from "vitest";
import { buildRDCalendar, RD_DISCLAIMER } from "./rd-calendar";

describe("RD_DISCLAIMER", () => {
  it("is a non-empty AFSL-safe disclaimer citing the registered tax agent boundary", () => {
    expect(RD_DISCLAIMER).toMatch(/Not tax advice/i);
    expect(RD_DISCLAIMER).toMatch(/registered tax agent/i);
  });
});

describe("buildRDCalendar — shape + FY window", () => {
  it("returns priorFyCount + 1 rows (default: current + 3 prior = 4) sorted current-first", () => {
    const rows = buildRDCalendar({ now: new Date("2026-03-15T00:00:00Z") });
    expect(rows).toHaveLength(4);
    // current FY when 2026-03-15 → FY start year = 2025 (Jul 2025 – Jun 2026)
    expect(rows[0].fy_label).toBe("FY 2025-26");
    expect(rows[1].fy_label).toBe("FY 2024-25");
    expect(rows[2].fy_label).toBe("FY 2023-24");
    expect(rows[3].fy_label).toBe("FY 2022-23");
  });

  it("honours priorFyCount override (0 → single current-FY row)", () => {
    const rows = buildRDCalendar({
      now: new Date("2026-03-15T00:00:00Z"),
      priorFyCount: 0,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].fy_label).toBe("FY 2025-26");
  });

  it("flips FY window at 1 July: 30 June is still last FY, 1 July starts the new FY", () => {
    const june = buildRDCalendar({
      now: new Date("2026-06-30T00:00:00Z"),
      priorFyCount: 0,
    });
    expect(june[0].fy_label).toBe("FY 2025-26");

    const july = buildRDCalendar({
      now: new Date("2026-07-01T00:00:00Z"),
      priorFyCount: 0,
    });
    expect(july[0].fy_label).toBe("FY 2026-27");
  });

  it("pins activity_start / activity_end to the canonical 1 Jul – 30 Jun window", () => {
    const rows = buildRDCalendar({
      now: new Date("2026-03-15T00:00:00Z"),
      priorFyCount: 1,
    });
    const fy2425 = rows.find((r) => r.fy_label === "FY 2024-25")!;
    expect(fy2425.activity_start).toBe("2024-07-01");
    expect(fy2425.activity_end).toBe("2025-06-30");
  });

  it("computes registration_deadline as activity_end + 10 months (FY 2024-25 → 2026-04-30)", () => {
    const rows = buildRDCalendar({
      now: new Date("2026-03-15T00:00:00Z"),
      priorFyCount: 1,
    });
    const fy2425 = rows.find((r) => r.fy_label === "FY 2024-25")!;
    // 30 June 2025 + 10 months = 30 April 2026 (per business.gov.au R&DTI page)
    expect(fy2425.registration_deadline).toBe("2026-04-30");
  });
});

describe("buildRDCalendar — status classification (unregistered path)", () => {
  it("marks a still-in-progress FY as 'future' when activity_end is after now", () => {
    // Current FY (2025-26): activity ends 30 June 2026; on 2026-03-15 it's future.
    const rows = buildRDCalendar({
      now: new Date("2026-03-15T00:00:00Z"),
      priorFyCount: 0,
    });
    expect(rows[0].status).toBe("future");
    expect(rows[0].note).toMatch(/contemporaneous documentation/i);
  });

  it("marks 'last_call' when 30 days or fewer remain (FY 2024-25 on 2026-04-15 → 15 days left)", () => {
    const rows = buildRDCalendar({
      now: new Date("2026-04-15T00:00:00Z"),
      priorFyCount: 1,
    });
    const fy2425 = rows.find((r) => r.fy_label === "FY 2024-25")!;
    expect(fy2425.status).toBe("last_call");
    expect(fy2425.days_until_deadline).toBeGreaterThan(0);
    expect(fy2425.days_until_deadline).toBeLessThanOrEqual(30);
    expect(fy2425.note).toMatch(/Form ATO47|lodge NOW/i);
  });

  it("marks 'closing_soon' when 31–60 days remain (FY 2024-25 on 2026-03-15 → 46 days)", () => {
    const rows = buildRDCalendar({
      now: new Date("2026-03-15T00:00:00Z"),
      priorFyCount: 1,
    });
    const fy2425 = rows.find((r) => r.fy_label === "FY 2024-25")!;
    expect(fy2425.status).toBe("closing_soon");
    expect(fy2425.days_until_deadline).toBeGreaterThan(30);
    expect(fy2425.days_until_deadline).toBeLessThanOrEqual(60);
    expect(fy2425.note).toMatch(/R&D advisor/i);
  });

  it("marks 'open' when >60 days remain (FY 2024-25 on 2026-01-15 → ~105 days)", () => {
    const rows = buildRDCalendar({
      now: new Date("2026-01-15T00:00:00Z"),
      priorFyCount: 1,
    });
    const fy2425 = rows.find((r) => r.fy_label === "FY 2024-25")!;
    expect(fy2425.status).toBe("open");
    expect(fy2425.days_until_deadline).toBeGreaterThan(60);
    expect(fy2425.note).toMatch(/plenty of runway/i);
  });

  it("marks 'overdue' when the deadline has passed and quotes the days-late count + s 27J extension pointer", () => {
    // FY 2023-24 activity_end = 2024-06-30, deadline = 2025-04-30. On 2026-03-15 → 319 days overdue.
    const rows = buildRDCalendar({
      now: new Date("2026-03-15T00:00:00Z"),
      priorFyCount: 3,
    });
    const fy2324 = rows.find((r) => r.fy_label === "FY 2023-24")!;
    expect(fy2324.status).toBe("overdue");
    expect(fy2324.days_until_deadline).toBeLessThan(0);
    expect(fy2324.note).toMatch(/CLOSED/);
    expect(fy2324.note).toMatch(/s 27J|extension of time/i);
    // Absolute days-late count must appear in the copy verbatim.
    expect(fy2324.note).toMatch(
      new RegExp(String(Math.abs(fy2324.days_until_deadline))),
    );
  });
});

describe("buildRDCalendar — registration state override", () => {
  it("collapses to status 'open' with the 'file R&D schedule' note when registration_status='registered'", () => {
    // Same clock as the overdue case — registration override must trump the overdue branch.
    const rows = buildRDCalendar({
      now: new Date("2026-03-15T00:00:00Z"),
      priorFyCount: 3,
      registrations: [
        {
          fy_label: "FY 2023-24",
          registration_status: "registered",
          registration_date: "2024-11-01",
        },
      ],
    });
    const fy2324 = rows.find((r) => r.fy_label === "FY 2023-24")!;
    expect(fy2324.status).toBe("open");
    expect(fy2324.registration_status).toBe("registered");
    expect(fy2324.registration_date).toBe("2024-11-01");
    expect(fy2324.note).toMatch(/company tax return/i);
  });

  it("defaults every un-flagged FY to registration_status='not_registered' with registration_date=null", () => {
    const rows = buildRDCalendar({
      now: new Date("2026-03-15T00:00:00Z"),
      priorFyCount: 1,
    });
    for (const r of rows) {
      expect(r.registration_status).toBe("not_registered");
      expect(r.registration_date).toBeNull();
    }
  });

  it("does NOT flip an unrelated FY when only one FY row is flagged registered", () => {
    const rows = buildRDCalendar({
      now: new Date("2026-03-15T00:00:00Z"),
      priorFyCount: 3,
      registrations: [
        { fy_label: "FY 2023-24", registration_status: "registered" },
      ],
    });
    const fy2223 = rows.find((r) => r.fy_label === "FY 2022-23")!;
    // FY 2022-23 deadline = 2024-04-30 → still overdue on 2026-03-15.
    expect(fy2223.status).toBe("overdue");
    expect(fy2223.registration_status).toBe("not_registered");
  });
});
