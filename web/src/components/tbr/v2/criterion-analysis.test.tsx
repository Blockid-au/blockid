import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { TbrChapter } from "./chapter";

describe("saved report criterion analysis", () => {
  it("offers saved analysis without starting research or charging for reading", () => {
    const chapter = demoReportV2().dimensions.find((ch) => ch.criteria.length > 0)!;
    chapter.criteria[0].detailedAnalysis = {
      source: "post_audit_criterion", auditKind: "citation_only", status: "supported",
      narrative: "This business sells through a single distributor; renewal evidence is still missing.",
      citations: [{ evidence_id: "distribution", quote: "Single distributor" }],
    };
    const html = renderToStaticMarkup(<TbrChapter chapter={chapter} index={0} forceFull paid={false} />);
    expect(html).toContain("Read detailed analysis");
    expect(html).toContain("This business sells through a single distributor");
    expect(html).toContain("data-tbr-criterion-analysis");
    expect(html).not.toMatch(/<details[^>]*data-tbr-criterion-analysis[^>]*open/);
    expect(html).not.toContain("RE-ANALYZE");
    const vi = renderToStaticMarkup(<TbrChapter chapter={chapter} index={0} forceFull paid={false} locale="vi" />);
    expect(vi).toContain("Xem phân tích chi tiết");
  });
});
