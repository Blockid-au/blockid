// AU compliance calendar (.ics) coverage — P1k in
// docs/plans/atlassian-standard-mapping-goal.md.
//
// Anchors the four contract claims of the module:
//   1. BAS quarterly generation gated by gst_registered
//   2. ASIC annual review anchored on ACN registration anniversary
//   3. R&D deadlines are skipped when registered / not_applicable /
//      overdue, and emitted for the "not_registered" happy path
//   4. renderIcs() emits an RFC 5545-shaped calendar with 14-day
//      VALARMs and CRLF line endings

import { describe, it, expect } from "vitest";
import {
  buildComplianceCalendar,
  renderIcs,
  CALENDAR_DISCLAIMER,
  CALENDAR_PRODID,
} from "./calendar";
import type { RDCalendarEntry } from "./rd-calendar";
import type { WGEAResult } from "./wgea-threshold";
import { WGEA_DISCLAIMER } from "./wgea-threshold";
import type { ModernSlaveryResult } from "./modern-slavery-threshold";
import { MODERN_SLAVERY_DISCLAIMER } from "./modern-slavery-threshold";

// A safe anchor: 2026-07-24 (today per session context). Standard AU FY
// that started on 2026-07-01, so the current FY is FY 2026-27 and Q1 is
// due 2026-10-28.
const NOW = new Date("2026-07-24T00:00:00Z");

function rdEntry(overrides: Partial<RDCalendarEntry>): RDCalendarEntry {
  return {
    fy_label: "FY 2025-26",
    activity_start: "2025-07-01",
    activity_end: "2026-06-30",
    registration_deadline: "2027-04-30",
    days_until_deadline: 280,
    status: "open",
    registration_status: "not_registered",
    registration_date: null,
    note: "test",
    ...overrides,
  };
}

describe("buildComplianceCalendar — BAS quarterly gating", () => {
  it("emits no BAS events when gst_registered is false", () => {
    const events = buildComplianceCalendar({ now: NOW, gstRegistered: false });
    expect(events.filter((e) => e.kind === "bas_quarter")).toHaveLength(0);
  });

  it("emits BAS Q1 FY 2026-27 due 2026-10-28 when gst_registered is true", () => {
    const events = buildComplianceCalendar({ now: NOW, gstRegistered: true });
    const q1 = events.find(
      (e) => e.kind === "bas_quarter" && e.summary.includes("Q1 FY 2026-27"),
    );
    expect(q1).toBeDefined();
    expect(q1!.date_start).toBe("2026-10-28");
    expect(q1!.date_end).toBe("2026-10-29");
    expect(q1!.reminder_lead_days).toBe(14);
    expect(q1!.uid).toBe("bas-fy2026-27-q1@blockid.au");
    expect(q1!.description).toMatch(/Business Activity Statement/);
    expect(q1!.description).toMatch(/Jul-Sep/);
  });

  it("emits BAS Q2 FY 2026-27 due 2027-02-28 (rolls into next calendar year)", () => {
    const events = buildComplianceCalendar({ now: NOW, gstRegistered: true });
    const q2 = events.find(
      (e) => e.kind === "bas_quarter" && e.summary.includes("Q2 FY 2026-27"),
    );
    expect(q2).toBeDefined();
    expect(q2!.date_start).toBe("2027-02-28");
  });

  it("respects the 12-month horizon (no events past 2027-07-24)", () => {
    const events = buildComplianceCalendar({ now: NOW, gstRegistered: true });
    for (const e of events) {
      expect(e.date_start < "2027-07-24").toBe(true);
    }
  });
});

describe("buildComplianceCalendar — ASIC annual review", () => {
  it("emits no ASIC events when acnRegistrationDate is absent", () => {
    const events = buildComplianceCalendar({ now: NOW });
    expect(events.filter((e) => e.kind === "asic_annual_review")).toHaveLength(0);
  });

  it("emits the next anniversary of the ACN registration date", () => {
    // ACN 659 615 111 was registered 2022-08-04 (real business_entity data).
    const events = buildComplianceCalendar({
      now: NOW,
      acnRegistrationDate: "2022-08-04",
    });
    const asic = events.filter((e) => e.kind === "asic_annual_review");
    expect(asic.length).toBeGreaterThanOrEqual(1);
    expect(asic[0].date_start).toBe("2026-08-04");
    expect(asic[0].summary).toBe("ASIC annual company review — 2026");
    expect(asic[0].description).toMatch(/s 345A Corporations Act/);
  });

  it("gracefully skips ASIC events when the registration date is unparseable", () => {
    const events = buildComplianceCalendar({
      now: NOW,
      acnRegistrationDate: "not-a-date",
    });
    expect(events.filter((e) => e.kind === "asic_annual_review")).toHaveLength(0);
  });
});

