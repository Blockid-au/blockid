// Colocated suite for the engagement rules and heatmap aggregation (S21-A).

import { describe, expect, it } from "vitest";
import {
  ENGAGE_DEDUPE_WINDOW_MS,
  ENGAGE_MAX_DURATION_MS,
  ENGAGE_PAGE_SECTIONS,
  allowedSections,
  buildEngagementHeatmap,
  formatDwell,
  heatBucket,
  isDuplicateEvent,
  parseEngageEvent,
  INVESTOR_VIEWED_DWELL_THRESHOLD_MS,
  INVESTOR_VIEWED_SECTION_THRESHOLD,
  INVESTOR_VIEWED_THROTTLE_MS,
  detectInvestorViewedTrigger,
  readDepth,
} from "./engagement";

const token = "t".repeat(32);

describe("parseEngageEvent", () => {
  it("accepts a whitelisted type and cleans every optional field", () => {
    const r = parseEngageEvent({ token, eventType: "section_view", section: "  A   B ", documentName: " D ", durationMs: "1500.6", scrollPct: 55 });
    expect(r).toEqual({
      ok: true,
      event: { token, eventType: "section_view", section: "A B", documentName: "D", durationMs: 1501, scrollPct: 55 },
    });
  });
  it("clamps dwell to an hour and scroll to 0..100; nullifies junk", () => {
    const r = parseEngageEvent({ token, eventType: "open", durationMs: 1e12, scrollPct: -5 });
    expect(r).toMatchObject({ ok: true, event: { durationMs: ENGAGE_MAX_DURATION_MS, scrollPct: 0 } });
    const j = parseEngageEvent({ token, eventType: "open", durationMs: "abc", scrollPct: {} });
    expect(j).toMatchObject({ ok: true, event: { durationMs: null, scrollPct: null } });
  });
  it("caps section and document strings so a hostile client cannot bloat a row", () => {
    const r = parseEngageEvent({ token, eventType: "document_open", section: "s".repeat(500), documentName: "d".repeat(500) });
    expect(r.ok && r.event.section!.length).toBe(120);
    expect(r.ok && r.event.documentName!.length).toBe(160);
  });
  it("rejects missing fields, unknown types, short tokens, and section_view without a section", () => {
    expect(parseEngageEvent({})).toMatchObject({ ok: false, error: "Missing token or eventType" });
    expect(parseEngageEvent({ token, eventType: "hack" })).toMatchObject({ ok: false });
    expect(parseEngageEvent({ token: "abc", eventType: "open" })).toMatchObject({ ok: false, error: "Invalid token" });
    expect(parseEngageEvent({ token, eventType: "section_view" })).toMatchObject({ ok: false });
    expect(parseEngageEvent(null)).toMatchObject({ ok: false });
  });
});

describe("allowedSections (S21-A review P2-1)", () => {
  it("is the two page sections plus the room's folders, normalised like the POST body", () => {
    const allowed = allowedSections(["1. Corporate &  Legal ", "  3. Financials", null, "", 42]);
    expect([...allowed]).toEqual([...ENGAGE_PAGE_SECTIONS, "1. Corporate & Legal", "3. Financials"]);
    expect(allowed.has("Headline figures")).toBe(true);
    expect(allowed.has("Outstanding items")).toBe(true);
    expect(allowed.has("<img src=x onerror=1>")).toBe(false);
  });
  it("a room with no documents still accepts the page sections only", () => {
    expect([...allowedSections([])]).toEqual([...ENGAGE_PAGE_SECTIONS]);
  });
});

describe("isDuplicateEvent", () => {
  const now = Date.parse("2026-09-12T00:01:00Z");
  const ev = { eventType: "section_view" as const, section: "Team", documentName: null };
  it("is a duplicate inside the window, not after it, not with no prior row", () => {
    expect(isDuplicateEvent(ev, { occurred_at: "2026-09-12T00:00:45Z" }, now)).toBe(true);
    expect(isDuplicateEvent(ev, { occurred_at: "2026-09-12T00:00:29Z" }, now)).toBe(false);
    expect(isDuplicateEvent(ev, null, now)).toBe(false);
    expect(isDuplicateEvent(ev, { occurred_at: null }, now)).toBe(false);
    expect(isDuplicateEvent(ev, { occurred_at: "garbage" }, now)).toBe(false);
  });
  it("uses the shared window constant", () => {
    expect(isDuplicateEvent(ev, { occurred_at: new Date(now - ENGAGE_DEDUPE_WINDOW_MS + 1).toISOString() }, now)).toBe(true);
    expect(isDuplicateEvent(ev, { occurred_at: new Date(now - ENGAGE_DEDUPE_WINDOW_MS).toISOString() }, now)).toBe(false);
  });
  it("never dedupes a download — each one counts", () => {
    expect(isDuplicateEvent({ ...ev, eventType: "document_download" }, { occurred_at: new Date(now - 1000).toISOString() }, now)).toBe(false);
  });
});

