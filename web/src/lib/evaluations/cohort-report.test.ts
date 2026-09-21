// cohort-report — the BlockID Cohort Report builder + HTML + CSV (G21 P2-C).
//
//   - movement: two snapshots → first / latest / Δ; one → "one snapshot so
//     far"; none → current scores as the latest point + the note;
//   - per-dimension medians first vs latest; benchmark only from n ≥ 10
//     (always with n) else the not-enough line; evidence completion counts
//     ≥ L3; outputs tally submitted decisions only; strengths / gaps
//     counted; human-review sentence carries the override count; signature
//     block; the methodology line never states an agent count;
//   - HTML carries every section + the entity line + the evaluator
//     disclaimer + the nonce-guarded print script; CSV one row per startup,
//     Excel-safe;
//   - the quarterly aliases are still exported from here.

import { describe, expect, it } from "vitest";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { SVI_VERSION } from "@/lib/svi-analysis";
import {
  COHORT_REPORT_CSV_HEADERS,
  COHORT_REPORT_METHODOLOGY,
  buildCohortReport,
  cohortReportCsv,
  cohortReportFilename,
  renderCohortReportHtml,
  renderQuarterlyReportHtml,
  summariseQuarterly,
  type CohortReportInput,
  type CohortReportStartup,
} from "./cohort-report";

let n = 0;
function startup(over: Partial<CohortReportStartup> = {}): CohortReportStartup {
  n += 1;
  return {
    itemId: n,
    projectId: `p-${n}`,
    name: `Startup ${n}`,
    status: "done",
    svi: 60 + n,
    confidence: 50,
    verification: 2,
    stage: 3,
    delta: 2,
    topStrength: "Founder & Team",
    topGap: "Traction & Revenue",
    dimensionScores: { ftv: 70, mpc: 60, ptd: 55, tre: 30, cgh: 50, iri: 45, lco: 65, svm: 58 },
    decision: null,
    assessmentStatus: null,
    shortlisted: false,
    evidenceLevels: { ftv: 3, tre: 5 },
    evidenceCompletionPct: 20,
    dossierProduced: false,
    feedbackLetterSent: false,
    reportUrl: null,
    ...over,
  };
}

function input(over: Partial<CohortReportInput> = {}): CohortReportInput {
  return {
    programName: "Startmate-like Program",
    cohortName: "Cohort 5",
    periodLabel: "Q3 2026",
    generatedAt: "2026-09-20T03:00:00.000Z",
    weights: null,
    startups: [startup({ decision: "proceed", assessmentStatus: "submitted", dossierProduced: true }), startup({ decision: "pass", assessmentStatus: "submitted", feedbackLetterSent: true }), startup({ decision: "track", assessmentStatus: "draft", shortlisted: true })],
    snapshots: [],
    overridesCount: 0,
    reviewer: { name: "Pat Program", role: "Program owner" },
    ...over,
  };
}

