// BlockID Cohort Report PDF (G21 P2-C) — colocated suite (pdf vitest project).
//
//   - renders a real PDF (3+ pages) with the cover, the movement tiles, the
//     dimension table, the benchmark line, evidence completion, outputs,
//     the human-review sentence, the startups, the signature block and the
//     footer with the operator + "not financial advice";
//   - an empty cohort still renders (no throw), with the not-enough line;
//   - the text never carries an agent count or private notes.

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { buildCohortReport, type CohortReportInput, type CohortReportStartup } from "@/lib/evaluations/cohort-report";
import { pdfPageCount } from "./page-count";
import { COHORT_REPORT_FOOTER, renderCohortReportPdf } from "./cohort-report-pdf";

async function fullText(buffer: Buffer): Promise<string> {
  expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => p.text.replace(/\s+/g, " ")).join("\n");
  } finally {
    await parser.destroy();
  }
}

let n = 0;
function startup(over: Partial<CohortReportStartup> = {}): CohortReportStartup {
  n += 1;
  return {
    itemId: n,
    projectId: `p-${n}`,
    name: `Startup ${n}`,
    status: "done",
    svi: 55 + n,
    confidence: 48,
    verification: 2,
    stage: 3,
    delta: 1,
    topStrength: "Founder & Team",
    topGap: "Traction & Revenue",
    dimensionScores: { ftv: 70, mpc: 60, ptd: 55, tre: 30, cgh: 50, iri: 45, lco: 65, svm: 58 },
    decision: "proceed",
    assessmentStatus: "submitted",
    shortlisted: false,
    evidenceLevels: { ftv: 3 },
    evidenceCompletionPct: 15,
    dossierProduced: true,
    feedbackLetterSent: false,
    reportUrl: null,
    ...over,
  };
}

function input(over: Partial<CohortReportInput> = {}): CohortReportInput {
  return {
    programName: "Acme Accelerator",
    cohortName: "Cohort 5",
    periodLabel: "Q3 2026",
    generatedAt: "2026-09-20T03:00:00.000Z",
    weights: null,
    startups: Array.from({ length: 12 }, () => startup()),
    snapshots: [
      { id: "s1", takenAt: "2026-09-01T00:00:00Z", rows: Array.from({ length: 12 }, (_, i) => ({ projectId: `p-${i + 1}`, itemId: i + 1, svi: 50 + i, confidence: 40, dimensionScores: { tre: 25 } })) },
      { id: "s2", takenAt: "2026-09-15T00:00:00Z", rows: Array.from({ length: 12 }, (_, i) => ({ projectId: `p-${i + 1}`, itemId: i + 1, svi: 56 + i, confidence: 48, dimensionScores: { tre: 31 } })) },
    ],
    overridesCount: 2,
    reviewer: { name: "Pat Program", role: "Program owner" },
    ...over,
  };
}

describe("renderCohortReportPdf", () => {
  it("renders every section with the footer, the entity and the signature block", async () => {
    const data = buildCohortReport(input());
    const { buffer, pages } = await renderCohortReportPdf(data);
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(pdfPageCount(buffer)).toBe(pages);
    const text = await fullText(buffer);
    const squashed = text.replace(/\s/g, "");
    expect(squashed).toContain("BLOCKIDCOHORTREPORT");
    expect(text).toContain("Cohort 5");
    expect(text).toContain("Prepared by Acme Accelerator");
    expect(text).toContain("Cohort movement");
    expect(text).toContain("Median improvement per dimension");
    expect(text).toContain("Traction & Revenue");
    expect(text).toMatch(/indicative — median \d+.*\(n = 12\)/);
    expect(text).toContain("Evidence completion");
    expect(text).toContain("Outputs");
    expect(text).toContain("Humans made every decision");
    expect(text).toContain("2 reviewer overrides");
    expect(text).toContain("Reviewer signature");
    expect(text).toContain("Pat Program");
    expect(text).toContain(COHORT_REPORT_FOOTER);
    expect(text).toContain(LEGAL_ENTITY.operator);
    expect(text).toMatch(/page 1\/\d+/);
    expect(text).not.toMatch(/\d+ (AI )?agents|C-Level/);
  });

  it("an empty cohort renders the not-enough line without throwing", async () => {
    const data = buildCohortReport(input({ startups: [], snapshots: [], overridesCount: 0, reviewer: null }));
    const { buffer, pages } = await renderCohortReportPdf(data);
    expect(pages).toBeGreaterThanOrEqual(2);
    const text = await fullText(buffer);
    expect(text).toContain("Not enough comparable companies");
    expect(text).toContain("No startup in this cohort yet");
    expect(text).toContain("____________________");
  });
});
