// Colocated tests for the deadline ladder (T0244, D-4). Pins the RDStatus
// thresholds (overdue < 0 · last_call ≤ 30 · closing_soon ≤ 60 · open),
// the future / rolling / paused / closed branches, non-blank labels, and
// AEST vs AWST date rendering.

import { describe, expect, it } from "vitest";
import { DEADLINE_LABELS, DEADLINE_TONE, daysUntil, deadlineStatus, formatDateAu, formatDateTimeAu, timeZoneForState } from "./deadline-status";

const TODAY = new Date(Date.UTC(2026, 8, 10)); // 10 Sep 2026

describe("deadlineStatus", () => {
  it("walks the ladder by days to close", () => {
    expect(deadlineStatus({ closes_at: "2026-09-01" }, TODAY).status).toBe("overdue");
    expect(deadlineStatus({ closes_at: "2026-09-10" }, TODAY)).toMatchObject({ status: "last_call", days_until: 0 });
    expect(deadlineStatus({ closes_at: "2026-10-05" }, TODAY)).toMatchObject({ status: "last_call", days_until: 25 });
    expect(deadlineStatus({ closes_at: "2026-11-01" }, TODAY)).toMatchObject({ status: "closing_soon", days_until: 52 });
    expect(deadlineStatus({ closes_at: "2026-11-30" }, TODAY)).toMatchObject({ status: "open", days_until: 81 });
  });

  it("is future while the window has not opened, rolling when there is no close date", () => {
    expect(deadlineStatus({ opens_at: "2026-10-01", closes_at: "2026-12-01" }, TODAY)).toMatchObject({ status: "future", days_until: 21 });
    expect(deadlineStatus({ rolling: true }, TODAY)).toMatchObject({ status: "open", days_until: null });
    expect(deadlineStatus({ rolling: true }, TODAY).label).toBe("Rolling — apply any time");
    expect(deadlineStatus({ catalogue_status: "upcoming" }, TODAY).status).toBe("future");
  });

  it("short-circuits closed / paused catalogue rows", () => {
    expect(deadlineStatus({ catalogue_status: "closed", closes_at: "2027-01-01" }, TODAY).status).toBe("overdue");
    expect(deadlineStatus({ catalogue_status: "paused" }, TODAY).status).toBe("future");
  });

  it("treats a month-only close as the last day of that month and never returns a blank label", () => {
    const v = deadlineStatus({ closes_at: "2026-10" }, TODAY);
    expect(v.days_until).toBe(daysUntil("2026-10-31", TODAY));
    for (const win of [{}, { closes_at: "junk" }, { opens_at: "2030-01-01" }, { closes_at: "2020-01-01" }]) {
      expect(deadlineStatus(win, TODAY).label.length).toBeGreaterThan(0);
    }
  });

  it("has a label and a tone for every rung", () => {
    for (const rung of ["future", "open", "closing_soon", "last_call", "overdue"] as const) {
      expect(DEADLINE_LABELS[rung]).toBeTruthy();
      expect(DEADLINE_TONE[rung]).toMatch(/text-/);
    }
  });
});

describe("formatDateAu", () => {
  it("renders AEST by default and AWST for WA, never blank", () => {
    expect(formatDateAu("2026-11-30", "NSW")).toBe("30 Nov 2026 (AEST)");
    expect(formatDateAu("2026-11-30", "WA")).toBe("30 Nov 2026 (AWST)");
    expect(formatDateAu("2026-11-30", "WA", { withZone: false })).toBe("30 Nov 2026");
    expect(formatDateAu("2026-11", "VIC")).toBe("Nov 2026");
    expect(formatDateAu(null)).toBe("Date to be confirmed");
    expect(formatDateAu("Q3 intake")).toBe("Q3 intake");
  });

  it("stamps a generated-at time in the founder's zone", () => {
    expect(formatDateTimeAu("2026-09-10T00:00:00Z", "NSW")).toMatch(/10 Sep 2026.*10:00 AEST/);
    expect(formatDateTimeAu("2026-09-10T00:00:00Z", "WA")).toMatch(/08:00 AWST/);
    expect(timeZoneForState("QLD").tz).toBe("Australia/Brisbane");
  });
});
