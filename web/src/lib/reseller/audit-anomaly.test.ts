import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANOMALY_ACTIONS,
  DEFAULT_ANOMALY_THRESHOLD,
  DEFAULT_ANOMALY_WINDOW_DAYS,
  buildAnomalySummary,
  detectActorHotspots,
  detectSubjectHotspots,
  resolveWindow,
  type AuditLogRow,
} from "./audit-anomaly";

const NOW = new Date("2026-07-22T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function isoAgo(days: number, from: Date = NOW): string {
  return new Date(from.getTime() - days * DAY_MS).toISOString();
}

function makeRow(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    reseller_id: "reseller-a",
    actor_user_id: "actor-1",
    subject_user_id: "subject-1",
    action: "view_customer_drawer",
    created_at: isoAgo(1),
    ...overrides,
  };
}

function repeat(row: AuditLogRow, count: number, spanDays = 6): AuditLogRow[] {
  const out: AuditLogRow[] = [];
  for (let i = 0; i < count; i++) {
    const daysAgo = spanDays * (i / Math.max(1, count - 1));
    out.push({ ...row, created_at: isoAgo(daysAgo) });
  }
  return out;
}

describe("resolveWindow", () => {
  it("returns 7-day window ending at now by default", () => {
    const w = resolveWindow({ now: NOW });
    expect(w.end.toISOString()).toBe(NOW.toISOString());
    expect(w.start.toISOString()).toBe(isoAgo(7));
    expect(w.threshold).toBe(DEFAULT_ANOMALY_THRESHOLD);
    expect(w.actions).toBeInstanceOf(Set);
    for (const a of DEFAULT_ANOMALY_ACTIONS) {
      expect(w.actions!.has(a)).toBe(true);
    }
  });

  it("treats empty actions array as wildcard (null)", () => {
    const w = resolveWindow({ now: NOW, actions: [] });
    expect(w.actions).toBeNull();
  });

  it("respects custom windowDays and threshold, ignoring non-positive values", () => {
    const w = resolveWindow({ now: NOW, windowDays: 30, threshold: 42 });
    expect(w.threshold).toBe(42);
    expect(w.start.toISOString()).toBe(isoAgo(30));

    const fallback = resolveWindow({ now: NOW, windowDays: 0, threshold: -1 });
    expect(fallback.threshold).toBe(DEFAULT_ANOMALY_THRESHOLD);
    expect(fallback.start.toISOString()).toBe(isoAgo(DEFAULT_ANOMALY_WINDOW_DAYS));
  });
});

