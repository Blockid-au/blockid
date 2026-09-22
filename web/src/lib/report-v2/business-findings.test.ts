import { describe, expect, it } from "vitest";
import { projectBusinessFindings } from "./business-findings";
import { demoReportV2 } from "./fixtures";
import { sampleIntake } from "@/lib/analyses/first-analysis/fixtures";

const problem = "Our business helps regional wholesalers reconcile invoices.";
function intake() {
  const input = sampleIntake();
  input.rawText = problem;
  input.structured = {
    deckSections: {
      problem: [problem],
      market: ["A$4 billion market invented by a classifier"],
      team: [],
      product: [],
      solution: [],
      traction: [],
      ask: [],
      other: [],
    },
  };
  return input;
}

describe("business findings projection", () => {
  it("keeps every business area and separately explains problem and market uncertainty", () => {
    const findings = projectBusinessFindings({ intake: intake() });
    expect(findings.map((f) => f.id)).toEqual([
      "ftv",
      "mpc-problem",
      "mpc-market",
      "ptd",
      "tre",
      "cgh",
      "iri",
      "lco",
      "svm",
    ]);
    expect(findings.every((f) => f.state === "preliminary")).toBe(true);
    expect(findings.find((f) => f.id === "mpc-problem")?.requests[0]).toContain(
      "who decides to pay",
    );
    expect(findings.find((f) => f.id === "mpc-market")?.requests[0]).toContain(
      "distribution constraints",
    );
    expect(findings.find((f) => f.id === "mpc-market")?.implication).toContain(
      "reachable revenue",
    );
  });
  it("only shows original input excerpts and never a classifier's fabricated source", () => {
    const findings = projectBusinessFindings({ intake: intake() });
    expect(
      findings.find((f) => f.id === "mpc-problem")?.sources[0].detail,
    ).toBe(problem);
    expect(JSON.stringify(findings)).not.toContain("A$4 billion");
    expect(findings.find((f) => f.id === "mpc-market")?.sources).toEqual([]);
  });
  it("does not infer missing business capability from missing extraction", () => {
    const findings = projectBusinessFindings({});
    expect(
      findings.every((f) =>
        f.uncertainty[0].includes("does not mean the business lacks"),
      ),
    ).toBe(true);
    expect(findings.every((f) => f.sources.length === 0)).toBe(true);
  });
  it("preserves final corrected content and every criterion instead of preview evidence", () => {
    const report = demoReportV2();
    report.source = "pipeline";
    report.dimensions[1].verdict =
      "The claimed wholesale TAM includes retail buyers outside the launch scope.";
    report.dimensions[1].gaps = [
      "Regional eligible buyer counts remain unknown.",
    ];
    const findings = projectBusinessFindings({ report, intake: intake() });
    expect(findings).toHaveLength(8);
    expect(findings[1].summary).toBe(report.dimensions[1].verdict);
    expect(findings[1].uncertainty).toContain(report.dimensions[1].gaps[0]);
    expect(findings.flatMap((f) => f.criteria).length).toBe(
      report.dimensions.flatMap((d) => d.criteria).length,
    );
    expect(JSON.stringify(findings)).not.toContain(problem);
  });
  it("labels legacy adapters and failed chapter fallbacks as limited, not fully assessed", () => {
    const report = demoReportV2();
    report.source = "adapter";
    expect(
      projectBusinessFindings({ report }).every((f) => f.state === "limited"),
    ).toBe(true);
    report.source = "pipeline";
    report.dimensions[0].degraded = true;
    expect(projectBusinessFindings({ report })[0].state).toBe("limited");
  });
  it("uses Vietnamese reading guidance without translating or fabricating source material", () => {
    const findings = projectBusinessFindings({
      intake: intake(),
      locale: "vi",
    });
    const p = findings.find((f) => f.id === "mpc-problem")!;
    expect(p.title).toBe("Vấn đề của khách hàng");
    expect(p.requests[0]).toContain("ai quyết định chi tiền");
    expect(p.sources[0].detail).toBe(problem);
  });
});
