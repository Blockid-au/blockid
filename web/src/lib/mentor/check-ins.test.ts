import { describe, expect, it } from "vitest";
import {
  completeness,
  currentIsoWeek,
  FRESH_WINDOW_DAYS,
  isFresh,
  nudgeRequired,
} from "./check-ins";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("currentIsoWeek", () => {
  it("returns the expected ISO week for a mid-year Wednesday", () => {
    // 2026-07-22 is a Wednesday → ISO week 30.
    expect(currentIsoWeek(new Date("2026-07-22T12:00:00Z"))).toBe("2026-W30");
  });

  it("handles the DST boundary the same way as any other day (UTC-based)", () => {
    // Southern-hemisphere DST end: 2026-04-05 (Sun).
    expect(currentIsoWeek(new Date("2026-04-05T02:00:00Z"))).toBe("2026-W14");
    expect(currentIsoWeek(new Date("2026-04-06T02:00:00Z"))).toBe("2026-W15");
  });

  it("handles the year boundary — Jan 1 2027 falls in ISO week 53 of 2026", () => {
    // 2027-01-01 is a Friday → ISO week 53 of 2026 (Thu = 2026-12-31).
    expect(currentIsoWeek(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
    // 2026-01-01 is a Thursday → ISO week 1 of 2026.
    expect(currentIsoWeek(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
  });
});

describe("isFresh", () => {
  const now = new Date("2026-07-22T00:00:00Z");

  it("is false when there's no prior check-in", () => {
    expect(isFresh(null, now)).toBe(false);
  });

  it("is true just inside the 7-day window", () => {
    const t = new Date(now.getTime() - (FRESH_WINDOW_DAYS * DAY_MS - 1)).toISOString();
    expect(isFresh(t, now)).toBe(true);
  });

  it("is true at exactly 7 days (inclusive boundary)", () => {
    const t = new Date(now.getTime() - FRESH_WINDOW_DAYS * DAY_MS).toISOString();
    expect(isFresh(t, now)).toBe(true);
  });

  it("is false past 7 days", () => {
    const t = new Date(now.getTime() - (FRESH_WINDOW_DAYS * DAY_MS + 1)).toISOString();
    expect(isFresh(t, now)).toBe(false);
  });

  it("handles bad input gracefully", () => {
    expect(isFresh("not-a-date", now)).toBe(false);
  });
});

describe("completeness", () => {
  it("returns 1 when all four fields are filled", () => {
    expect(
      completeness({ wins: "w", blockers: "b", next_focus: "n", mood: "up" }),
    ).toBeCloseTo(1);
  });

  it("returns 0 when nothing is filled", () => {
    expect(completeness({})).toBe(0);
    expect(completeness({ wins: "  ", blockers: "", next_focus: "" })).toBe(0);
  });

  it("weights wins and blockers most heavily", () => {
    expect(completeness({ wins: "w" })).toBeCloseTo(0.35);
    expect(completeness({ blockers: "b" })).toBeCloseTo(0.35);
    expect(completeness({ next_focus: "n" })).toBeCloseTo(0.25);
    expect(completeness({ mood: "down" })).toBeCloseTo(0.05);
  });

  it("rejects invalid mood values", () => {
    // @ts-expect-error - runtime bad input
    expect(completeness({ mood: "ecstatic" })).toBe(0);
  });
});

describe("nudgeRequired", () => {
  const monday = new Date("2026-07-27T09:00:00Z"); // Monday

  it("does not nudge when paused", () => {
    expect(nudgeRequired(null, { paused: true }, monday)).toBe(false);
  });

  it("nudges on the configured dow when never checked in", () => {
    expect(nudgeRequired(null, {}, monday)).toBe(true);
  });

  it("does not nudge on non-nudge days", () => {
    const tuesday = new Date("2026-07-28T09:00:00Z");
    expect(nudgeRequired(null, {}, tuesday)).toBe(false);
  });

  it("does not nudge when a fresh check-in exists", () => {
    const t = new Date(monday.getTime() - 3 * DAY_MS).toISOString();
    expect(nudgeRequired(t, {}, monday)).toBe(false);
  });

  it("nudges when the last check-in is stale on the nudge day", () => {
    const t = new Date(monday.getTime() - 10 * DAY_MS).toISOString();
    expect(nudgeRequired(t, {}, monday)).toBe(true);
  });
});
