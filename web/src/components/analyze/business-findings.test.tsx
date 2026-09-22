import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BusinessFindings } from "./business-findings";
import { AnalyzeResults } from "./analyze-results";
import { projectBusinessFindings } from "@/lib/report-v2/business-findings";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { sampleIntake } from "@/lib/analyses/first-analysis/fixtures";

describe("business findings reader", () => {
  it("exposes all areas in semantic disclosure with material limitations visible in the summary", () => {
    const html = renderToStaticMarkup(
      <BusinessFindings findings={projectBusinessFindings({})} />,
    );
    expect(html.match(/data-finding-state=/g)).toHaveLength(9);
    expect(html.match(/<summary/g)).toHaveLength(9);
    expect(html).toContain("Preview — not a conclusion");
    expect(html).toContain("What to provide next");
    expect(html).toContain(
      "viewing existing detail".replace("viewing", "Viewing"),
    );
    expect(html).not.toContain("<button");
    expect(html).not.toContain("/checkout");
  });
  it("real AnalyzeResults consumer prefers corrected canonical verdict over intake gap fallback", () => {
    const report = demoReportV2();
    report.dimensions[1].verdict =
      "The obtainable market cannot be justified by the deck’s industry total.";
    const html = renderToStaticMarkup(
      <AnalyzeResults intake={sampleIntake()} finalReport={report} />,
    );
    expect(html).toContain("The obtainable market cannot be justified");
    expect(html).toContain("Individual criteria");
    expect(html).toContain("Available sources");
    expect(html).not.toContain("Preview — not a conclusion");
  });
  it("renders Vietnamese labels and readable original text safely", () => {
    const findings = projectBusinessFindings({ locale: "vi" });
    findings[0].summary = '<script>alert("x")</script>';
    const html = renderToStaticMarkup(
      <BusinessFindings findings={findings} locale="vi" />,
    );
    expect(html).toContain("Nội dung đã xem xét");
    expect(html).toContain("Xem trước — chưa kết luận");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("canonical findings preserve qualifications", () => {
  it("shows critical contradictions before opening a detail and keeps criterion citation support limits", () => {
    const report = demoReportV2();
    const chapter = report.dimensions.find((d) => d.criteria.length > 0)!;
    const criterion = chapter.criteria[0];
    criterion.grounded = false;
    criterion.citations = [
      {
        evidence_id: "missing-original",
        quote: "Founder asserts a billion-dollar obtainable market.",
      },
    ];
    report.quality.consistencyIssues = [
      {
        type: "narrative_conflict",
        severity: "high",
        criteria: [criterion.key],
        description:
          "The conclusion assumes revenue that the supplied records do not support.",
      },
    ];
    const html = renderToStaticMarkup(
      <BusinessFindings findings={projectBusinessFindings({ report })} />,
    );
    const issueAt = html.indexOf("The conclusion assumes revenue");
    const correspondingDetails = html.indexOf(`id="finding-${chapter.dim}"`);
    expect(issueAt).toBeGreaterThan(-1);
    expect(issueAt).toBeLessThan(correspondingDetails);
    expect(html).toContain(
      "Support for this assessment has not been fully confirmed.",
    );
    expect(html).toContain("Report citation — check against its source");
    expect(html).toContain("[missing-original]");
    expect(html).toContain("No matching source recorded in this section");
  });
  it("does not mix final findings with old score, heuristic gaps or stale next actions", () => {
    const report = demoReportV2();
    report.cover.svi.total = 42;
    const html = renderToStaticMarkup(
      <AnalyzeResults
        finalReport={report}
        score={99}
        intake={sampleIntake()}
        gaps={[{ dimension: "mpc", label: "STALE GAP", severity: "high" }]}
        actions={[{ title: "STALE ACTION", detail: "Old", priority: "P0" }]}
      />,
    );
    expect(html).toContain(">42<");
    expect(html).not.toContain("STALE GAP");
    expect(html).not.toContain("STALE ACTION");
    expect(html).toContain('href="#analyze-canonical-report"');
  });
});

it("renders detailed investor guidance, targeted requests and provenance inside native criterion disclosures", () => {
  const report = demoReportV2();
  const html = renderToStaticMarkup(<BusinessFindings findings={projectBusinessFindings({ report })} />);
  expect(html).toContain("Investor relevance — diligence guidance");
  expect(html).toContain("Specific diligence question");
  expect(html).toContain("TAM needs relevant buyers");
  expect(html).toContain("Viewing existing detail uses no credits");
  expect(html).not.toContain("/checkout");
  const vietnamese = renderToStaticMarkup(<BusinessFindings locale="vi" findings={projectBusinessFindings({ report, locale: "vi" })} />);
  expect(vietnamese).toContain("Câu hỏi kiểm chứng cụ thể");
  expect(vietnamese).toContain("Chi tiêu toàn ngành");
});