describe("buildComplianceCalendar — R&D registration deadlines", () => {
  it("skips FYs already marked registered", () => {
    const events = buildComplianceCalendar({
      now: NOW,
      rdCalendar: [rdEntry({ registration_status: "registered" })],
    });
    expect(events.filter((e) => e.kind === "rd_registration")).toHaveLength(0);
  });

  it("skips FYs marked not_applicable", () => {
    const events = buildComplianceCalendar({
      now: NOW,
      rdCalendar: [rdEntry({ registration_status: "not_applicable" })],
    });
    expect(events.filter((e) => e.kind === "rd_registration")).toHaveLength(0);
  });

  it("skips overdue rows so the .ics never shows a past deadline", () => {
    const events = buildComplianceCalendar({
      now: NOW,
      rdCalendar: [
        rdEntry({
          fy_label: "FY 2023-24",
          registration_deadline: "2025-04-30",
          days_until_deadline: -450,
          status: "overdue",
        }),
      ],
    });
    expect(events.filter((e) => e.kind === "rd_registration")).toHaveLength(0);
  });

  it("emits an event for the upcoming FY 2025-26 deadline (2027-04-30)", () => {
    const events = buildComplianceCalendar({
      now: NOW,
      rdCalendar: [rdEntry({})],
    });
    const rd = events.find((e) => e.kind === "rd_registration");
    expect(rd).toBeDefined();
    expect(rd!.date_start).toBe("2027-04-30");
    expect(rd!.summary).toMatch(/FY 2025-26/);
    expect(rd!.uid).toBe("rd-registration-fy2025-26@blockid.au");
    expect(rd!.description).toMatch(/IR&D Act 1986 s 27A/);
  });
});

function wgeaResult(overrides: Partial<WGEAResult> = {}): WGEAResult {
  return {
    current_headcount_au: 120,
    peak_headcount_last_12_months: 120,
    threshold_headcount: 100,
    is_relevant_employer: true,
    is_above_threshold: true,
    next_report_due_iso: "2027-05-31",
    action_required: "report_required",
    urgency: "critical",
    reasoning: "test",
    disclaimer: WGEA_DISCLAIMER,
    ...overrides,
  };
}

function msResult(overrides: Partial<ModernSlaveryResult> = {}): ModernSlaveryResult {
  return {
    current_period_revenue_aud: 120_000_000,
    projected_full_period_revenue_aud: 120_000_000,
    last_full_period_revenue_aud: 120_000_000,
    threshold_aud: 100_000_000,
    is_reporting_entity: true,
    is_above_threshold: true,
    statement_due_iso: "2026-12-31",
    days_until_statement_due: 160,
    action_required: "statement_due_soon",
    urgency: "critical",
    reasoning: "test",
    disclaimer: MODERN_SLAVERY_DISCLAIMER,
    ...overrides,
  };
}

describe("buildComplianceCalendar — WGEA report deadline", () => {
  it("emits no WGEA events when the wgea option is absent", () => {
    const events = buildComplianceCalendar({ now: NOW });
    expect(events.filter((e) => e.kind === "wgea_report")).toHaveLength(0);
  });

  it("emits no WGEA events when the employer is not a relevant employer", () => {
    const events = buildComplianceCalendar({
      now: NOW,
      wgea: wgeaResult({
        is_relevant_employer: false,
        is_above_threshold: false,
        current_headcount_au: 20,
        peak_headcount_last_12_months: 20,
        next_report_due_iso: undefined,
      }),
    });
    expect(events.filter((e) => e.kind === "wgea_report")).toHaveLength(0);
  });

  it("emits a wgea_report event on next_report_due_iso for a relevant employer", () => {
    const events = buildComplianceCalendar({
      now: NOW,
      wgea: wgeaResult({ next_report_due_iso: "2027-05-31" }),
    });
    const wgea = events.find((e) => e.kind === "wgea_report");
    expect(wgea).toBeDefined();
    expect(wgea!.date_start).toBe("2027-05-31");
    expect(wgea!.date_end).toBe("2027-06-01");
    expect(wgea!.uid).toBe("wgea-report-2027@blockid.au");
    expect(wgea!.summary).toMatch(/WGEA public report 2027/);
    expect(wgea!.description).toMatch(/Workplace Gender Equality Act 2012/);
    expect(wgea!.reminder_lead_days).toBe(14);
  });

  it("respects the 12-month horizon (skips WGEA events past horizon)", () => {
    const events = buildComplianceCalendar({
      now: NOW,
      horizonMonths: 6,
      wgea: wgeaResult({ next_report_due_iso: "2028-05-31" }),
    });
    expect(events.filter((e) => e.kind === "wgea_report")).toHaveLength(0);
  });
});

