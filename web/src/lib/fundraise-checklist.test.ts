import { describe, it, expect } from "vitest";
import {
  buildChecklist,
  computeReadinessScore,
  groupChecklistByCategory,
  type ChecklistItem,
} from "./fundraise-checklist";

describe("buildChecklist", () => {
  it("returns between 15 and 25 items for every stage", () => {
    for (const stage of ["pre-seed", "seed", "series-a"] as const) {
      const items = buildChecklist({ stage, sviAnalysis: {} });
      expect(items.length).toBeGreaterThanOrEqual(15);
      expect(items.length).toBeLessThanOrEqual(25);
    }
  });

  it("marks every item as missing when SVI analysis is empty", () => {
    const items = buildChecklist({ stage: "seed", sviAnalysis: {} });
    expect(items.every((i) => i.status === "missing")).toBe(true);
  });

  it("marks items done when the matching SVI signals are set", () => {
    const items = buildChecklist({
      stage: "seed",
      sviAnalysis: {
        signals: {
          hasSha: true,
          hasIpAssignment: true,
          hasPitchDeck: true,
        },
      },
    });
    const byId = Object.fromEntries(items.map((i) => [i.id, i.status]));
    expect(byId["legal-sha"]).toBe("done");
    expect(byId["legal-ip"]).toBe("done");
    expect(byId["dr-pitch-deck"]).toBe("done");
    expect(byId["legal-privacy"]).toBe("missing");
  });

  it("infers partial vs done from SVI dimension scores", () => {
    const items = buildChecklist({
      stage: "seed",
      sviAnalysis: {
        dimensions: {
          problem: 80, // done
          market: 50, // partial
          growth: 10, // missing
        },
      },
    });
    const byId = Object.fromEntries(items.map((i) => [i.id, i.status]));
    expect(byId["story-problem"]).toBe("done");
    expect(byId["story-market"]).toBe("partial");
    expect(byId["metrics-growth"]).toBe("missing");
  });
});

describe("computeReadinessScore", () => {
  it("returns 0 / not-ready when nothing is complete and SVI is 0", () => {
    const items = buildChecklist({ stage: "seed", sviAnalysis: {} });
    const result = computeReadinessScore(items, 0);
    expect(result.score).toBe(0);
    expect(result.band).toBe("not-ready");
  });

  it("returns ready when every item is done and SVI is strong", () => {
    const items: ChecklistItem[] = buildChecklist({ stage: "pre-seed", sviAnalysis: {} }).map(
      (i) => ({ ...i, status: "done" as const }),
    );
    const result = computeReadinessScore(items, 90);
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.band).toBe("ready");
  });

  it("returns nearly-ready when checklist is roughly half done", () => {
    const items: ChecklistItem[] = buildChecklist({ stage: "pre-seed", sviAnalysis: {} }).map(
      (i, idx) => ({ ...i, status: idx % 2 === 0 ? "done" : "missing" }),
    );
    const result = computeReadinessScore(items, 50);
    expect(result.band).toBe("nearly-ready");
    expect(result.score).toBeGreaterThan(40);
    expect(result.score).toBeLessThan(75);
  });
});

describe("groupChecklistByCategory", () => {
  it("groups items into all six category buckets", () => {
    const items = buildChecklist({ stage: "series-a", sviAnalysis: {} });
    const groups = groupChecklistByCategory(items);
    expect(Object.keys(groups).sort()).toEqual(
      ["cap-table", "data-room", "legal", "metrics", "story", "team"].sort(),
    );
    const total = Object.values(groups).reduce((s, arr) => s + arr.length, 0);
    expect(total).toBe(items.length);
  });
});
