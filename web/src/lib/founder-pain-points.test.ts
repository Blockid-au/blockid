import { describe, expect, it } from "vitest";
import {
  FOUNDER_PAIN_POINTS,
  PAIN_POINT_CATEGORIES,
  PAIN_POINT_STAGES,
  queryFounderPainPoints,
} from "./founder-pain-points";

describe("founder-pain-points", () => {
  it("ships at least one entry per stage so the widget never renders empty", () => {
    for (const stage of PAIN_POINT_STAGES) {
      const rows = FOUNDER_PAIN_POINTS.filter((p) => p.stage === stage);
      expect(rows.length, `stage ${stage}`).toBeGreaterThan(0);
    }
  });

  it("uses only the declared category + stage enums so /api can validate query params without drift", () => {
    for (const p of FOUNDER_PAIN_POINTS) {
      expect(PAIN_POINT_STAGES).toContain(p.stage);
      expect(PAIN_POINT_CATEGORIES).toContain(p.category);
    }
  });

  it("gives every entry a concrete recommendation + source so downstream agents cite evidence", () => {
    for (const p of FOUNDER_PAIN_POINTS) {
      expect(p.recommendation.length, p.id).toBeGreaterThan(30);
      expect(p.source.length, p.id).toBeGreaterThan(10);
    }
  });

  it("filters by stage, category, and substring", () => {
    const seed = queryFounderPainPoints({ stage: "seed" });
    expect(seed.every((p) => p.stage === "seed")).toBe(true);

    const capital = queryFounderPainPoints({ category: "capital" });
    expect(capital.every((p) => p.category === "capital")).toBe(true);

    const churn = queryFounderPainPoints({ q: "churn" });
    expect(churn.length).toBeGreaterThan(0);
    for (const p of churn) {
      const hay = `${p.symptom} ${p.rootCause} ${p.recommendation}`.toLowerCase();
      expect(hay.includes("churn")).toBe(true);
    }
  });

  it("clamps limit between 1 and 25", () => {
    expect(queryFounderPainPoints({ limit: 0 }).length).toBeLessThanOrEqual(25);
    expect(queryFounderPainPoints({ limit: 1 }).length).toBe(1);
    expect(queryFounderPainPoints({ limit: 999 }).length).toBeLessThanOrEqual(25);
  });
});
