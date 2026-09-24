import { describe, expect, it } from "vitest";
import { demoReportV2, freeFixtureReportV2 } from "./fixtures";
import { buildCriteriaSummary } from "./criteria-summary";

 describe("stored criteria summary", () => {
  it("preserves a saved verdict and zero citations without scoring missing criteria", () => {
    const report = demoReportV2();
    const criterion = report.dimensions[0].criteria[0];
    criterion.verdict = "Saved assessment";
    criterion.citations = [];
    criterion.score = 0;
    report.dimensions.forEach((ch, i) => { ch.criteria = i === 0 ? [criterion] : []; });
    const rows = buildCriteriaSummary(report, "en");
    expect(rows).toHaveLength(13);
    expect(rows.find(r => r.key === criterion.key)).toMatchObject({ finding: "Saved assessment", score: 0, evidenceCount: 0, state: "assessed" });
    expect(rows.filter(r => r.state === "missing")).toHaveLength(12);
    expect(rows.filter(r => r.state === "missing").every(r => r.evidenceCount === null && r.score === null)).toBe(true);
  });
  it("redacts free card findings and counts; an explicitly unlocked view can expose stored results", () => {
    const report = freeFixtureReportV2();
    const card = report.dimensions.find(ch => ch.renderAs === "card")!;
    card.criteria[0].verdict = "PRIVATE FINDING";
    const row = buildCriteriaSummary(report, "en").find(r => r.key === card.criteria[0].key)!;
    expect(row).toMatchObject({ state: "locked", finding: "Details in the full report", score: null, evidenceCount: null, dim: undefined });
    expect(buildCriteriaSummary(report, "en", false).find(r => r.key === row.key)?.finding).toBe("PRIVATE FINDING");
  });
});
