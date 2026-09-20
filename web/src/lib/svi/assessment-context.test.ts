import { describe, expect, it } from "vitest";
import { stageBenchmarkFromScores } from "./assessment-context";

describe("stageBenchmarkFromScores — the card's benchmark under the n-rule (G21 P1)", () => {
  it("n < 10 → null (no benchmark line at all)", () => {
    expect(stageBenchmarkFromScores([50, 60, 70, 55, 65, 40, 80, 45, 62])).toBeNull();
    expect(stageBenchmarkFromScores([])).toBeNull();
  });
  it("10–29 → indicative with the median and n", () => {
    const scores = Array.from({ length: 14 }, (_, i) => 40 + i * 2);
    expect(stageBenchmarkFromScores(scores)).toEqual({ median: 53, n: 14, label: "indicative" });
  });
  it("30+ → benchmark; 100+ → segmented", () => {
    expect(stageBenchmarkFromScores(Array.from({ length: 31 }, () => 60))?.label).toBe("benchmark");
    expect(stageBenchmarkFromScores(Array.from({ length: 120 }, () => 60))?.label).toBe("segmented");
  });
  it("ignores non-finite scores when counting n", () => {
    const scores = [...Array.from({ length: 9 }, () => 60), Number.NaN, Number.POSITIVE_INFINITY];
    expect(stageBenchmarkFromScores(scores)).toBeNull();
  });
});

import { latestScorePerProject } from "./assessment-context";

describe("latestScorePerProject — n counts companies, not analysis rows (review P0)", () => {
  it("55 rows from 3 projects → 3 scores (the newest per project), guest rows ignored", () => {
    const rows = [
      ...Array.from({ length: 50 }, (_, i) => ({ project_id: "p1", total_svi: 60 + (i % 3), stage: 4 })),
      { project_id: "p2", total_svi: 70, stage: 4 },
      { project_id: "p2", total_svi: 65, stage: 4 },
      { project_id: "p3", total_svi: 55, stage: 4 },
      { project_id: null, total_svi: 90, stage: 4 },
      { project_id: null, total_svi: 91, stage: 4 },
    ];
    expect(latestScorePerProject(rows, 4)).toEqual([60, 70, 55]);
    expect(stageBenchmarkFromScores(latestScorePerProject(rows, 4))).toBeNull();
  });
  it("a company whose newest analysis moved to another stage no longer counts at the old stage", () => {
    const rows = [
      { project_id: "p1", total_svi: 72, stage: 5 },
      { project_id: "p1", total_svi: 61, stage: 4 },
    ];
    expect(latestScorePerProject(rows, 4)).toEqual([]);
    expect(latestScorePerProject(rows, 5)).toEqual([72]);
  });
});
