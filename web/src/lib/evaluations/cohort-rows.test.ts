// Colocated vitest for lib/evaluations/cohort-rows (G21 P2-B). Pure and
// client-safe -- no mocks needed. Pins: buildCohortRows' field mapping
// (company/stage/sector, the canonical SVI left untouched, confidence
// rounded from Evidence Confidence, "L2" verification short label, gaps =
// pending dims + unverified material claims, the VIEWER's decision/
// conviction/status from the `assessments` map, weightedScore vs the
// override-aware overrideWeightedScore -- only real when a DIMENSION
// override exists, a `total` override alone never moves it -- the risk
// flags, the delta provider precedence (an explicit null in `deltas` wins
// over the item's own baseline), the decision log; filterCohortRows on
// every facet, activeFilterCount, sortCohortRows (default direction, nulls
// last, company tie-break, no mutation); the `?stage=&sector=...` URL
// codec round trip; header stats / medianOf; the delta provider slot
// (getCohortDeltas is {} until registered, delegates, swallows a throw);
// and the Excel-safe BlockID Cohort CSV export.

import { afterEach, describe, expect, it } from "vitest";
import {
  CSV_BOM,
  DIMENSION_KEYS,
  equalWeights,
  normaliseWeights,
  stageName,
  weightedScore,
  type BatchStatus,
  type CohortRow as BatchCohortRow,
} from "./batch-shared";
import type { OverrideRow } from "./overrides-shared";
import {
  BLOCKID_COHORT_CSV_HEADERS,
  activeFilterCount,
  blockIdCohortCsv,
  buildCohortRows,
  cohortFiltersToParams,
  cohortHeaderStats,
  defaultSortDir,
  filterCohortRows,
  getCohortDeltas,
  medianOf,
  parseCohortFilters,
  registerCohortDeltaProvider,
  riskFlagsFor,
  sortCohortRows,
  type AssessmentLogInput,
  type CohortAnalysisInput,
  type CohortFilters,
  type CohortItemInput,
  type CohortRow,
} from "./cohort-rows";

const SCORES = { ftv: 80, mpc: 60, ptd: 70, tre: 40, cgh: 50, iri: 55, lco: 65, svm: 75 };

function legacyRow(over: Partial<BatchCohortRow> = {}): BatchCohortRow {
  return {
    itemId: 1, evaluationId: "e-1", projectId: "p-1", projectSlug: "acme", startup: "Acme", label: null, industry: "SaaS", state: "NSW",
    status: "done", svi: 71, weighted: 62.5, stage: 3, delta: 4, topStrength: "Founder & Team", topGap: "Traction & Revenue",
    dimensionScores: SCORES, reportUrl: "/tbr/tok", pdfUrl: "/api/svi/report/pdf?token=tok", error: null, scoredAt: "2026-09-11T00:00:00Z",
    decision: null, conviction: null, thesisFitPct: null, assessmentStatus: null,
    ...over,
  };
}

function item(over: Partial<CohortItemInput> = {}): CohortItemInput {
  return {
    ...legacyRow(),
    snapshotId: null,
    shortlisted: false,
    reviewStatus: "unreviewed",
    reviewerId: null,
    reviewerName: null,
    ...over,
  };
}

function overrideRow(over: Partial<OverrideRow> = {}): OverrideRow {
  return {
    id: "ov-1", batchId: "b-1", itemId: 1, projectId: "p-1", dimension: "tre", fromValue: 40, toValue: 62,
    reasonCode: "sector_context", note: null, reviewerId: "u-1", reviewerName: "Jo Reviewer", createdAt: "2026-09-12T00:00:00Z",
    ...over,
  };
}

function logEntry(over: Partial<AssessmentLogInput> = {}): AssessmentLogInput {
  return { evaluationId: "e-1", version: 1, status: "submitted", decision: "proceed", conviction: 4, assessorId: "u-1", assessorName: "Jo", updatedAt: "2026-09-12T00:00:00Z", ...over };
}

