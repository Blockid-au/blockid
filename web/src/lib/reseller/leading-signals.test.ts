import { describe, expect, it } from "vitest";
import {
  buildLeadingSignalSummary,
  computeCustomerSignals,
  type AttributedCustomerRow,
  type AttributedReportRow,
} from "./leading-signals";

const NOW = new Date("2026-07-22T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function isoAgo(days: number, from: Date = NOW): string {
  return new Date(from.getTime() - days * DAY_MS).toISOString();
}

function makeCustomer(id: string, signupDaysAgo: number, lastLoginDaysAgo: number | null): AttributedCustomerRow {
  return {
    id,
    created_at: isoAgo(signupDaysAgo),
    last_login_at: lastLoginDaysAgo === null ? null : isoAgo(lastLoginDaysAgo),
  };
}

function makeReport(userId: string, generatedDaysAgo: number): AttributedReportRow {
  return { user_id: userId, generated_at: isoAgo(generatedDaysAgo) };
}

describe("computeCustomerSignals", () => {
  it("returns days_since_last_login as a floor of full days", () => {
    const [s] = computeCustomerSignals({
      customers: [makeCustomer("u1", 100, 3)],
      reports: [],
      now: NOW,
    });
    expect(s.days_since_last_login).toBe(3);
    expect(s.seven_day_inactive).toBe(false);
    expect(s.thirty_day_inactive).toBe(false);
  });

  it("treats null last_login as inactive for both 7d and 30d windows", () => {
    const [s] = computeCustomerSignals({
      customers: [makeCustomer("u1", 40, null)],
      reports: [],
      now: NOW,
    });
    expect(s.days_since_last_login).toBeNull();
    expect(s.seven_day_inactive).toBe(true);
    expect(s.thirty_day_inactive).toBe(true);
  });

  it("captures first_report_generated_at across multiple reports", () => {
    const [s] = computeCustomerSignals({
      customers: [makeCustomer("u1", 20, 2)],
      reports: [
        makeReport("u1", 5),
        makeReport("u1", 15), // earliest
        makeReport("u1", 8),
      ],
      now: NOW,
    });
    expect(s.first_report_generated_at).toBe(isoAgo(15));
    expect(s.days_to_first_report).toBe(5); // 20 - 15
  });

  it("returns null first_report fields when the customer has no report", () => {
    const [s] = computeCustomerSignals({
      customers: [makeCustomer("u1", 20, 2)],
      reports: [makeReport("someone_else", 5)],
      now: NOW,
    });
    expect(s.first_report_generated_at).toBeNull();
    expect(s.days_to_first_report).toBeNull();
  });

  it("silently drops reports with unparseable timestamps", () => {
    const [s] = computeCustomerSignals({
      customers: [makeCustomer("u1", 20, 2)],
      reports: [
        { user_id: "u1", generated_at: "not-a-date" },
        makeReport("u1", 10),
      ],
      now: NOW,
    });
    expect(s.first_report_generated_at).toBe(isoAgo(10));
  });

  it("flags 7-day inactive at the boundary (exactly 7 days)", () => {
    const [s] = computeCustomerSignals({
      customers: [makeCustomer("u1", 100, 7)],
      reports: [],
      now: NOW,
    });
    expect(s.days_since_last_login).toBe(7);
    expect(s.seven_day_inactive).toBe(true);
    expect(s.thirty_day_inactive).toBe(false);
  });
});

