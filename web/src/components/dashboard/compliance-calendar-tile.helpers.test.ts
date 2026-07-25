import { describe, it, expect } from "vitest";
import type { ComplianceEvent } from "@/lib/compliance/calendar";
import {
  CALENDAR_TILE_EVENT_LABEL,
  daysUntil,
  pickCalendarTileBand,
  pickCalendarTileView,
  type CalendarTilePayload,
} from "./compliance-calendar-tile.helpers";

const NOW = new Date("2026-08-01T00:00:00Z");

function ev(
  overrides: Partial<ComplianceEvent> & { date_start: string },
): ComplianceEvent {
  return {
    uid: `uid-${overrides.date_start}@blockid.au`,
    kind: "bas_quarter",
    summary: `BAS quarterly lodgment ${overrides.date_start}`,
    description: "desc",
    date_end: overrides.date_start,
    reminder_lead_days: 14,
    source_url: "https://example.test",
    ...overrides,
  };
}

describe("daysUntil", () => {
  it("returns 0 when the ISO date is today", () => {
    expect(daysUntil("2026-08-01", NOW)).toBe(0);
  });
  it("returns positive integers for the future", () => {
    expect(daysUntil("2026-08-11", NOW)).toBe(10);
  });
  it("returns negative integers for the past", () => {
    expect(daysUntil("2026-07-27", NOW)).toBe(-5);
  });
  it("returns NaN for unparseable input", () => {
    expect(Number.isNaN(daysUntil("not-a-date", NOW))).toBe(true);
  });
});

describe("pickCalendarTileBand", () => {
  it("returns red for overdue events", () => {
    expect(pickCalendarTileBand(ev({ date_start: "2026-07-25" }), NOW)).toBe(
      "red",
    );
  });
  it("returns amber for events inside the 14-day reminder window", () => {
    expect(pickCalendarTileBand(ev({ date_start: "2026-08-10" }), NOW)).toBe(
      "amber",
    );
  });
  it("returns amber at exactly 0 days (due today)", () => {
    expect(pickCalendarTileBand(ev({ date_start: "2026-08-01" }), NOW)).toBe(
      "amber",
    );
  });
  it("returns emerald for events > 14 days out", () => {
    expect(pickCalendarTileBand(ev({ date_start: "2026-09-01" }), NOW)).toBe(
      "emerald",
    );
  });
  it("returns slate for unparseable dates so a corrupt row doesn't scream red", () => {
    expect(pickCalendarTileBand(ev({ date_start: "corrupt" }), NOW)).toBe(
      "slate",
    );
  });
});

describe("pickCalendarTileView", () => {
  it("returns a loading slate view when the payload is null", () => {
    const view = pickCalendarTileView(null, NOW);
    expect(view.colour).toBe("slate");
    expect(view.chipLabel).toBe("Loading…");
    expect(view.headline).toMatch(/calendar/i);
  });

  it("returns a slate 'nothing due' view when the payload has no next event", () => {
    const view = pickCalendarTileView(
      {
        total: 0,
        next_event: null,
        subscribe: { webcal: "webcal://blockid.au/api/compliance/calendar", https: "https://blockid.au/api/compliance/calendar" },
      },
      NOW,
    );
    expect(view.colour).toBe("slate");
    expect(view.chipLabel).toBe("Nothing due");
    expect(view.body).toMatch(/GST|R&D/);
  });

  it("returns a red overdue view with a days-overdue chip", () => {
    const payload: CalendarTilePayload = {
      total: 3,
      next_event: ev({ date_start: "2026-07-27", kind: "bas_quarter" }),
      subscribe: { webcal: "webcal://x/api/compliance/calendar", https: "https://x/api/compliance/calendar" },
    };
    const view = pickCalendarTileView(payload, NOW);
    expect(view.colour).toBe("red");
    expect(view.chipLabel).toBe("5d overdue");
    expect(view.headline).toContain("BAS quarter");
    expect(view.headline).toContain("3 scheduled");
    expect(view.body).toContain("BAS quarterly lodgment");
  });

  it("returns an amber inside-reminder-window view", () => {
    const payload: CalendarTilePayload = {
      total: 1,
      next_event: ev({ date_start: "2026-08-10", kind: "rd_registration" }),
      subscribe: { webcal: "webcal://x/api/compliance/calendar", https: "https://x/api/compliance/calendar" },
    };
    const view = pickCalendarTileView(payload, NOW);
    expect(view.colour).toBe("amber");
    expect(view.chipLabel).toBe("9d left");
    expect(view.headline).toContain("R&D deadline");
    // total=1 omits the "(N scheduled)" suffix
    expect(view.headline).not.toContain("scheduled");
  });

  it("returns an emerald on-track view for events > 14 days out", () => {
    const payload: CalendarTilePayload = {
      total: 5,
      next_event: ev({ date_start: "2026-10-31", kind: "wgea_report" }),
      subscribe: { webcal: "webcal://x/api/compliance/calendar", https: "https://x/api/compliance/calendar" },
    };
    const view = pickCalendarTileView(payload, NOW);
    expect(view.colour).toBe("emerald");
    expect(view.chipLabel).toMatch(/d left$/);
    expect(view.headline).toContain("WGEA report");
    expect(view.headline).toContain("5 scheduled");
  });

  it("uses 'Due today' copy when the deadline is exactly today", () => {
    const payload: CalendarTilePayload = {
      total: 1,
      next_event: ev({ date_start: "2026-08-01", kind: "modern_slavery_statement" }),
      subscribe: { webcal: "webcal://x/api/compliance/calendar", https: "https://x/api/compliance/calendar" },
    };
    const view = pickCalendarTileView(payload, NOW);
    expect(view.colour).toBe("amber");
    expect(view.chipLabel).toBe("Due today");
  });
});

describe("CALENDAR_TILE_EVENT_LABEL", () => {
  it("covers every ComplianceEventKind with a non-empty label", () => {
    const kinds: Array<keyof typeof CALENDAR_TILE_EVENT_LABEL> = [
      "bas_quarter",
      "asic_annual_review",
      "rd_registration",
      "wgea_report",
      "modern_slavery_statement",
    ];
    for (const k of kinds) {
      expect(CALENDAR_TILE_EVENT_LABEL[k]).toBeTruthy();
    }
  });
});
