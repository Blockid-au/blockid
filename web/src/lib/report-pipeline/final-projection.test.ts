import { describe, expect, it } from "vitest";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { mergeFinalCriteria, projectFinalSelectedChapters, projectFinalReport, readFinalProjection, replaceFinalDimensions } from "./final-projection";

describe("canonical final projection client replacement", () => {
  it("replaces corrected prose/score while preserving expansion and untouched retry sections", () => {
    const doc = demoReportV2();
    const tre = doc.dimensions.find(d => d.dim === "tre")!;
    tre.verdict = "Revenue requires source verification.";
    tre.score = 42;
    const projection = projectFinalReport(doc, "generated-report", ["tre"])!;
    const previous = { tre: { score: 99, markdown: "A$12k MRR", expanded: true }, mpc: { score: 73, markdown: "keep", expanded: false } };
    const next = replaceFinalDimensions(previous, projection);
    expect(next.tre).toMatchObject({ score: 42, expanded: true });
    expect(next.tre.markdown).not.toContain("A$12k");
    expect(next.mpc).toEqual(previous.mpc);
    expect(previous.tre.score).toBe(99);
    expect(projection.totalSVI).toBeNull();
    expect(readFinalProjection(JSON.parse(JSON.stringify(projection)))).toEqual(projection);
  });
  it("merges only selected criterion replacements, but full projection replaces the whole list", () => {
    const previous = [{ key: "market", verdict: "keep" }, { key: "revenue", verdict: "preview" }];
    const incoming = [{ key: "revenue", verdict: "final" }];
    expect(mergeFinalCriteria(previous, incoming, "partial")).toEqual([{ key: "market", verdict: "keep" }, { key: "revenue", verdict: "final" }]);
    expect(mergeFinalCriteria(previous, incoming, "full")).toEqual(incoming);
  });
  it("rejects malformed restored projections and retains canonical full SVI including zero", () => {
    const doc = demoReportV2();
    doc.cover.svi.total = 0;
    const p = projectFinalReport(doc, "generated-report")!;
    expect(readFinalProjection(p)?.totalSVI).toBe(0);
    expect(readFinalProjection({ ...p, dimensions: p.dimensions.slice(1) })).toBeNull();
    expect(readFinalProjection({ ...p, version: 0 })).toBeNull();
    expect(readFinalProjection({ ...p, dimensions: [null, ...p.dimensions.slice(1)] })).toBeNull();
    expect(readFinalProjection({ ...p, totalSVI: NaN })).toBeNull();
  });
});

it("partial projection refuses missing or incomplete audited chapters", () => {
  const chapters = demoReportV2().dimensions;
  expect(projectFinalSelectedChapters(undefined, "report", ["tre"])).toBeNull();
  expect(projectFinalSelectedChapters(chapters.filter(c => c.dim !== "tre"), "report", ["tre"])).toBeNull();
  expect(projectFinalSelectedChapters(chapters, "report", ["tre"])?.dimensions.map(c => c.dimension)).toEqual(["tre"]);
});