describe("buildLeadingSignalSummary", () => {
  it("suppresses every counter when attributed_total is below k", () => {
    const summary = buildLeadingSignalSummary({
      customers: [
        makeCustomer("u1", 30, 1),
        makeCustomer("u2", 30, 40),
      ],
      reports: [makeReport("u1", 20)],
      now: NOW,
    });
    expect(summary.attributed_total).toEqual({ count: null, suppressed: true });
    expect(summary.inactive_7d.suppressed).toBe(true);
    expect(summary.inactive_30d.suppressed).toBe(true);
    expect(summary.never_generated_report.suppressed).toBe(true);
    expect(summary.activated_first_report.suppressed).toBe(true);
    expect(summary.median_days_to_first_report).toBeNull();
    expect(summary.activated_first_report_pct).toBeNull();
  });

  it("rolls up a mixed portfolio into visible counters and a median", () => {
    const customers = [
      // 5 active-with-report so activated_first_report clears k=5
      makeCustomer("u1", 60, 1),
      makeCustomer("u2", 60, 2),
      makeCustomer("u3", 60, 3),
      makeCustomer("u4", 60, 4),
      makeCustomer("u5", 60, 6),
      // 5 7d-inactive (mix of 30d + never-logged-in) so inactive_7d clears k
      makeCustomer("u6", 60, 20),
      makeCustomer("u7", 60, 45),
      makeCustomer("u8", 60, null),
      makeCustomer("u9", 60, 60),
      makeCustomer("u10", 60, 8),
    ];
    // First-report days_to_first_report: 5, 10, 15, 20, 25 → median = 15
    const reports = [
      makeReport("u1", 55), // 60-55 = 5
      makeReport("u2", 50), // 10
      makeReport("u3", 45), // 15
      makeReport("u4", 40), // 20
      makeReport("u5", 35), // 25
    ];
    const summary = buildLeadingSignalSummary({ customers, reports, now: NOW });
    expect(summary.attributed_total).toEqual({ count: 10, suppressed: false });
    expect(summary.inactive_7d).toEqual({ count: 5, suppressed: false });
    // 30d inactive raw count = 3 (u7/u8/u9), 3 < k(5) → suppressed to null
    expect(summary.inactive_30d).toEqual({ count: null, suppressed: true });
    expect(summary.never_generated_report.count).toBe(5);
    expect(summary.activated_first_report.count).toBe(5);
    expect(summary.median_days_to_first_report).toBe(15);
    expect(summary.activated_first_report_pct).toBe(50); // 5/10 * 100
  });

  it("suppresses the median when fewer than k customers have any report", () => {
    // 10 customers, but only 4 have a report → median suppressed since 4 < k(5)
    const customers = Array.from({ length: 10 }, (_, i) => makeCustomer(`u${i}`, 30, 2));
    const reports = [
      makeReport("u0", 25),
      makeReport("u1", 20),
      makeReport("u2", 15),
      makeReport("u3", 10),
    ];
    const summary = buildLeadingSignalSummary({ customers, reports, now: NOW });
    expect(summary.attributed_total.count).toBe(10);
    expect(summary.median_days_to_first_report).toBeNull();
    expect(summary.activated_first_report_pct).toBe(40);
  });

  it("computes even-length medians as the mean of the two middle values", () => {
    // 6 customers, all with reports at days_to_first_report of 4, 6, 8, 10, 12, 14
    // sorted → middle two are 8 and 10 → median = 9
    const customers = Array.from({ length: 6 }, (_, i) => makeCustomer(`u${i}`, 30, 1));
    const reports = [
      makeReport("u0", 26), // 4
      makeReport("u1", 24), // 6
      makeReport("u2", 22), // 8
      makeReport("u3", 20), // 10
      makeReport("u4", 18), // 12
      makeReport("u5", 16), // 14
    ];
    const summary = buildLeadingSignalSummary({ customers, reports, now: NOW });
    expect(summary.median_days_to_first_report).toBe(9);
  });

  it("respects a custom k threshold", () => {
    const customers = [makeCustomer("u1", 30, 1), makeCustomer("u2", 30, 20)];
    const summary = buildLeadingSignalSummary({
      customers,
      reports: [],
      now: NOW,
      k: 1,
    });
    expect(summary.attributed_total.count).toBe(2);
    expect(summary.inactive_7d.count).toBe(1);
    expect(summary.activated_first_report_pct).toBe(0);
  });
});