describe("buildCohortReport", () => {
  it("no snapshot: current scores are the latest point, the note explains, per-dimension first is empty", () => {
    const d = buildCohortReport(input());
    expect(d.cover).toMatchObject({ cohortName: "Cohort 5", n: 3, scored: 3, methodologyVersion: SVI_VERSION });
    expect(d.cover.entity).toContain(LEGAL_ENTITY.operator);
    expect(d.movement.first).toBeNull();
    expect(d.movement.latest?.medianSvi).toBe(62);
    expect(d.movement.delta).toBeNull();
    expect(d.movement.note).toMatch(/No cohort snapshot yet/);
    expect(d.dimensionImprovement.find((r) => r.key === "tre")).toMatchObject({ first: null, latest: 30, delta: null });
  });

  it("one snapshot → one snapshot so far", () => {
    const d = buildCohortReport(input({ snapshots: [{ id: "s1", takenAt: "2026-09-01T00:00:00Z", rows: [{ projectId: "p-1", itemId: 1, svi: 50, confidence: 40, dimensionScores: { tre: 20 } }] }] }));
    expect(d.movement.first?.medianSvi).toBe(50);
    expect(d.movement.latest).toBeNull();
    expect(d.movement.note).toMatch(/One snapshot so far/);
  });

  it("two snapshots → first / latest / Δ and per-dimension deltas (order-insensitive)", () => {
    const d = buildCohortReport(
      input({
        snapshots: [
          { id: "s2", takenAt: "2026-09-15T00:00:00Z", rows: [{ projectId: "p-1", itemId: 1, svi: 66, confidence: 55, dimensionScores: { tre: 40, ftv: 72 } }, { projectId: "p-2", itemId: 2, svi: 58, confidence: 45, dimensionScores: { tre: 34, ftv: 60 } }] },
          { id: "s1", takenAt: "2026-09-01T00:00:00Z", rows: [{ projectId: "p-1", itemId: 1, svi: 60, confidence: 50, dimensionScores: { tre: 30, ftv: 70 } }, { projectId: "p-2", itemId: 2, svi: 50, confidence: 40, dimensionScores: { tre: 26, ftv: 60 } }] },
        ],
      }),
    );
    expect(d.movement.first?.medianSvi).toBe(55);
    expect(d.movement.latest?.medianSvi).toBe(62);
    expect(d.movement.delta).toBe(7);
    expect(d.movement.latest?.medianConfidence).toBe(50);
    expect(d.movement.note).toBeNull();
    expect(d.dimensionImprovement.find((r) => r.key === "tre")).toMatchObject({ first: 28, latest: 37, delta: 9 });
    expect(d.dimensionImprovement.find((r) => r.key === "ftv")).toMatchObject({ first: 65, latest: 66, delta: 1 });
  });

  it("benchmark is the EXTERNAL segment (G21 P3-B): none loaded → 'No benchmark yet (n = N)'; the cohort's own median is a separate 'Cohort median' line", () => {
    const none = buildCohortReport(input());
    expect(none.benchmark).toBeNull();
    expect(none.benchmarkLine).toMatch(/^No benchmark yet \(n = 0\)/);
    expect(none.cohortMedian).toBeGreaterThan(60);
    expect(none.cohortMedianLine).toMatch(/^Cohort median \d+ \(n = 3\)$/);
    // 12 scored startups do NOT make a benchmark — the cohort is never its own comparison set (P2 review).
    const big = buildCohortReport(input({ startups: Array.from({ length: 12 }, () => startup()) }));
    expect(big.benchmark).toBeNull();
    expect(big.benchmarkLine).toMatch(/^No benchmark yet/);
    expect(big.cohortMedianLine).toMatch(/^Cohort median \d+ \(n = 12\)$/);
    expect(big.benchmarkLine).not.toMatch(/n = 12/);
  });

  it("benchmark: an unpublished segment quotes its n; a published stage segment prints median, band and n; a stage fallback says the sector segment is unpublished", () => {
    const unpublished = buildCohortReport(input({ marketBenchmark: { stage: 4, sector: null, published: null, fellBackToStage: false, sampleSize: 6 } }));
    expect(unpublished.benchmark).toBeNull();
    expect(unpublished.benchmarkLine).toMatch(/^No benchmark yet \(n = 6\)/);
    const published = buildCohortReport(
      input({ marketBenchmark: { stage: 4, sector: null, published: { median: 58, p25: 51, p75: 66, n: 41, band: "benchmark", label: "benchmark (n = 41)", segment: "Stage 4" }, fellBackToStage: false, sampleSize: 41 } }),
    );
    expect(published.benchmark?.n).toBe(41);
    expect(published.benchmarkLine).toBe("Stage 4 benchmark — median 58, p25–p75 51–66 (n = 41)");
    const fallback = buildCohortReport(
      input({ marketBenchmark: { stage: 4, sector: "saas", published: { median: 58, p25: null, p75: null, n: 14, band: "indicative", label: "indicative (n = 14)", segment: "Stage 4" }, fellBackToStage: true, sampleSize: 14 } }),
    );
    expect(fallback.benchmarkLine).toBe("Stage 4 indicative — median 58 (n = 14) — saas segment not published yet");
    const html = renderCohortReportHtml(published, "https://blockid.au", "n");
    expect(html).toContain("Stage 4 benchmark — median 58, p25–p75 51–66 (n = 41)");
    expect(html).toMatch(/Cohort median \d+ \(n = 3\)/);
    expect(html).toContain("it is not a benchmark");
  });

  it("evidence completion counts ≥ L3 per dimension; outputs count submitted decisions, shortlist, dossiers, letters", () => {
    const d = buildCohortReport(input());
    expect(d.evidenceCompletion.find((r) => r.key === "ftv")).toMatchObject({ count: 3, pct: 100 });
    expect(d.evidenceCompletion.find((r) => r.key === "tre")).toMatchObject({ count: 3, pct: 100 });
    expect(d.evidenceCompletion.find((r) => r.key === "mpc")).toMatchObject({ count: 0, pct: 0 });
    expect(d.outputs).toEqual({ decisions: { pass: 1, track: 0, proceed: 1, undecided: 1 }, shortlisted: 1, dossiers: 1, letters: 1 });
    expect(d.strengths).toEqual([{ label: "Founder & Team", count: 3 }]);
    expect(d.gaps).toEqual([{ label: "Traction & Revenue", count: 3 }]);
  });

  it("human review + signature + methodology: overrides counted, humans made every decision, no agent count", () => {
    const none = buildCohortReport(input());
    expect(none.humanReview.sentence).toMatch(/Humans made every decision/);
    expect(none.humanReview.sentence).toMatch(/No dimension score was overridden/);
    const some = buildCohortReport(input({ overridesCount: 2 }));
    expect(some.humanReview.sentence).toMatch(/2 reviewer overrides recorded with a reason code/);
    expect(some.signature).toMatchObject({ name: "Pat Program", role: "Program owner", methodologyVersion: SVI_VERSION });
    expect(some.signature.date).toMatch(/September 2026/);
    expect(COHORT_REPORT_METHODOLOGY).not.toMatch(/\d+ (AI )?agents|C-Level/);
    expect(COHORT_REPORT_METHODOLOGY).toMatch(/Humans make the decision/);
    const anon = buildCohortReport(input({ reviewer: null }));
    expect(anon.signature).toMatchObject({ name: "", role: "Program reviewer" });
  });
});