describe("buildEngagementHeatmap", () => {
  const links = [
    { id: "l2", label: "Blackbird" },
    { id: "l1", label: "Jane" },
  ];
  const events = [
    { access_token_id: "l1", event_type: "open", section: null, duration_ms: null, occurred_at: "2026-09-10T00:00:00Z" },
    { access_token_id: "l1", event_type: "section_view", section: "Team", duration_ms: 40_000, occurred_at: "2026-09-10T00:01:00Z" },
    { access_token_id: "l1", event_type: "section_view", section: "Team", duration_ms: 20_000, occurred_at: "2026-09-10T00:02:00Z" },
    { access_token_id: "l1", event_type: "section_view", section: "Financials", duration_ms: 10_000, occurred_at: "2026-09-10T00:03:00Z" },
    { access_token_id: "l2", event_type: "section_view", section: "Financials", duration_ms: 5_000, occurred_at: "2026-09-10T00:04:00Z" },
    { access_token_id: "l2", event_type: "document_open", section: "Financials", duration_ms: null, occurred_at: "2026-09-10T00:05:00Z" },
    { access_token_id: "l2", event_type: "document_download", section: "Financials", duration_ms: null, occurred_at: "2026-09-10T00:06:00Z" },
    { access_token_id: "gone", event_type: "section_view", section: "Team", duration_ms: 99_000, occurred_at: "2026-09-10T00:07:00Z" },
    { access_token_id: null, event_type: "section_view", section: "Team", duration_ms: 99_000, occurred_at: "2026-09-10T00:08:00Z" },
  ];

  it("keeps the link order as rows, drops events for unknown / null links, orders sections by dwell", () => {
    const m = buildEngagementHeatmap(events, links);
    expect(m.rows.map((r) => r.label)).toEqual(["Blackbird", "Jane"]);
    expect(m.sections).toEqual(["Team", "Financials"]);
    expect(m.totalEvents).toBe(7);
  });

  it("sums views and dwell per cell; document_open / download count a view with no dwell", () => {
    const m = buildEngagementHeatmap(events, links);
    const jane = m.rows[1];
    expect(jane.opens).toBe(1);
    expect(jane.totalDwellMs).toBe(70_000);
    expect(jane.cells).toEqual([
      { linkId: "l1", section: "Team", views: 2, dwellMs: 60_000 },
      { linkId: "l1", section: "Financials", views: 1, dwellMs: 10_000 },
    ]);
    const bb = m.rows[0];
    expect(bb.downloads).toBe(1);
    expect(bb.cells).toEqual([
      { linkId: "l2", section: "Team", views: 0, dwellMs: 0 },
      { linkId: "l2", section: "Financials", views: 3, dwellMs: 5_000 },
    ]);
    expect(bb.lastSeen).toBe("2026-09-10T00:06:00Z");
    expect(m.maxDwellMs).toBe(60_000);
    expect(m.maxViews).toBe(3);
  });

  it("honours an explicit section order (the room's folder order) and DROPS sections not in it (P2-1)", () => {
    const m = buildEngagementHeatmap(events, links, ["Financials", "Never viewed", "Team"]);
    expect(m.sections).toEqual(["Financials", "Team"]);
    const injected = [
      ...events,
      { access_token_id: "l1", event_type: "section_view", section: "<b>HACKED</b>", duration_ms: 999_000, occurred_at: "2026-09-10T00:09:00Z" },
    ];
    const m2 = buildEngagementHeatmap(injected, links, ["Financials", "Team"]);
    expect(m2.sections).toEqual(["Financials", "Team"]);
    expect(m2.rows[1].cells.map((c) => c.section)).toEqual(["Financials", "Team"]);
    expect(m2.maxDwellMs).toBe(60_000);
    // An empty (but given) order means no section columns at all — never a fall-through to "anything seen".
    expect(buildEngagementHeatmap(injected, links, []).sections).toEqual([]);
  });

  it("returns an empty model for no links / no events", () => {
    expect(buildEngagementHeatmap([], [])).toEqual({ sections: [], rows: [], maxDwellMs: 0, maxViews: 0, totalEvents: 0 });
    const m = buildEngagementHeatmap([], links);
    expect(m.rows.length).toBe(2);
    expect(m.rows[0].cells).toEqual([]);
    expect(m.totalEvents).toBe(0);
  });
});