function mkRow(over: Partial<CohortRow> = {}): CohortRow {
  return {
    itemId: 1, projectId: "p-1", evaluationId: "e-1", company: "Acme", stage: 3, stageLabel: "MVP", sector: "SaaS",
    svi: 71, confidence: 60, verification: "L2", verificationLevel: 2, delta: 4,
    strongestDim: "ftv", weakestDim: "tre", strongestLabel: "Founder & Team", weakestLabel: "Traction & Revenue",
    gapsCount: 1, reviewStatus: "unreviewed", reviewer: null, decision: null, conviction: null, assessmentStatus: null,
    shortlisted: false, weightedScore: 62, overrideWeightedScore: null, dimensionScores: SCORES,
    overriddenDimensions: {}, overrides: [], overridesCount: 0, riskFlags: [], status: "done" as BatchStatus,
    reportUrl: "/tbr/tok", pdfUrl: "/api/svi/report/pdf?token=tok", dossierUrl: "/workspace/evaluations/e-1",
    error: null, scoredAt: "2026-09-11T00:00:00Z", log: [],
    ...over,
  };
}

describe("buildCohortRows", () => {
  it("maps company/stage/sector, leaves the canonical SVI untouched, rounds confidence, short verification label, gaps = pending + unverified", () => {
    const analyses: Record<string, CohortAnalysisInput> = {
      "p-1": { evidenceConfidence: 62.6, verificationLevel: 2, pendingDims: 2, unverifiedMaterialClaims: 1, conflictingClaims: 0 },
    };
    const assessments = { "e-1": { decision: "proceed" as const, conviction: 4, thesisFitPct: 80, assessmentStatus: "submitted" as const } };
    const [r] = buildCohortRows([item()], analyses, assessments, [], equalWeights());
    expect(r.company).toBe("Acme");
    expect(r.stage).toBe(3);
    expect(r.stageLabel).toBe(stageName(3));
    expect(r.sector).toBe("SaaS");
    expect(r.svi).toBe(71);
    expect(r.confidence).toBe(63);
    expect(r.verification).toBe("L2");
    expect(r.verificationLevel).toBe(2);
    expect(r.gapsCount).toBe(3);
    expect(r.decision).toBe("proceed");
    expect(r.conviction).toBe(4);
    expect(r.assessmentStatus).toBe("submitted");
    expect(r.dossierUrl).toBe("/workspace/evaluations/e-1");
  });

  it("confidence is null when the analysis input is absent -- never fabricated", () => {
    const [r] = buildCohortRows([item()], {}, {}, [], equalWeights());
    expect(r.confidence).toBeNull();
    expect(r.gapsCount).toBe(0);
    expect(r.decision).toBeNull();
    expect(r.conviction).toBeNull();
    expect(r.assessmentStatus).toBeNull();
  });

  it("weightedScore is the program rubric over the model dimensions (equal weights = mean)", () => {
    const [r] = buildCohortRows([item()], {}, {}, [], equalWeights());
    expect(r.weightedScore).toBe(weightedScore(SCORES, equalWeights()));
  });

  it("overrideWeightedScore is only set when a DIMENSION override exists -- a total-only override leaves it null", () => {
    const totalOnly = [overrideRow({ dimension: "total", fromValue: 71, toValue: 66 })];
    const [r] = buildCohortRows([item()], {}, {}, totalOnly, equalWeights());
    expect(r.overrideWeightedScore).toBeNull();
    expect(r.overriddenDimensions.total).toEqual({ from: 71, to: 66, reasonCode: "sector_context" });
    expect(r.overridesCount).toBe(1);
    expect(r.overrides).toHaveLength(1);
  });

  it("overrideWeightedScore re-aggregates with the latest human override per dimension applied", () => {
    const withDim = [overrideRow({ dimension: "tre", fromValue: 40, toValue: 62 })];
    const [r] = buildCohortRows([item()], {}, {}, withDim, equalWeights());
    const withOverride = { ...SCORES, tre: 62 };
    expect(r.overrideWeightedScore).toBe(weightedScore(withOverride, equalWeights()));
    expect(r.weightedScore).toBe(weightedScore(SCORES, equalWeights()));
    expect(r.overriddenDimensions.tre).toEqual({ from: 40, to: 62, reasonCode: "sector_context" });
  });

  it("only overrides for THIS item's itemId are attached", () => {
    const rows = [overrideRow({ itemId: 1, dimension: "tre" }), overrideRow({ id: "ov-2", itemId: 2, dimension: "ftv" })];
    const [a, b] = buildCohortRows([item({ itemId: 1 }), item({ itemId: 2, evaluationId: "e-2", projectId: "p-2" })], {}, {}, rows, equalWeights());
    expect(a.overridesCount).toBe(1);
    expect(a.overriddenDimensions.tre).toBeDefined();
    expect(b.overridesCount).toBe(1);
    expect(b.overriddenDimensions.ftv).toBeDefined();
  });

  describe("riskFlagsFor", () => {
    it("flags a dimension below 40, conflicting claims, unverified claims and a failed status independently", () => {
      expect(riskFlagsFor({ dimensionScores: { ...SCORES, tre: 39 }, conflictingClaims: 0, unverifiedMaterialClaims: 0, status: "done" })).toEqual(["low_dimension"]);
      expect(riskFlagsFor({ dimensionScores: SCORES, conflictingClaims: 2, unverifiedMaterialClaims: 0, status: "done" })).toEqual(["conflicting_claims"]);
      expect(riskFlagsFor({ dimensionScores: SCORES, conflictingClaims: 0, unverifiedMaterialClaims: 1, status: "done" })).toEqual(["unverified_claims"]);
      expect(riskFlagsFor({ dimensionScores: SCORES, conflictingClaims: 0, unverifiedMaterialClaims: 0, status: "failed" })).toEqual(["scoring_failed"]);
      expect(riskFlagsFor({ dimensionScores: null, conflictingClaims: 0, unverifiedMaterialClaims: 0, status: "done" })).toEqual([]);
      expect(riskFlagsFor({ dimensionScores: { ...SCORES, tre: 40 }, conflictingClaims: 0, unverifiedMaterialClaims: 0, status: "done" })).toEqual([]);
    });

    it("stacks every applicable flag", () => {
      const flags = riskFlagsFor({ dimensionScores: { ...SCORES, tre: 10 }, conflictingClaims: 1, unverifiedMaterialClaims: 2, status: "failed" });
      expect(flags).toEqual(["low_dimension", "conflicting_claims", "unverified_claims", "scoring_failed"]);
    });
  });

  it("riskFlagsFor flows through buildCohortRows", () => {
    const analyses: Record<string, CohortAnalysisInput> = { "p-1": { evidenceConfidence: null, verificationLevel: 0, pendingDims: 0, unverifiedMaterialClaims: 0, conflictingClaims: 1 } };
    const [r] = buildCohortRows([item({ dimensionScores: { ...SCORES, tre: 20 } })], analyses, {}, [], equalWeights());
    expect(r.riskFlags).toEqual(["low_dimension", "conflicting_claims"]);
  });

  describe("delta precedence", () => {
    it("an entry in deltas -- including an explicit null -- wins over the item's own baseline", () => {
      const [withNumber] = buildCohortRows([item({ projectId: "p-1", delta: 5 })], {}, {}, [], equalWeights(), { "p-1": 9 });
      expect(withNumber.delta).toBe(9);
      const [withNull] = buildCohortRows([item({ projectId: "p-1", delta: 5 })], {}, {}, [], equalWeights(), { "p-1": null });
      expect(withNull.delta).toBeNull();
    });

    it("a project absent from deltas falls back to the item's own delta", () => {
      const [r] = buildCohortRows([item({ projectId: "p-1", delta: 5 })], {}, {}, [], equalWeights(), {});
      expect(r.delta).toBe(5);
    });

    it("an explicit undefined value present in deltas also falls back (only a stored, non-undefined value wins)", () => {
      const [r] = buildCohortRows([item({ projectId: "p-1", delta: 5 })], {}, {}, [], equalWeights(), { "p-1": undefined });
      expect(r.delta).toBe(5);
    });
  });

  it("builds the decision log newest first from the assessment log + overrides", () => {
    const log = [logEntry({ version: 1, updatedAt: "2026-09-10T00:00:00Z" }), logEntry({ version: 2, updatedAt: "2026-09-13T00:00:00Z" })];
    const overrides = [overrideRow({ createdAt: "2026-09-12T00:00:00Z" })];
    const [r] = buildCohortRows([item()], {}, {}, overrides, equalWeights(), {}, log);
    expect(r.log.map((e) => e.at)).toEqual(["2026-09-13T00:00:00Z", "2026-09-12T00:00:00Z", "2026-09-10T00:00:00Z"]);
    expect(r.log[0].kind).toBe("assessment");
    expect(r.log[1].kind).toBe("override");
  });
});

