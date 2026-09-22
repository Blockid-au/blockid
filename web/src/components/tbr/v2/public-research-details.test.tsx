import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicResearchResult } from "@/lib/research/public-source-contract";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { PublicResearchDetails } from "./public-research-details";
import { TbrAppendix } from "./appendix";
const research: PublicResearchResult = {
  version: "public-sources-v1", status: "found", task: { criterion: "market", question: "Who are the main competitors?", businessScope: { name: "Clinic Business", projectId: "p" } },
  sources: [{ id: "s1", url: "https://example.com/pricing", title: "Clinic product", role: "market_or_alternative", status: "found", reason: "page_read_claim_support_not_assessed", fetchedAt: "2026-09-22T09:00:00.000Z", publishedAt: null, contentSha256: "hash", excerpt: "A scheduling tool for clinics.", relevance: "not_assessed", citable: false }],
  discovery: { status: "not_run", reason: "not_configured" }, limits: { requested: 1, attempted: 1, maxSources: 5, targetAlternatives: 5, verifiedAlternatives: 0 }, instruction: "untrusted",
};
describe("public research details", () => {
  it("omits legacy reports without research records", () => {
    expect(renderToStaticMarkup(<PublicResearchDetails />)).toBe("");
  });
  it("shows limited coverage, exact excerpt/date and safe links without claiming verified competitors", () => {
    const html = renderToStaticMarkup(<PublicResearchDetails research={research} />);
    expect(html).toContain("Pages read: 1"); expect(html).toContain("Relevance not yet checked");
    expect(html).toContain("A scheduling tool for clinics."); expect(html).toContain("2026-09-22 09:00:00 UTC");
    expect(html).toContain('href="#tbr-dashboard"'); expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Not yet supporting a report conclusion");
    expect(html.match(/<details/g)).toHaveLength(2); expect(html).not.toContain("<details open");
  });
  it("localizes investor-facing details in Vietnamese", () => {
    const html = renderToStaticMarkup(<PublicResearchDetails research={research} locale="vi" />);
    expect(html).toContain("Nguồn công khai đã kiểm tra"); expect(html).toContain("Chưa đối chiếu mức độ liên quan"); expect(html).toContain("Về tổng quan báo cáo");
  });
  it("shows blocked reason without exposing a signed or unsafe link", () => {
    for (const [url, reason] of [["https://example.com/?token=SECRET", "public_url_required"], ["https://127.0.0.1/", "unsafe_network_destination"]]) {
      const blocked = { ...research, sources: [{ ...research.sources[0], status: "blocked" as const, url, reason, fetchedAt: null, excerpt: "" }] };
      const html = renderToStaticMarkup(<PublicResearchDetails research={blocked} />);
      expect(html).not.toContain(url); expect(html).not.toContain("SECRET"); expect(html).toContain("Could not read");
    }
  });
  it("renders already-collected evidence on the free report appendix without a charge or unlock action", () => {
    const report = demoReportV2(); report.tier = "free"; report.appendix.publicResearch = research;
    const html = renderToStaticMarkup(<TbrAppendix report={report} title="Appendix" />);
    expect(html).toContain("data-tbr-public-research"); expect(html).toContain("A scheduling tool for clinics.");
  });
  it("renders excerpt HTML as text and explains omitted sources", () => {
    const altered = { ...research, limits: { ...research.limits, requested: 6 }, sources: [{ ...research.sources[0], excerpt: '<script>alert("x")</script>' }] };
    const html = renderToStaticMarkup(<PublicResearchDetails research={altered} />);
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;"); expect(html).toContain("outside this run’s source limit");
  });
});
