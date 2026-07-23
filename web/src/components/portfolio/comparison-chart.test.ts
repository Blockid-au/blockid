// Cross-project SVI comparison chart — pure-derivation coverage.
//
// The chart component itself is a thin Recharts wrapper; all the shaping
// (series cap, wide-format transform, empty-state signal) lives in
// `deriveComparisonSeries` so we can exercise it without a DOM.
//
// The Y-axis domain [0, 100] is a static prop on <YAxis> in the component
// — we assert it here via a source read so a future edit that widens the
// range trips the test instead of silently drifting the SVI baseline.

import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";
import {
  deriveComparisonSeries,
  PORTFOLIO_COMPARISON_MAX_SERIES,
  type PortfolioRow,
} from "@/lib/portfolio";

type Row = Pick<PortfolioRow, "id" | "name" | "current_svi_score" | "svi_history">;

function makeRow(
  id: string,
  name: string,
  score: number | null,
  history: Array<{ date: string; score: number }> = [],
): Row {
  return { id, name, current_svi_score: score, svi_history: history };
}

describe("comparison-chart — deriveComparisonSeries", () => {
  it("returns null when no project has any svi_history", () => {
    expect(deriveComparisonSeries([])).toBeNull();
    expect(
      deriveComparisonSeries([
        makeRow("a", "Alpha", 42, []),
        makeRow("b", "Beta", 55, []),
      ]),
    ).toBeNull();
  });

  it("renders one series for a single project with one history point", () => {
    const out = deriveComparisonSeries([
      makeRow("a", "Alpha", 42, [{ date: "2026-07-20", score: 42 }]),
    ]);
    expect(out).not.toBeNull();
    expect(out!.series).toHaveLength(1);
    expect(out!.series[0]).toEqual({ id: "a", name: "Alpha", last_score: 42 });
    expect(out!.data).toEqual([{ date: "2026-07-20", a: 42 }]);
    expect(out!.total_projects_with_history).toBe(1);
  });

  it("caps at 5 series (highest-current-SVI wins) and reports total", () => {
    const rows: Row[] = Array.from({ length: 7 }, (_, i) =>
      makeRow(`p${i}`, `Project ${i}`, 100 - i, [
        { date: "2026-07-20", score: 100 - i },
      ]),
    );
    const out = deriveComparisonSeries(rows);
    expect(out).not.toBeNull();
    expect(out!.series).toHaveLength(PORTFOLIO_COMPARISON_MAX_SERIES);
    expect(PORTFOLIO_COMPARISON_MAX_SERIES).toBe(5);
    // Top-5 by current SVI kept.
    expect(out!.series.map((s) => s.id)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
    expect(out!.total_projects_with_history).toBe(7);
  });

  it("unions dates across series and leaves gaps as absent keys", () => {
    const out = deriveComparisonSeries([
      makeRow("a", "Alpha", 60, [
        { date: "2026-07-19", score: 55 },
        { date: "2026-07-20", score: 60 },
      ]),
      makeRow("b", "Beta", 40, [{ date: "2026-07-20", score: 40 }]),
    ]);
    expect(out).not.toBeNull();
    expect(out!.data).toEqual([
      { date: "2026-07-19", a: 55 },
      { date: "2026-07-20", a: 60, b: 40 },
    ]);
    expect(out!.series[0].last_score).toBe(60);
    expect(out!.series[1].last_score).toBe(40);
  });

  it("uses the fixed [0, 100] SVI y-axis domain in the chart", () => {
    // Static assertion against the component source — a future edit that
    // widens the range would trip this test and force an explicit review.
    const src = readFileSync(
      resolve(__dirname, "comparison-chart.tsx"),
      "utf8",
    );
    expect(src).toMatch(/domain=\{\[0,\s*100\]\}/);
  });
});
