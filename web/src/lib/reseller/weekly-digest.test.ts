import { describe, expect, it } from "vitest";
import type { LeadingSignalSummary } from "./leading-signals";
import {
  formatWeeklyDigestCsv,
  formatWeeklyDigestEmail,
  isoWeekKey,
  type WeeklyDigestRow,
} from "./weekly-digest";

function summary(overrides: Partial<LeadingSignalSummary> = {}): LeadingSignalSummary {
  return {
    attributed_total: { count: 10, suppressed: false },
    inactive_7d: { count: 3, suppressed: false },
    inactive_30d: { count: 1, suppressed: false },
    never_generated_report: { count: 4, suppressed: false },
    activated_first_report: { count: 6, suppressed: false },
    median_days_to_first_report: 5,
    activated_first_report_pct: 60,
    ...overrides,
  };
}

function row(
  reseller_code: string,
  display: string,
  s: LeadingSignalSummary,
): WeeklyDigestRow {
  return {
    reseller_id: `rid-${reseller_code.toLowerCase()}`,
    reseller_code,
    reseller_display_name: display,
    summary: s,
  };
}

describe("isoWeekKey", () => {
  it("returns YYYY-Www with two-digit padding", () => {
    expect(isoWeekKey(new Date("2026-01-05T00:00:00Z"))).toBe("2026-W02");
    expect(isoWeekKey(new Date("2026-07-22T00:00:00Z"))).toBe("2026-W30");
  });

  it("year-boundary week rolls into the ISO year the Thursday falls in", () => {
    // 2026-01-01 is a Thursday → ISO week 01 of 2026.
    expect(isoWeekKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    // 2027-01-01 is a Friday → ISO week 53 of 2026.
    expect(isoWeekKey(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });
});

describe("formatWeeklyDigestCsv", () => {
  it("emits a header row and sorts by reseller_code", () => {
    const csv = formatWeeklyDigestCsv("2026-W30", [
      row("ZULU", "Zulu Advisors", summary()),
      row("ALPHA", "Alpha Advisors", summary({ attributed_total: { count: 20, suppressed: false } })),
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "week,reseller_id,reseller_code,reseller_display_name,attributed_total,inactive_7d,inactive_30d,never_generated_report,activated_first_report,activated_first_report_pct,median_days_to_first_report",
    );
    expect(lines[1]).toContain("ALPHA");
    expect(lines[2]).toContain("ZULU");
  });

  it("renders suppressed buckets as <5 and null derived fields as empty", () => {
    const csv = formatWeeklyDigestCsv("2026-W30", [
      row(
        "TINY",
        "Tiny Reseller",
        summary({
          attributed_total: { count: null, suppressed: true },
          inactive_7d: { count: null, suppressed: true },
          median_days_to_first_report: null,
          activated_first_report_pct: null,
        }),
      ),
    ]);
    const line = csv.trim().split("\n")[1];
    // week,reseller_id,reseller_code,reseller_display_name,attributed_total,inactive_7d,inactive_30d,never_generated_report,activated_first_report,activated_first_report_pct,median_days_to_first_report
    const cells = line.split(",");
    expect(cells[4]).toBe("<5");
    expect(cells[5]).toBe("<5");
    expect(cells[9]).toBe(""); // activated_first_report_pct null
    expect(cells[10]).toBe(""); // median null
  });

  it("escapes commas + quotes in display names", () => {
    const csv = formatWeeklyDigestCsv("2026-W30", [
      row("ACME", 'Acme, "Inc"', summary()),
    ]);
    expect(csv).toContain('"Acme, ""Inc"""');
  });
});

describe("formatWeeklyDigestEmail", () => {
  it("returns an empty-state paragraph when no rows", () => {
    const html = formatWeeklyDigestEmail("2026-W30", []);
    expect(html).toContain("No active resellers");
  });

  it("renders a row per reseller with suppression + null markers", () => {
    const html = formatWeeklyDigestEmail("2026-W30", [
      row(
        "TINY",
        "Tiny <Reseller>",
        summary({
          attributed_total: { count: null, suppressed: true },
          median_days_to_first_report: null,
          activated_first_report_pct: null,
        }),
      ),
    ]);
    expect(html).toContain("&lt;Reseller&gt;"); // HTML-escaped display name
    expect(html).toContain("&lt;5"); // suppressed bucket rendered
    expect(html).toContain("—"); // null derived fields
  });

  it("sorts rows by reseller_code", () => {
    const html = formatWeeklyDigestEmail("2026-W30", [
      row("ZULU", "Zulu", summary()),
      row("ALPHA", "Alpha", summary()),
    ]);
    expect(html.indexOf("ALPHA")).toBeLessThan(html.indexOf("ZULU"));
  });
});