describe("filterCohortRows", () => {
  const rows = [
    mkRow({ itemId: 1, company: "Acme", sector: "SaaS", stage: 3, svi: 71, confidence: 60, dimensionScores: SCORES, riskFlags: [], verificationLevel: 2, reviewStatus: "unreviewed", decision: null, shortlisted: false }),
    mkRow({ itemId: 2, company: "Beta Biotech", sector: "Biotech", stage: 5, svi: 40, confidence: 30, dimensionScores: { ...SCORES, tre: 20 }, riskFlags: ["low_dimension"], verificationLevel: 0, reviewStatus: "reviewed", decision: "pass", shortlisted: true }),
    mkRow({ itemId: 3, company: "Gamma SaaS Co", sector: "SaaS", stage: 3, svi: null, confidence: null, dimensionScores: null, riskFlags: [], verificationLevel: 4, reviewStatus: "in_review", decision: "proceed", shortlisted: false }),
  ];

  it("filters by stage", () => {
    expect(filterCohortRows(rows, { stage: [3] }).map((r) => r.itemId)).toEqual([1, 3]);
    expect(filterCohortRows(rows, { stage: [9] })).toEqual([]);
  });

  it("filters by sector, case-insensitively", () => {
    expect(filterCohortRows(rows, { sector: ["saas"] }).map((r) => r.itemId)).toEqual([1, 3]);
    expect(filterCohortRows(rows, { sector: ["SAAS"] }).map((r) => r.itemId)).toEqual([1, 3]);
  });

  it("filters by SVI / confidence / traction ranges -- a null value never matches a range", () => {
    expect(filterCohortRows(rows, { svi: [50, 80] }).map((r) => r.itemId)).toEqual([1]);
    expect(filterCohortRows(rows, { conf: [0, 50] }).map((r) => r.itemId)).toEqual([2]);
    expect(filterCohortRows(rows, { traction: [0, 30] }).map((r) => r.itemId)).toEqual([2]);
  });

  it("filters by risk (any flag) and by minimum verification level", () => {
    expect(filterCohortRows(rows, { risk: true }).map((r) => r.itemId)).toEqual([2]);
    expect(filterCohortRows(rows, { ver: 3 }).map((r) => r.itemId)).toEqual([3]);
    expect(filterCohortRows(rows, { ver: 0 }).map((r) => r.itemId)).toEqual([1, 2, 3]);
  });

  it('filters by review status and by decision, including the synthetic "none"', () => {
    expect(filterCohortRows(rows, { status: ["reviewed"] }).map((r) => r.itemId)).toEqual([2]);
    expect(filterCohortRows(rows, { decision: ["none"] }).map((r) => r.itemId)).toEqual([1]);
    expect(filterCohortRows(rows, { decision: ["pass", "proceed"] }).map((r) => r.itemId)).toEqual([2, 3]);
  });

  it("filters by shortlist and by free-text q on company + sector", () => {
    expect(filterCohortRows(rows, { shortlist: true }).map((r) => r.itemId)).toEqual([2]);
    expect(filterCohortRows(rows, { q: "acme" }).map((r) => r.itemId)).toEqual([1]);
    expect(filterCohortRows(rows, { q: "saas" }).map((r) => r.itemId)).toEqual([1, 3]);
  });

  it("combines filters (AND)", () => {
    expect(filterCohortRows(rows, { sector: ["SaaS"], stage: [3], q: "gamma" }).map((r) => r.itemId)).toEqual([3]);
  });
});

