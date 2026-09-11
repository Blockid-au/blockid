// Colocated vitest for batch-shared (T0272). Pins the weight normalisation
// (sum → 100, unknown keys dropped, negatives clamped, empty → equal), the
// weighted re-aggregation (equal weights = plain mean, missing dimensions
// renormalise, all-missing → null), strength/gap, dimension_scores
// flattening for both snapshot shapes, the gate vocabulary, the row mappers,
// median, and the Excel-safe CSV (BOM, CRLF, quoting, formula guard).

import { describe, expect, it } from "vitest";
import {
  BATCH_FEATURES,
  CSV_BOM,
  COHORT_CSV_HEADERS,
  DIMENSION_KEYS,
  batchProgressPct,
  canBatchScore,
  canExportLpReport,
  cohortCsv,
  csvCell,
  csvFilename,
  equalWeights,
  flattenDimensionScores,
  isEqualWeights,
  mapBatchItemRow,
  mapBatchRow,
  median,
  normaliseWeights,
  stageName,
  strengthAndGap,
  weightedScore,
  type CohortRow,
} from "./batch-shared";

const SCORES = { ftv: 80, mpc: 60, ptd: 70, tre: 40, cgh: 50, iri: 55, lco: 65, svm: 75 };

describe("normaliseWeights", () => {
  it("defaults to equal weights (12.5 × 8 = 100)", () => {
    const w = equalWeights();
    expect(DIMENSION_KEYS.every((k) => w[k] === 12.5)).toBe(true);
    expect(isEqualWeights(w)).toBe(true);
    expect(normaliseWeights(undefined)).toEqual(w);
    expect(normaliseWeights({})).toEqual(w);
    expect(normaliseWeights([1, 2])).toEqual(w);
    expect(normaliseWeights({ ftv: 0, mpc: 0 })).toEqual(w);
  });

  it("normalises any positive split to sum 100 and drops unknown keys / clamps negatives", () => {
    const w = normaliseWeights({ ftv: 3, mpc: 1, bogus: 99, tre: -5, cgh: "2" });
    const sum = DIMENSION_KEYS.reduce((s, k) => s + w[k], 0);
    expect(Math.round(sum * 100) / 100).toBe(100);
    expect(w.ftv).toBe(50);
    expect(w.mpc).toBeCloseTo(16.67, 2);
    expect(w.cgh).toBeCloseTo(33.33, 2);
    expect(w.tre).toBe(0);
    expect((w as Record<string, number>).bogus).toBeUndefined();
    expect(isEqualWeights(w)).toBe(false);
  });
});

describe("weightedScore", () => {
  it("equal weights reproduce the plain mean of the 8 dimensions", () => {
    const mean = Object.values(SCORES).reduce((a, b) => a + b, 0) / 8;
    expect(weightedScore(SCORES)).toBe(Math.round(mean * 10) / 10);
  });

  it("applies custom weights and renormalises over the dimensions present", () => {
    const w = normaliseWeights({ ftv: 100 });
    expect(weightedScore(SCORES, w)).toBe(80);
    // Only tre + ftv scored: 50/50 → (40 + 80) / 2.
    expect(weightedScore({ ftv: 80, tre: 40 }, normaliseWeights({ ftv: 1, tre: 1, mpc: 5 }))).toBe(60);
  });

  it("returns null with no scores or zero applicable weight", () => {
    expect(weightedScore(null)).toBeNull();
    expect(weightedScore({})).toBeNull();
    expect(weightedScore({ mpc: 60 }, normaliseWeights({ ftv: 100 }))).toBeNull();
  });
});

describe("strengthAndGap / flattenDimensionScores", () => {
  it("names the highest and lowest dimension", () => {
    expect(strengthAndGap(SCORES)).toEqual({ topStrength: "Founder & Team", topGap: "Traction & Revenue" });
    expect(strengthAndGap(null)).toEqual({ topStrength: null, topGap: null });
  });

  it("accepts the {key:{score,priority}} snapshot shape and the bare map", () => {
    expect(flattenDimensionScores({ ftv: { score: 61.26, priority: "low" }, mpc: { score: 48 } })).toEqual({ ftv: 61.3, mpc: 48 });
    expect(flattenDimensionScores({ ftv: 61, bogus: 1 })).toEqual({ ftv: 61 });
    expect(flattenDimensionScores(null)).toBeNull();
    expect(flattenDimensionScores({ nope: 1 })).toBeNull();
  });
});

