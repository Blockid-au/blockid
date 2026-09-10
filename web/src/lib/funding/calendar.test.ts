// Colocated vitest for the Money Radar ICS builder (T0245).
// Pins: one VEVENT per dated match (grant close / program intake / event
// day) with 30/14/3-day VALARMs, rolling + past + beyond-horizon rows
// skipped, stable UIDs, and a VCALENDAR that parses block-by-block.

import { describe, expect, it } from "vitest";
import { escapeIcsText, renderIcs } from "@/lib/compliance/calendar";
import {
  FUNDING_CALENDAR_NAME,
  FUNDING_CALENDAR_PRODID,
  FUNDING_REMINDER_LEAD_DAYS,
  buildFundingCalendar,
  fundingEventUid,
  type FundingCalendarRow,
} from "./calendar";

const NOW = new Date("2026-09-13T05:00:00Z");

function row(over: Partial<FundingCalendarRow> = {}): FundingCalendarRow {
  return {
    ref_kind: "grant",
    ref_id: "mvp_ventures",
    closes_at: "2026-10-03",
    score: 82,
    status_at_match: "open",
    name: "MVP Ventures",
    official_url: "https://www.investment.nsw.gov.au/mvp",
    amount_max_aud: 200000,
    summary: "Up to A$200k matched, NSW pre-revenue.",
    startup: "Acme",
    ...over,
  };
}

describe("buildFundingCalendar", () => {
  it("emits a dated grant, a program intake and an event with the right wording and 30/14/3 alarms", () => {
    const events = buildFundingCalendar(
      [
        row(),
        row({ ref_kind: "program", ref_id: "startmate", name: "Startmate", program_type: "accelerator", closes_at: "2026-11-01", next_cohort_start: "2027-01-15", amount_max_aud: null }),
        row({ ref_kind: "program", ref_id: "west_tech_fest", name: "West Tech Fest", program_type: "event", closes_at: "2026-12-02", amount_max_aud: null }),
      ],
      { now: NOW },
    );
    expect(events.map((e) => e.summary)).toEqual([
      "Grant closes: MVP Ventures",
      "Applications close: Startmate",
      "Event: West Tech Fest",
    ]);
    expect(events[0]).toMatchObject({
      uid: "radar-grant-mvp_ventures-2026-10-03@blockid.au",
      date_start: "2026-10-03",
      reminder_lead_days: FUNDING_REMINDER_LEAD_DAYS,
      url: "https://www.investment.nsw.gov.au/mvp",
      category: "funding_deadline",
    });
    expect(events[0].description).toContain("Matched to Acme (score 82/100)");
    expect(events[0].description).toContain("Up to A$200,000");
    expect(events[1].description).toContain("Cohort starts 2027-01-15");
    expect(events[1].category).toBe("program_intake");
    expect(events[2].category).toBe("event");
  });

  it("skips rolling (null), past and beyond-horizon rows; dedupes identical uids; sorts by date", () => {
    const events = buildFundingCalendar(
      [
        row({ ref_id: "rolling", closes_at: null }),
        row({ ref_id: "past", closes_at: "2026-09-01" }),
        row({ ref_id: "far", closes_at: "2028-01-01" }),
        row({ ref_id: "b", closes_at: "2026-10-20" }),
        row({ ref_id: "a", closes_at: "2026-10-05" }),
        row({ ref_id: "a", closes_at: "2026-10-05" }),
      ],
      { now: NOW },
    );
    expect(events.map((e) => e.uid)).toEqual(["radar-grant-a-2026-10-05@blockid.au", "radar-grant-b-2026-10-20@blockid.au"]);
    expect(buildFundingCalendar([row({ ref_id: "past", closes_at: "2026-09-01" })], { now: NOW, includePast: true })).toHaveLength(1);
  });

  it("falls back to /funding when the row has no official URL and sanitises ids in the uid", () => {
    const [e] = buildFundingCalendar([row({ ref_id: "weird id/1", official_url: null })], { now: NOW });
    expect(e.url).toBe("https://blockid.au/funding");
    expect(e.uid).toBe("radar-grant-weird-id-1-2026-10-03@blockid.au");
    expect(fundingEventUid({ ref_kind: "program", ref_id: "x", closes_at: null })).toBe("radar-program-x-nodate@blockid.au");
  });

  it("renders through renderIcs as a valid VCALENDAR with three VALARMs per VEVENT", () => {
    const events = buildFundingCalendar([row(), row({ ref_kind: "program", ref_id: "p", name: "P", closes_at: "2026-10-10" })], { now: NOW });
    const ics = renderIcs(events, { now: NOW, calendarName: FUNDING_CALENDAR_NAME, prodId: FUNDING_CALENDAR_PRODID });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain(`PRODID:${FUNDING_CALENDAR_PRODID}`);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(6);
    expect(ics.match(/END:VALARM/g)).toHaveLength(6);
    for (const lead of FUNDING_REMINDER_LEAD_DAYS) expect(ics).toContain(`TRIGGER:-P${lead}D`);
    // Every line is CRLF-terminated and ≤ 75 octets after folding.
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
  });

  // Review 2026-09-10 #19: a CR / CRLF inside a grant name would end the
  // content line and inject iCalendar properties into the subscriber's feed.
  it("escapes CR and CRLF in text values so a catalogue string cannot inject ICS lines", () => {
    expect(escapeIcsText("a\r\nb")).toBe("a\\nb");
    expect(escapeIcsText("a\rb")).toBe("a\\nb");
    expect(escapeIcsText("a\nb")).toBe("a\\nb");
    expect(escapeIcsText("x; y, z\\")).toBe("x\\; y\\, z\\\\");
    const events = buildFundingCalendar([row({ name: "Evil\r\nATTENDEE:mailto:x@example.com\r\nX:" })], { now: NOW });
    const ics = renderIcs(events, { now: NOW, calendarName: FUNDING_CALENDAR_NAME, prodId: FUNDING_CALENDAR_PRODID });
    const lines = ics.split("\r\n");
    expect(lines.some((l) => l.startsWith("ATTENDEE:"))).toBe(false);
    expect(lines.some((l) => l.startsWith("X:"))).toBe(false);
    expect(ics).not.toMatch(/\r(?!\n)/);
  });
});