describe("activeFilterCount", () => {
  it("counts each active facet once, ignoring empty/blank values", () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ q: "  " })).toBe(0);
    expect(activeFilterCount({ stage: [], sector: [] })).toBe(0);
    const f: CohortFilters = { stage: [3], sector: ["SaaS"], svi: [0, 100], conf: [0, 100], traction: [0, 100], risk: true, ver: 2, status: ["reviewed"], decision: ["pass"], shortlist: true, q: "acme" };
    expect(activeFilterCount(f)).toBe(11);
  });
});

describe("sortCohortRows", () => {
  const rows = [
    mkRow({ itemId: 1, company: "Beta", svi: 50 }),
    mkRow({ itemId: 2, company: "Alpha", svi: 90 }),
    mkRow({ itemId: 3, company: "Gamma", svi: null }),
    mkRow({ itemId: 4, company: "Delta", svi: 50 }),
  ];

  it("defaultSortDir: number columns default desc, text columns default asc", () => {
    expect(defaultSortDir("svi")).toBe("desc");
    expect(defaultSortDir("weightedScore")).toBe("desc");
    expect(defaultSortDir("gaps")).toBe("desc");
    expect(defaultSortDir("company")).toBe("asc");
    expect(defaultSortDir("sector")).toBe("asc");
    expect(defaultSortDir("strongest")).toBe("asc");
    expect(defaultSortDir("weakest")).toBe("asc");
    expect(defaultSortDir("reviewer")).toBe("asc");
  });

  it("sorts numbers, puts nulls last regardless of direction, ties by company", () => {
    const desc = sortCohortRows(rows, "svi", "desc").map((r) => r.company);
    expect(desc).toEqual(["Alpha", "Beta", "Delta", "Gamma"]);
    const asc = sortCohortRows(rows, "svi", "asc").map((r) => r.company);
    expect(asc).toEqual(["Beta", "Delta", "Alpha", "Gamma"]);
  });

  it("sorts text columns asc/desc", () => {
    expect(sortCohortRows(rows, "company", "asc").map((r) => r.company)).toEqual(["Alpha", "Beta", "Delta", "Gamma"]);
    expect(sortCohortRows(rows, "company", "desc").map((r) => r.company)).toEqual(["Gamma", "Delta", "Beta", "Alpha"]);
  });

  it("never mutates the input array", () => {
    const before = rows.map((r) => r.company);
    sortCohortRows(rows, "svi", "desc");
    expect(rows.map((r) => r.company)).toEqual(before);
  });
});