describe("gate vocabulary", () => {
  it("Program flags (lp_export) and accelerator.cohort pass; Scout / Firm flags do not", () => {
    expect(BATCH_FEATURES).toEqual(["lp_export", "accelerator.cohort"]);
    expect(canBatchScore(["watchlist", "svi.feed", "investor.dealflow", "grant_finder", "money_radar"])).toBe(false);
    expect(canBatchScore(["investor.dealflow", "advisor.cohort", "white_label"])).toBe(false);
    expect(canBatchScore(["portfolio", "api.access", "lp_export", "lp_report"])).toBe(true);
    expect(canBatchScore(["cohort.view", "accelerator.cohort"])).toBe(true);
    expect(canExportLpReport(["lp_report"])).toBe(true);
    expect(canExportLpReport(["lp_export"])).toBe(true);
    expect(canExportLpReport(["advisor.cohort"])).toBe(false);
  });
});

describe("row mappers", () => {
  it("mapBatchRow normalises weights and coerces counts / status", () => {
    const b = mapBatchRow({ id: "b-1", user_id: "u-1", name: "Cohort 4", rubric_weights: { ftv: 2, mpc: 2 }, status: "weird", total: "3", done_count: null, failed_count: 1, created_at: "2026-09-10T00:00:00Z", started_at: null, finished_at: null });
    expect(b.status).toBe("queued");
    expect(b.total).toBe(3);
    expect(b.doneCount).toBe(0);
    expect(b.failedCount).toBe(1);
    expect(b.rubricWeights.ftv).toBe(50);
    expect(batchProgressPct(b)).toBe(33);
    expect(batchProgressPct({ total: 0, doneCount: 0, failedCount: 0 })).toBe(0);
  });

  it("mapBatchItemRow flattens dimension_scores and keeps nulls", () => {
    const i = mapBatchItemRow({ id: 7, batch_id: "b-1", evaluation_id: "e-1", status: "done", report_id: "r-1", snapshot_id: "s-1", share_token: "tok", svi_total: "71", dimension_scores: { ftv: { score: 80 } }, error: null, scored_at: "2026-09-11T00:00:00Z" });
    expect(i).toMatchObject({ id: 7, status: "done", sviTotal: 71, dimensionScores: { ftv: 80 }, error: null });
    expect(mapBatchItemRow({ id: 8, batch_id: "b-1", evaluation_id: "e-2", status: "queued" }).sviTotal).toBeNull();
  });
});

describe("median / stageName", () => {
  it("handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(stageName(3)).toBe("MVP");
    expect(stageName(null)).toBe("—");
    expect(stageName(42)).toBe("Stage 42");
  });
});

function row(over: Partial<CohortRow> = {}): CohortRow {
  return {
    itemId: 1, evaluationId: "e-1", projectId: "p-1", projectSlug: "acme", startup: "Acme", label: null, industry: null, state: "NSW",
    status: "done", svi: 71, weighted: 62.5, stage: 3, delta: 4, topStrength: "Founder & Team", topGap: "Traction & Revenue",
    dimensionScores: SCORES, reportUrl: "/tbr/tok", pdfUrl: "/api/svi/report/pdf?token=tok", error: null, scoredAt: "2026-09-11T00:00:00Z",
    ...over,
  };
}

describe("cohortCsv", () => {
  it("starts with the UTF-8 BOM, uses CRLF and the fixed header", () => {
    const csv = cohortCsv([row()], "https://blockid.au");
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(CSV_BOM.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(COHORT_CSV_HEADERS.join(","));
    expect(lines[1]).toContain("Acme,,,NSW,done,71,62.5,MVP,4,Founder & Team,Traction & Revenue,80,60,70,40,50,55,65,75,https://blockid.au/tbr/tok,2026-09-11T00:00:00Z,");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("quotes commas / quotes / newlines and guards Excel formulas", () => {
    expect(csvCell('Acme, "The" Co')).toBe('"Acme, ""The"" Co"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell("=HYPERLINK(x)")).toBe("'=HYPERLINK(x)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell(null)).toBe("");
    expect(csvCell(12.5)).toBe("12.5");
    // S8-C: numbers are never formulas — a negative delta stays numeric.
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell("-3")).toBe("'-3");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    expect(csvCell("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    const csv = cohortCsv([row({ startup: "Bad, Inc", label: "=cmd", error: "boom" })]);
    expect(csv).toContain('"Bad, Inc",\'=cmd,');
    expect(csv).toContain(",boom\r\n");
  });

  it("names the file from the batch name + date", () => {
    expect(csvFilename({ name: "Cohort 4 — Intake!", createdAt: "2026-09-10T04:00:00Z" })).toBe("cohort-cohort-4-intake-2026-09-10.csv");
    expect(csvFilename({ name: "", createdAt: "" })).toBe("cohort-cohort-export.csv");
  });
});
