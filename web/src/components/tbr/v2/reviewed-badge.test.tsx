// G35 Pricing v5 P4 — the "BlockID Reviewed" badge renders in the TBR
// dashboard header only when the server attached `report.reviewBadge`.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { darkSurfaceOffences } from "@/design/light-markup";
import { TbrReportV2 } from "./report";
import { TbrReviewedBadge } from "./reviewed-badge";

const BADGE = { reviewedAt: "2026-10-22T03:00:00.000Z", reviewerName: "Long Do", label: "BlockID Reviewed · 22 Oct 2026 · Long Do" };

describe("TbrReviewedBadge", () => {
  it("renders the label with a machine-readable date, light template", () => {
    const html = renderToStaticMarkup(<TbrReviewedBadge badge={BADGE} />);
    expect(html).toContain("data-tbr-reviewed-badge");
    expect(html).toContain('dateTime="2026-10-22T03:00:00.000Z"');
    expect(html).toContain("BlockID Reviewed · 22 Oct 2026 · Long Do");
    expect(darkSurfaceOffences(html)).toEqual([]);
  });

  it("appears in the report header only when the server attached it", () => {
    const withBadge = renderToStaticMarkup(<TbrReportV2 report={{ ...demoReportV2(), reviewBadge: BADGE }} />);
    const header = withBadge.slice(withBadge.indexOf("data-tbr-dashboard-header"), withBadge.indexOf("data-tbr-dashboard-header") + 4000);
    expect(header).toContain("data-tbr-reviewed-badge");
    expect(renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />)).not.toContain("data-tbr-reviewed-badge");
  });
});
