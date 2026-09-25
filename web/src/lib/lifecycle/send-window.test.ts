// G34-BT4 — quiet hours for C-class lifecycle mail (plan §9.2 "Giờ gửi").
import { describe, expect, it } from "vitest";
import { FLOW_STEP_GAP_MS, isInCommercialSendWindow, nextCommercialSendSlot, spacedSlot, sydneyWeekdayHour } from "./send-window";

const H = 3_600_000;

describe("isInCommercialSendWindow (Mon–Fri 08:00–19:00 Australia/Sydney)", () => {
  it("reads Sydney local time across standard and daylight time", () => {
    // Thu 24/09/2026 00:30Z = 10:30 AEST (+10).
    expect(sydneyWeekdayHour(new Date("2026-09-24T00:30:00Z"))).toEqual({ weekday: 4, hour: 10 });
    // Mon 12/10/2026 00:30Z = 11:30 AEDT (+11, after the first Sunday of October).
    expect(sydneyWeekdayHour(new Date("2026-10-12T00:30:00Z"))).toEqual({ weekday: 1, hour: 11 });
  });

  it("open at 08:00 and 18:59, closed at 07:59 and 19:00", () => {
    expect(isInCommercialSendWindow(new Date("2026-09-23T22:00:00Z"))).toBe(true); // Thu 08:00
    expect(isInCommercialSendWindow(new Date("2026-09-24T08:59:00Z"))).toBe(true); // Thu 18:59
    expect(isInCommercialSendWindow(new Date("2026-09-23T21:59:00Z"))).toBe(false); // Thu 07:59
    expect(isInCommercialSendWindow(new Date("2026-09-24T09:00:00Z"))).toBe(false); // Thu 19:00
  });

  it("closed all weekend", () => {
    expect(isInCommercialSendWindow(new Date("2026-09-26T02:00:00Z"))).toBe(false); // Sat 12:00
    expect(isInCommercialSendWindow(new Date("2026-09-27T02:00:00Z"))).toBe(false); // Sun 12:00
  });
});

describe("nextCommercialSendSlot", () => {
  it("returns the instant itself when the window is open", () => {
    const t = new Date("2026-09-24T01:17:00Z");
    expect(nextCommercialSendSlot(t).toISOString()).toBe(t.toISOString());
  });

  it("Friday evening and the weekend move to Monday 08:00 Sydney", () => {
    expect(nextCommercialSendSlot(new Date("2026-09-25T10:00:00Z")).toISOString()).toBe("2026-09-27T22:00:00.000Z"); // Fri 20:00 → Mon 08:00
    expect(nextCommercialSendSlot(new Date("2026-09-26T02:00:00Z")).toISOString()).toBe("2026-09-27T22:00:00.000Z");
  });

  it("early morning moves to 08:00 the same day", () => {
    expect(nextCommercialSendSlot(new Date("2026-09-23T19:40:00Z")).toISOString()).toBe("2026-09-23T22:00:00.000Z"); // Thu 05:40 → 08:00
  });
});

describe("spacedSlot", () => {
  it("keeps ≥ 74 h after the previous step even when the nominal day is earlier", () => {
    const prev = new Date("2026-09-28T22:00:00Z"); // Tue 08:00 AEST
    const s = spacedSlot(new Date("2026-09-29T00:00:00Z"), prev);
    expect(s.getTime() - prev.getTime()).toBeGreaterThanOrEqual(FLOW_STEP_GAP_MS);
    expect(isInCommercialSendWindow(s)).toBe(true);
  });

  it("a weekend push on the first step pushes the next one too", () => {
    const first = spacedSlot(new Date("2026-09-26T02:00:00Z"), null); // Sat → Mon 08:00
    const second = spacedSlot(new Date("2026-09-28T02:00:00Z"), first); // nominal Mon 12:00 → ≥ Thu 10:00
    expect(first.toISOString()).toBe("2026-09-27T22:00:00.000Z");
    expect(second.getTime() - first.getTime()).toBeGreaterThanOrEqual(74 * H);
  });
});
