// Colocated suite for the client-side engagement buffer (S21-A).
//
// The rule under test: at most ONE report per section per 30 s window, each
// carrying only the dwell accrued since the last report, dwell accruing only
// while visible, sub-second dwell ignored.

import { describe, expect, it } from "vitest";
import { EngagementBuffer, MIN_REPORTABLE_DWELL_MS, encodePayload } from "./engagement-client";
import { ENGAGE_DEDUPE_WINDOW_MS } from "./engagement";

const token = "t".repeat(32);

describe("EngagementBuffer", () => {
  it("accrues dwell only while a section is visible and reports it on flush", () => {
    const b = new EngagementBuffer(token);
    b.show("Team", 0);
    b.hide("Team", 5_000);
    b.show("Team", 20_000); // came back
    const out = b.flush(23_000);
    expect(out).toEqual([{ token, eventType: "section_view", section: "Team", durationMs: 8_000 }]);
  });

  it("ignores sub-second dwell (a scroll-past is not a read) but keeps accumulating it", () => {
    const b = new EngagementBuffer(token);
    b.show("Team", 0);
    b.hide("Team", 400);
    expect(b.flush(1_000)).toEqual([]);
    expect(b.pending("Team")).toBe(400);
    b.show("Team", 2_000);
    b.hide("Team", 2_700);
    expect(b.flush(3_000)).toEqual([{ token, eventType: "section_view", section: "Team", durationMs: 1_100 }]);
    expect(MIN_REPORTABLE_DWELL_MS).toBe(1_000);
  });

  it("reports a section at most once per 30 s window, carrying only the new dwell", () => {
    const b = new EngagementBuffer(token);
    b.show("Team", 0);
    expect(b.flush(5_000)).toEqual([{ token, eventType: "section_view", section: "Team", durationMs: 5_000 }]);
    // Still visible; inside the window → nothing, pending keeps growing.
    expect(b.flush(20_000)).toEqual([]);
    // Window elapsed → one report with the dwell since the last one.
    expect(b.flush(5_000 + ENGAGE_DEDUPE_WINDOW_MS)).toEqual([
      { token, eventType: "section_view", section: "Team", durationMs: ENGAGE_DEDUPE_WINDOW_MS },
    ]);
  });

  it("force-flushes on unload regardless of the window, once", () => {
    const b = new EngagementBuffer(token);
    b.show("Team", 0);
    b.flush(5_000);
    b.pause(9_000);
    expect(b.flush(9_000, { force: true })).toEqual([{ token, eventType: "section_view", section: "Team", durationMs: 4_000 }]);
    expect(b.flush(9_000, { force: true })).toEqual([]);
  });

  it("pause banks every visible section; resume restarts the ones still on screen", () => {
    const b = new EngagementBuffer(token);
    b.show("Team", 0);
    b.show("Financials", 0);
    b.pause(3_000);
    // Hidden tab: no accrual.
    b.resume(["Team"], 60_000);
    const out = b.flush(62_000);
    expect(out).toEqual([
      { token, eventType: "section_view", section: "Team", durationMs: 5_000 },
      { token, eventType: "section_view", section: "Financials", durationMs: 3_000 },
    ]);
  });

  it("carries nothing but the token about the viewer", () => {
    const b = new EngagementBuffer(token);
    b.show("Team", 0);
    const [p] = b.flush(2_000);
    expect(Object.keys(p).sort()).toEqual(["durationMs", "eventType", "section", "token"]);
    expect(JSON.parse(encodePayload(p))).toEqual(p);
  });
});