describe("buildComplianceCalendar — Modern Slavery statement deadline", () => {
  it("emits no MSA events when the modernSlavery option is absent", () => {
    const events = buildComplianceCalendar({ now: NOW });
    expect(events.filter((e) => e.kind === "modern_slavery_statement")).toHaveLength(0);
  });

  it("emits no MSA events when the entity is not a reporting entity", () => {
    const events = buildComplianceCalendar({
      now: NOW,
      modernSlavery: msResult({
        is_reporting_entity: false,
        is_above_threshold: false,
        statement_due_iso: undefined,
      }),
    });
    expect(events.filter((e) => e.kind === "modern_slavery_statement")).toHaveLength(0);
  });

  it("emits a modern_slavery_statement event on statement_due_iso for a reporting entity", () => {
    const events = buildComplianceCalendar({
      now: NOW,
      modernSlavery: msResult({ statement_due_iso: "2026-12-31" }),
    });
    const ms = events.find((e) => e.kind === "modern_slavery_statement");
    expect(ms).toBeDefined();
    expect(ms!.date_start).toBe("2026-12-31");
    expect(ms!.date_end).toBe("2027-01-01");
    expect(ms!.uid).toBe("modern-slavery-statement-2026@blockid.au");
    expect(ms!.summary).toMatch(/Modern Slavery statement 2026/);
    expect(ms!.description).toMatch(/Modern Slavery Act 2018/);
    expect(ms!.description).toMatch(/s13\(2\)/);
    expect(ms!.reminder_lead_days).toBe(14);
  });

  it("respects the 12-month horizon (skips MSA events past horizon)", () => {
    const events = buildComplianceCalendar({
      now: NOW,
      horizonMonths: 3,
      modernSlavery: msResult({ statement_due_iso: "2027-12-31" }),
    });
    expect(events.filter((e) => e.kind === "modern_slavery_statement")).toHaveLength(0);
  });
});

describe("renderIcs — RFC 5545 shape", () => {
  it("emits a well-formed VCALENDAR with the fixed PRODID + disclaimer", () => {
    const events = buildComplianceCalendar({
      now: NOW,
      gstRegistered: true,
      acnRegistrationDate: "2022-08-04",
      rdCalendar: [rdEntry({})],
    });
    const ics = renderIcs(events, { now: NOW });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain(`PRODID:${CALENDAR_PRODID}`);
    // Disclaimer is present + comma-escaped per RFC 5545 §3.3.11.
    // Line folding may split the value across CRLF-space boundaries,
    // so we assert the header keyword + escaped fragment separately.
    expect(ics).toMatch(/X-WR-CALDESC:/);
    expect(ics).toContain("Not tax or legal advice");
    // Original disclaimer text has commas; folded ICS must escape them.
    expect(CALENDAR_DISCLAIMER).toContain(",");
    expect(ics).not.toContain("BAS due dates assume standard 1-July-to-30-June FY,");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    // Line endings must be CRLF.
    expect(ics.split("\r\n").length).toBeGreaterThan(events.length * 8);
    expect(ics.includes("\n\n")).toBe(false);
  });

  it("attaches a 14-day DISPLAY VALARM to every event", () => {
    const events = buildComplianceCalendar({ now: NOW, gstRegistered: true });
    const ics = renderIcs(events, { now: NOW });
    const alarmCount = ics.match(/BEGIN:VALARM/g)?.length ?? 0;
    expect(alarmCount).toBe(events.length);
    expect(ics).toContain("TRIGGER:-P14D");
    expect(ics).toContain("ACTION:DISPLAY");
  });

  it("uses stable, deterministic UIDs so re-subscribes don't duplicate events", () => {
    const first = buildComplianceCalendar({ now: NOW, gstRegistered: true });
    const second = buildComplianceCalendar({ now: NOW, gstRegistered: true });
    expect(first.map((e) => e.uid)).toEqual(second.map((e) => e.uid));
  });
});
