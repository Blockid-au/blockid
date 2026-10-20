import { describe, expect, it } from "vitest";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { investorPackDataFromReport, reviewCompleteness } from "./investor-pack";
import type { ReviewItem } from "./detail";

const item = (ref: string, dims: string[], decision: "accept" | "reject" | null, kind: ReviewItem["kind"] = "hub"): ReviewItem =>
  ({ ref, kind, dims, title: ref, detail: null, href: null, level: null, status: null, source: null, decision, note: null, decidedAt: null }) as ReviewItem;

describe("Investor Pack from the reviewed report", () => {
  it("maps the ReportV2 cover: name, sector, uncapped SVI (no '/ 1000'), 8 dimension scores, badge on the cover", () => {
    const report = demoReportV2();
    const data = investorPackDataFromReport(report, { reviewBadge: "BlockID Reviewed · 22 Oct 2026 · Long Do", reviewedAt: "2026-10-22T03:00:00.000Z" });
    expect(data.startup).toMatchObject({ name: report.cover.startupName, asOfDate: "2026-10-22" });
    expect(data.svi.score).toBe(report.cover.svi.total);
    expect(data.svi.scoreSuffix).toBe("SVI");
    expect(data.svi.criteria).toHaveLength(13);
    const tre = data.svi.criteria.find((c) => c.id === "tre")!;
    expect(tre.score).toBe(report.cover.dims.tre.band === "pending" ? Number.NaN : report.cover.dims.tre.score);
    expect(Number.isNaN(data.svi.criteria.find((c) => c.id === "esg")!.score)).toBe(true);
    expect(data.reviewBadge).toBe("BlockID Reviewed · 22 Oct 2026 · Long Do");
    expect(data.teaser?.oneliner).not.toMatch(/\[ev:/);
  });

  it("evidence completeness = accepted / decided per dimension; claims and undecided items ignored", () => {
    const c = reviewCompleteness(
      [item("a", ["tre"], "accept"), item("b", ["tre"], "reject"), item("c", ["lco"], "accept"), item("d", ["lco"], null), item("e", ["tre"], "reject", "claim")],
      "2026-10-22",
    )!;
    expect(c.overallPercent).toBe(67);
    expect(c.rows.find((r) => r.dimension === "tre")).toMatchObject({ completenessPercent: 50, presentCount: 1, totalCount: 2 });
    expect(c.rows.find((r) => r.dimension === "lco")).toMatchObject({ completenessPercent: 100, status: "Strong" });
    expect(reviewCompleteness([item("x", ["tre"], null)], "2026-10-22")).toBeUndefined();
  });
});