describe("renderCohortReportHtml", () => {
  it("carries every section, the entity line, the disclaimer surface, the nonce print script and the startup lines", () => {
    const d = buildCohortReport(input({ overridesCount: 1 }));
    const html = renderCohortReportHtml(d, "https://blockid.au", "abc123");
    for (const section of ["movement", "dimensions", "benchmark", "evidence", "outputs", "strengths-gaps", "human-review", "signature"]) expect(html).toContain(`data-section="${section}"`);
    expect(html).toContain("BlockID Cohort Report · Q3 2026");
    expect(html).toContain("Cohort 5");
    expect(html).toContain("Prepared by Startmate-like Program");
    expect(html).toContain(LEGAL_ENTITY.operator);
    expect(html).toContain('data-surface="evaluator_report"');
    expect(html).toContain('<script nonce="abc123">');
    expect(html).toMatch(/<strong>Startup \d+<\/strong>/);
    expect(html).toContain("shortlisted");
    expect(html).toContain("1 reviewer override recorded");
    expect(html).toContain("Pat Program");
    expect(html).toContain(`Startup Value Index v${SVI_VERSION}`);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).not.toContain("<script>");
  });

  it("without a nonce there is no inline script; names are escaped", () => {
    const d = buildCohortReport(input({ cohortName: "<Cohort> & Co" }));
    const html = renderCohortReportHtml(d);
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;Cohort&gt; &amp; Co");
  });
});

describe("cohortReportCsv", () => {
  it("one Excel-safe row per startup with the report columns", () => {
    const d = buildCohortReport(input({ startups: [startup({ name: "=Evil", svi: 71.4, delta: -3, decision: "pass", assessmentStatus: "submitted", reportUrl: "/report/x" })] }));
    const csv = cohortReportCsv(d);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split(/\r?\n/).filter(Boolean);
    expect(lines[0]).toBe(COHORT_REPORT_CSV_HEADERS.join(","));
    expect(lines).toHaveLength(2);
    expect(lines[1].startsWith("'=Evil,done,71.4,50,2,MVP,-3,pass,submitted,no,")).toBe(true);
    expect(lines[1]).toContain("L3");
    expect(lines[1]).toContain("https://blockid.au/report/x");
    expect(cohortReportFilename("Cohort 5 — Spring!", "csv")).toBe("blockid-cohort-report-cohort-5-spring.csv");
  });
});

describe("quarterly aliases", () => {
  it("renderQuarterlyReportHtml + summariseQuarterly are still exported from the cohort-report module", () => {
    const sum = summariseQuarterly([{ name: "A", svi: 60, weighted: 60, stage: 3, delta: null, topStrength: null, topGap: null, reportUrl: null, status: "done" }]);
    expect(sum.medianSvi).toBe(60);
    const html = renderQuarterlyReportHtml({ cohortName: "Old", programName: null, quarterLabel: "Q3 2026", generatedAt: "2026-09-20T00:00:00Z", source: "batch", weights: null, startups: [] });
    expect(html).toContain("Sponsor / LP report");
  });
});
