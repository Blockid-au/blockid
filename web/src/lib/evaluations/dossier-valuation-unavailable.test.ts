import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { unavailableValuation } from "@/lib/report-v2/schema";
import { buildValuationBlock } from "./dossier-blocks";

describe("unavailable valuation in evaluator dossier", () => {
  it("does not create a comparison chart or numeric IC-report inputs", () => {
    const report: import("@/lib/report-v2/schema").ReportV2 = demoReportV2();
    report.valuation = unavailableValuation("missing_or_invalid_revenue", report.generatedAt, ["current_revenue"]);
    const view = buildValuationBlock(report, { valuationView: { low_aud: 5000000, high_aud: 8000000 } } as never);
    expect(view).toMatchObject({ available: false, pending: true, consensus: null, methods: [], ask: null, sectorMultiples: null, scenarios: null, rangeBars: null });
  });
});