describe("parseCohortFilters / cohortFiltersToParams", () => {
  it("round-trips a full filter set through a query string", () => {
    const f: CohortFilters = { stage: [2, 3], sector: ["SaaS", "Fintech"], svi: [40, 80], conf: [50, 100], traction: [30, 100], risk: true, ver: 2, status: ["in_review"], decision: ["proceed", "none"], shortlist: true, q: "acme" };
    const params = cohortFiltersToParams(f);
    expect(parseCohortFilters(params)).toEqual(f);
    expect(parseCohortFilters(`?${params.toString()}`)).toEqual(f);
    expect(parseCohortFilters(params.toString())).toEqual(f);
  });

  it("accepts a plain Record<string, string | string[]>", () => {
    expect(parseCohortFilters({ stage: "3,4", sector: ["SaaS"], risk: "1" })).toEqual({ stage: [3, 4], sector: ["SaaS"], risk: true });
  });

  it("drops junk: out-of-range stage, unknown decision/status codes, non-integer ver", () => {
    expect(parseCohortFilters("stage=3,99,-1,abc")).toEqual({ stage: [3] });
    expect(parseCohortFilters("decision=bogus,proceed")).toEqual({ decision: ["proceed"] });
    expect(parseCohortFilters("status=whatever,reviewed")).toEqual({ status: ["reviewed"] });
    expect(parseCohortFilters("ver=abc")).toEqual({});
    expect(parseCohortFilters("ver=9")).toEqual({});
    expect(parseCohortFilters("")).toEqual({});
  });

  it("normalises a reversed range (svi=80-40 -> 40..80)", () => {
    expect(parseCohortFilters("svi=80-40")).toEqual({ svi: [40, 80] });
  });

  it("dedupes stage/status/decision and clamps range bounds to 0..100", () => {
    expect(parseCohortFilters("stage=3,3,4")).toEqual({ stage: [3, 4] });
    expect(parseCohortFilters("svi=-20-150")).toEqual({});
    expect(parseCohortFilters("conf=0-500")).toEqual({ conf: [0, 100] });
  });

  it("cohortFiltersToParams omits keys for unset facets", () => {
    const params = cohortFiltersToParams({});
    expect([...params.keys()]).toEqual([]);
  });
});

