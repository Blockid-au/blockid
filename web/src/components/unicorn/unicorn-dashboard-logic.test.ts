// Colocated 8-case suite for the pure dashboard-logic helpers.
// Since @testing-library/react isn't installed here we test the shape
// projections that back the SVG spiral, trust arc, radar, blocker
// queue, and investor histogram.

import { describe, it, expect } from "vitest";
import {
  buildSpiralNodes,
  buildTrustArc,
  buildRadarPoints,
  RADAR_AREAS,
  topBlockers,
  stageHistogram,
  daysInStage,
} from "./unicorn-dashboard-logic";

describe("unicorn-dashboard-logic — spiral", () => {
  it("[1] emits 6 nodes with past/current/future classification", () => {
    const nodes = buildSpiralNodes("S2");
    expect(nodes.length).toBe(6);
    expect(nodes.filter((n) => n.state === "past").map((n) => n.id)).toEqual([
      "S0",
      "S1",
    ]);
    expect(nodes.find((n) => n.state === "current")?.id).toBe("S2");
    expect(nodes.filter((n) => n.state === "future").map((n) => n.id)).toEqual([
      "S3",
      "S4",
      "S5",
    ]);
  });

  it("[2] each node coordinate lies within the unit disk", () => {
    for (const n of buildSpiralNodes("S0")) {
      const dist = Math.sqrt(n.x * n.x + n.y * n.y);
      expect(dist).toBeGreaterThan(0);
      expect(dist).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe("unicorn-dashboard-logic — trust arc", () => {
  it("[3] score 0 produces a filled path of zero sweep", () => {
    const arc = buildTrustArc(0, 80, 100, 100);
    expect(arc.markerX).toBeCloseTo(20, 1); // cos(π) * 80 + 100
    expect(arc.markerY).toBeCloseTo(100, 1);
    expect(arc.fullPath.startsWith("M ")).toBe(true);
  });

  it("[4] score clamps to [0,100]", () => {
    const over = buildTrustArc(999, 80, 100, 100);
    // 100% fills to angle = 2π → marker back at start
    expect(over.markerX).toBeCloseTo(180, 1); // cos(2π) * 80 + 100
    const under = buildTrustArc(-50, 80, 100, 100);
    expect(under.markerX).toBeCloseTo(20, 1);
  });
});

describe("unicorn-dashboard-logic — radar", () => {
  it("[5] emits exactly 12 area points, missing scores default to 0", () => {
    const points = buildRadarPoints({ identity: 80, revenue: 40 });
    expect(points.length).toBe(RADAR_AREAS.length);
    expect(points.length).toBe(12);
    const identity = points.find((p) => p.area === "identity")!;
    expect(identity.value).toBe(80);
    const gtm = points.find((p) => p.area === "gtm")!;
    expect(gtm.value).toBe(0);
  });
});

describe("unicorn-dashboard-logic — blocker queue", () => {
  it("[6] critical > high > medium > low, then oldest first, capped at n", () => {
    const raw = [
      { code: "a", message: "a", severity: "low" as const, createdAt: "2026-01-01" },
      { code: "b", message: "b", severity: "critical" as const, createdAt: "2026-03-01" },
      { code: "c", message: "c", severity: "high" as const, createdAt: "2026-02-01" },
      { code: "d", message: "d", severity: "critical" as const, createdAt: "2026-02-15" },
      { code: "e", message: "e", severity: "medium" as const, createdAt: "2026-01-15" },
      { code: "f", message: "f", severity: "low" as const, createdAt: "2026-01-01" },
    ];
    const top = topBlockers(raw, 3);
    expect(top.map((b) => b.code)).toEqual(["d", "b", "c"]);
  });
});

describe("unicorn-dashboard-logic — histogram", () => {
  it("[7] buckets cohort rows into S0..S5, zero-fills empty stages", () => {
    const h = stageHistogram([
      { currentStageId: "S0" },
      { currentStageId: "S0" },
      { currentStageId: "S3" },
    ]);
    expect(h).toEqual({ S0: 2, S1: 0, S2: 0, S3: 1, S4: 0, S5: 0 });
  });
});

describe("unicorn-dashboard-logic — daysInStage", () => {
  it("[8] computes floor((now - entry)/1d), never negative", () => {
    const now = new Date("2026-07-31T00:00:00Z");
    expect(daysInStage("2026-07-24T00:00:00Z", now)).toBe(7);
    expect(daysInStage("2026-07-31T00:00:00Z", now)).toBe(0);
    // Future entry (clock skew) collapses to 0 not negative.
    expect(daysInStage("2027-01-01T00:00:00Z", now)).toBe(0);
  });
});