describe("heatBucket", () => {
  it("0 for no views, 1 for views with no dwell, then a 4-step ramp on dwell share", () => {
    expect(heatBucket({ views: 0, dwellMs: 0 }, 100)).toBe(0);
    expect(heatBucket({ views: 1, dwellMs: 0 }, 100)).toBe(1);
    expect(heatBucket({ views: 1, dwellMs: 10 }, 100)).toBe(1);
    expect(heatBucket({ views: 1, dwellMs: 20 }, 100)).toBe(2);
    expect(heatBucket({ views: 1, dwellMs: 50 }, 100)).toBe(3);
    expect(heatBucket({ views: 1, dwellMs: 90 }, 100)).toBe(4);
    expect(heatBucket({ views: 3, dwellMs: 50 }, 0)).toBe(1);
  });
});

describe("formatDwell", () => {
  it("formats seconds and minutes, dash for nothing", () => {
    expect(formatDwell(0)).toBe("—");
    expect(formatDwell(-5)).toBe("—");
    expect(formatDwell(4_400)).toBe("4s");
    expect(formatDwell(65_000)).toBe("1m 05s");
    expect(formatDwell(3_600_000)).toBe("60m 00s");
  });
});

// ── S26-A founder alerts ──────────────────────────────────────────────────

describe("readDepth", () => {
  it("counts distinct sections across section_view + document_open and sums section_view dwell only", () => {
    const d = readDepth([
      { event_type: "open", section: null, duration_ms: null },
      { event_type: "section_view", section: "Team", duration_ms: 30_000 },
      { event_type: "section_view", section: "Team", duration_ms: 20_000 },
      { event_type: "document_open", section: "Financials", duration_ms: 99_000 },
      { event_type: "document_download", section: "Financials", duration_ms: null },
      { event_type: "section_view", section: "Legal", duration_ms: -5 },
      { event_type: "section_view", section: null, duration_ms: 10_000 },
    ]);
    expect(d).toEqual({ sections: 3, dwellMs: 60_000 });
  });

  it("is zero for no events", () => {
    expect(readDepth([])).toEqual({ sections: 0, dwellMs: 0 });
  });
});

describe("detectInvestorViewedTrigger", () => {
  it("pins the thresholds the copy promises: 3 sections, 5 min, 24 h", () => {
    expect(INVESTOR_VIEWED_SECTION_THRESHOLD).toBe(3);
    expect(INVESTOR_VIEWED_DWELL_THRESHOLD_MS).toBe(5 * 60_000);
    expect(INVESTOR_VIEWED_THROTTLE_MS).toBe(24 * 60 * 60_000);
  });

  it("first open of a never-opened link → first_view; a repeat open → nothing", () => {
    expect(detectInvestorViewedTrigger({ eventType: "open", firstAccessedBefore: null, depth: { sections: 0, dwellMs: 0 } })).toBe("first_view");
    expect(detectInvestorViewedTrigger({ eventType: "open", firstAccessedBefore: "2026-09-01T00:00:00Z", depth: { sections: 0, dwellMs: 0 } })).toBeNull();
  });

  it("deep_read once 3 sections OR 5 min are reached; nothing below both", () => {
    const base = { eventType: "section_view" as const, firstAccessedBefore: "2026-09-01T00:00:00Z" };
    expect(detectInvestorViewedTrigger({ ...base, depth: { sections: 2, dwellMs: 299_999 } })).toBeNull();
    expect(detectInvestorViewedTrigger({ ...base, depth: { sections: 3, dwellMs: 0 } })).toBe("deep_read");
    expect(detectInvestorViewedTrigger({ ...base, depth: { sections: 0, dwellMs: 300_000 } })).toBe("deep_read");
    // a download after the threshold is still a deep read (the writer's throttle collapses it)
    expect(detectInvestorViewedTrigger({ ...base, eventType: "document_download", depth: { sections: 4, dwellMs: 0 } })).toBe("deep_read");
  });

  it("a first open that already crosses the depth threshold reports first_view (the more useful of the two)", () => {
    expect(detectInvestorViewedTrigger({ eventType: "open", firstAccessedBefore: null, depth: { sections: 5, dwellMs: 0 } })).toBe("first_view");
  });
});
