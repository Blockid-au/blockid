import { describe, it, expect } from "vitest";
import type { ComplianceEvent } from "@/lib/compliance/calendar";
import {
  EVENT_KIND_LABEL,
  EVENT_KIND_HELP_ROUTE,
  buildSubscribeUrl,
  daysUntil,
  formatDueDate,
  groupByMonth,
  pickCalendarBand,
  pickNextEvent,
} from "./calendar-view.helpers";

function ev(
  overrides: Partial<ComplianceEvent> & { date_start: string; uid?: string },
): ComplianceEvent {
  return {
    uid: overrides.uid ?? `uid-${overrides.date_start}@blockid.au`,
    kind: "bas_quarter",
    summary: `Event ${overrides.date_start}`,
    description: "desc",
    date_start: overrides.date_start,
    date_end: overrides.date_start,
    reminder_lead_days: 14,
    source_url: "https://example.test",
    ...overrides,
  };
}

describe("EVENT_KIND_LABEL / EVENT_KIND_HELP_ROUTE", () => {
  const KINDS = [
    "bas_quarter",
    "asic_annual_review",
    "rd_registration",
    "wgea_report",
    "modern_slavery_statement",
  ] as const;

  it("labels every ComplianceEventKind with distinct text", () => {
    for (const k of KINDS) {
      expect(EVENT_KIND_LABEL[k]).toBeTruthy();
    }
    const values = KINDS.map((k) => EVENT_KIND_LABEL[k]);
    expect(new Set(values).size).toBe(KINDS.length);
  });

  it("routes every kind to an in-app help surface", () => {
    for (const k of KINDS) {
      const route = EVENT_KIND_HELP_ROUTE[k];
      expect(route.startsWith("/")).toBe(true);
      expect(route.length).toBeGreaterThan(1);
    }
  });
});

describe("daysUntil", () => {
  const now = new Date("2026-07-25T00:00:00Z");

  it("returns 0 for today", () => {
    expect(daysUntil("2026-07-25", now)).toBe(0);
  });

  it("returns positive for future dates", () => {
    expect(daysUntil("2026-07-30", now)).toBe(5);
  });

  it("returns negative for past dates", () => {
    expect(daysUntil("2026-07-10", now)).toBe(-15);
  });

  it("returns NaN for unparseable input", () => {
    expect(Number.isNaN(daysUntil("not-a-date", now))).toBe(true);
  });
});

describe("pickCalendarBand", () => {
  const now = new Date("2026-07-25T00:00:00Z");

  it("returns red for overdue events", () => {
    expect(pickCalendarBand(ev({ date_start: "2026-07-01" }), now)).toBe("red");
  });

  it("returns amber inside the 14-day reminder window", () => {
    expect(pickCalendarBand(ev({ date_start: "2026-08-05" }), now)).toBe("amber");
    expect(pickCalendarBand(ev({ date_start: "2026-07-25" }), now)).toBe("amber");
  });

  it("returns green further out", () => {
    expect(pickCalendarBand(ev({ date_start: "2026-10-28" }), now)).toBe("green");
  });

  it("falls back to green on unparseable date", () => {
    expect(pickCalendarBand(ev({ date_start: "not-a-date" }), now)).toBe("green");
  });
});

describe("formatDueDate", () => {
  it("renders human-readable date with weekday", () => {
    expect(formatDueDate("2026-10-28")).toBe("28 Oct 2026 (Wed)");
    expect(formatDueDate("2027-02-28")).toBe("28 Feb 2027 (Sun)");
  });

  it("falls back to raw string when unparseable", () => {
    expect(formatDueDate("not-a-date")).toBe("not-a-date");
  });
});

describe("groupByMonth", () => {
  it("groups events into (year, month) buckets sorted chronologically", () => {
    const groups = groupByMonth([
      ev({ date_start: "2027-02-28", uid: "b" }),
      ev({ date_start: "2026-10-28", uid: "a" }),
      ev({ date_start: "2026-10-15", uid: "a2" }),
    ]);
    expect(groups.map((g) => g.monthKey)).toEqual(["2026-10", "2027-02"]);
    expect(groups[0].monthLabel).toBe("October 2026");
    expect(groups[0].events.map((e) => e.uid)).toEqual(["a", "a2"]);
    expect(groups[1].events.map((e) => e.uid)).toEqual(["b"]);
  });

  it("returns empty array on empty input", () => {
    expect(groupByMonth([])).toEqual([]);
  });

  it("routes unparseable dates into an 'unknown' bucket at the end", () => {
    const groups = groupByMonth([
      ev({ date_start: "bad-date", uid: "x" }),
      ev({ date_start: "2026-10-28", uid: "y" }),
    ]);
    expect(groups.map((g) => g.monthKey)).toEqual(["2026-10", "unknown"]);
    expect(groups[1].monthLabel).toBe("Unscheduled");
  });
});

describe("pickNextEvent", () => {
  const now = new Date("2026-07-25T00:00:00Z");

  it("returns the soonest future event", () => {
    const next = pickNextEvent(
      [
        ev({ date_start: "2026-10-28", uid: "far" }),
        ev({ date_start: "2026-08-05", uid: "near" }),
      ],
      now,
    );
    expect(next?.uid).toBe("near");
  });

  it("prefers a future event over an overdue one", () => {
    const next = pickNextEvent(
      [
        ev({ date_start: "2026-06-01", uid: "past" }),
        ev({ date_start: "2026-08-01", uid: "future" }),
      ],
      now,
    );
    expect(next?.uid).toBe("future");
  });

  it("falls back to the earliest overdue event when everything has passed", () => {
    const next = pickNextEvent(
      [
        ev({ date_start: "2026-06-15", uid: "later-overdue" }),
        ev({ date_start: "2026-05-01", uid: "earliest-overdue" }),
      ],
      now,
    );
    expect(next?.uid).toBe("earliest-overdue");
  });

  it("returns null on empty input", () => {
    expect(pickNextEvent([], now)).toBeNull();
  });

  it("breaks date ties by summary alphabetical", () => {
    const next = pickNextEvent(
      [
        ev({ date_start: "2026-08-05", summary: "Zeta", uid: "z" }),
        ev({ date_start: "2026-08-05", summary: "Alpha", uid: "a" }),
      ],
      now,
    );
    expect(next?.uid).toBe("a");
  });
});

describe("buildSubscribeUrl", () => {
  it("prepends https:// to a bare hostname", () => {
    const urls = buildSubscribeUrl("blockid.au");
    expect(urls.https).toBe("https://blockid.au/api/compliance/calendar");
    expect(urls.webcal).toBe("webcal://blockid.au/api/compliance/calendar");
  });

  it("preserves an https:// prefix and strips trailing slashes", () => {
    const urls = buildSubscribeUrl("https://blockid.au/");
    expect(urls.https).toBe("https://blockid.au/api/compliance/calendar");
    expect(urls.webcal).toBe("webcal://blockid.au/api/compliance/calendar");
  });

  it("preserves an http:// prefix for local dev", () => {
    const urls = buildSubscribeUrl("http://localhost:3000");
    expect(urls.https).toBe("http://localhost:3000/api/compliance/calendar");
    expect(urls.webcal).toBe("webcal://localhost:3000/api/compliance/calendar");
  });

  it("defaults to blockid.au when the base is empty", () => {
    const urls = buildSubscribeUrl("");
    expect(urls.https).toBe("https://blockid.au/api/compliance/calendar");
    expect(urls.webcal).toBe("webcal://blockid.au/api/compliance/calendar");
  });
});