describe("medianOf / cohortHeaderStats", () => {
  it("medianOf handles odd, even, empty and ignores non-numbers", () => {
    expect(medianOf([3, 1, 2])).toBe(2);
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
    expect(medianOf([])).toBeNull();
    expect(medianOf([null, undefined, 5])).toBe(5);
  });

  it("cohortHeaderStats summarises n / scored / medians / shortlisted / reviewed / overrides", () => {
    const rows = [
      mkRow({ itemId: 1, svi: 60, confidence: 50, shortlisted: true, reviewStatus: "reviewed", overridesCount: 2 }),
      mkRow({ itemId: 2, svi: 80, confidence: 70, shortlisted: false, reviewStatus: "unreviewed", overridesCount: 0 }),
      mkRow({ itemId: 3, svi: null, confidence: null, shortlisted: false, reviewStatus: "reviewed", overridesCount: 1 }),
    ];
    expect(cohortHeaderStats(rows)).toEqual({ n: 3, scored: 2, medianSvi: 70, medianConfidence: 60, shortlisted: 1, reviewed: 2, overrides: 3 });
  });
});

describe("getCohortDeltas / registerCohortDeltaProvider", () => {
  afterEach(() => {
    registerCohortDeltaProvider(null);
  });

  it("resolves {} until a provider is registered", async () => {
    expect(await getCohortDeltas("b-1")).toEqual({});
  });

  it("delegates to the registered provider with the batch id", async () => {
    const calls: string[] = [];
    registerCohortDeltaProvider(async (batchId) => {
      calls.push(batchId);
      return { "p-1": 4, "p-2": null };
    });
    expect(await getCohortDeltas("b-1")).toEqual({ "p-1": 4, "p-2": null });
    expect(calls).toEqual(["b-1"]);
  });

  it("swallows a provider throw and resolves {}", async () => {
    registerCohortDeltaProvider(async () => {
      throw new Error("boom");
    });
    expect(await getCohortDeltas("b-1")).toEqual({});
  });

  it("swallows a provider returning a non-object", async () => {
    registerCohortDeltaProvider(async () => null as unknown as Record<string, number | null>);
    expect(await getCohortDeltas("b-1")).toEqual({});
  });
});

describe("blockIdCohortCsv", () => {
  it("starts with the UTF-8 BOM, uses CRLF, and the header matches BLOCKID_COHORT_CSV_HEADERS", () => {
    const csv = blockIdCohortCsv([mkRow()], "https://blockid.au");
    expect(csv[0]).toBe(CSV_BOM);
    expect(CSV_BOM.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(BLOCKID_COHORT_CSV_HEADERS.join(","));
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("guards Excel formula injection and forms an absolute report link", () => {
    const csv = blockIdCohortCsv([mkRow({ company: "=cmd|calc", reportUrl: "/tbr/tok" })], "https://blockid.au");
    expect(csv).toContain("'=cmd|calc");
    expect(csv).toContain("https://blockid.au/tbr/tok");
  });

  it("carries the dimension columns in DIMENSION_KEYS order", () => {
    const csv = blockIdCohortCsv([mkRow({ dimensionScores: SCORES })]);
    const idx = BLOCKID_COHORT_CSV_HEADERS.indexOf("Founder & Team" as (typeof BLOCKID_COHORT_CSV_HEADERS)[number]);
    expect(idx).toBeGreaterThan(-1);
    expect(DIMENSION_KEYS.length).toBe(8);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[1].split(",")[idx]).toBe(String(SCORES.ftv));
  });

  it("uses normaliseWeights as ground truth for equal weights (sanity cross-check)", () => {
    expect(normaliseWeights(undefined)).toEqual(equalWeights());
  });
});