describe("detectActorHotspots", () => {
  it("flags an actor whose count meets the threshold", () => {
    const rows = repeat(makeRow(), 200);
    const hotspots = detectActorHotspots(rows, { now: NOW });
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0]).toMatchObject({
      reseller_id: "reseller-a",
      actor_user_id: "actor-1",
      count: 200,
      distinct_subjects: 1,
      threshold: 200,
    });
    expect(hotspots[0].actions).toEqual(["view_customer_drawer"]);
  });

  it("ignores actors under the threshold", () => {
    const rows = repeat(makeRow(), 199);
    expect(detectActorHotspots(rows, { now: NOW })).toHaveLength(0);
  });

  it("counts distinct subjects across the window", () => {
    const rows: AuditLogRow[] = [];
    for (let i = 0; i < 250; i++) {
      rows.push(makeRow({ subject_user_id: `subj-${i % 10}`, created_at: isoAgo(i / 60) }));
    }
    const [h] = detectActorHotspots(rows, { now: NOW });
    expect(h.distinct_subjects).toBe(10);
    expect(h.count).toBe(250);
  });

  it("drops rows outside the window and rows without required identifiers", () => {
    const rows: AuditLogRow[] = [
      ...repeat(makeRow(), 100),
      // outside window (8 days ago)
      makeRow({ created_at: isoAgo(8) }),
      // missing identifiers
      makeRow({ reseller_id: "" }),
      makeRow({ actor_user_id: "" }),
      // wrong action (default action filter drops these)
      makeRow({ action: "grant_credits" }),
      // malformed timestamp
      makeRow({ created_at: "not-a-date" }),
    ];
    const hotspots = detectActorHotspots(rows, { now: NOW, threshold: 100 });
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0].count).toBe(100);
  });

  it("segregates buckets by reseller_id even for the same actor", () => {
    const rows = [
      ...repeat(makeRow({ reseller_id: "r-a" }), 200),
      ...repeat(makeRow({ reseller_id: "r-b" }), 210),
    ];
    const hotspots = detectActorHotspots(rows, { now: NOW });
    expect(hotspots).toHaveLength(2);
    // Sorted by count DESC
    expect(hotspots[0].reseller_id).toBe("r-b");
    expect(hotspots[1].reseller_id).toBe("r-a");
  });

  it("respects a custom actions allowlist and wildcard (empty array)", () => {
    const rows = [
      ...repeat(makeRow({ action: "grant_credits" }), 100),
      ...repeat(makeRow({ action: "reveal_email" }), 105),
    ];

    // default actions → only reveal_email counts, under threshold 200
    expect(detectActorHotspots(rows, { now: NOW })).toHaveLength(0);

    // custom allowlist covering only grants → under threshold
    expect(
      detectActorHotspots(rows, { now: NOW, actions: ["grant_credits"], threshold: 100 }),
    ).toHaveLength(1);

    // wildcard → sum of 205 exceeds threshold 200
    const combined = detectActorHotspots(rows, { now: NOW, actions: [] });
    expect(combined).toHaveLength(1);
    expect(combined[0].count).toBe(205);
    expect(combined[0].actions).toEqual(["grant_credits", "reveal_email"]);
  });
});

describe("detectSubjectHotspots", () => {
  it("flags a subject viewed above the threshold, counting distinct actors", () => {
    const rows: AuditLogRow[] = [];
    for (let i = 0; i < 220; i++) {
      rows.push(makeRow({ actor_user_id: `actor-${i % 3}`, subject_user_id: "victim" }));
    }
    const hotspots = detectSubjectHotspots(rows, { now: NOW });
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0]).toMatchObject({
      subject_user_id: "victim",
      count: 220,
      distinct_actors: 3,
    });
  });

  it("ignores rows without a subject_user_id", () => {
    const rows = [
      ...repeat(makeRow({ subject_user_id: null }), 300),
      ...repeat(makeRow({ subject_user_id: "s1" }), 205),
    ];
    const hotspots = detectSubjectHotspots(rows, { now: NOW });
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0].subject_user_id).toBe("s1");
    expect(hotspots[0].count).toBe(205);
  });
});

describe("buildAnomalySummary", () => {
  it("assembles both hotspot lists plus a total-rows counter", () => {
    const rows = [
      ...repeat(makeRow({ actor_user_id: "a-1", subject_user_id: "s-1" }), 205),
      ...repeat(makeRow({ actor_user_id: "a-2", subject_user_id: "s-2" }), 5),
    ];
    const summary = buildAnomalySummary(rows, { now: NOW });
    expect(summary.actor_hotspots).toHaveLength(1);
    expect(summary.subject_hotspots).toHaveLength(1);
    expect(summary.total_rows_in_window).toBe(210);
    expect(summary.threshold).toBe(DEFAULT_ANOMALY_THRESHOLD);
    expect(summary.window_start).toBe(isoAgo(DEFAULT_ANOMALY_WINDOW_DAYS));
    expect(summary.window_end).toBe(NOW.toISOString());
  });

  it("returns empty lists when nothing exceeds the threshold", () => {
    const rows = repeat(makeRow(), 10);
    const summary = buildAnomalySummary(rows, { now: NOW });
    expect(summary.actor_hotspots).toHaveLength(0);
    expect(summary.subject_hotspots).toHaveLength(0);
    expect(summary.total_rows_in_window).toBe(10);
  });
});
