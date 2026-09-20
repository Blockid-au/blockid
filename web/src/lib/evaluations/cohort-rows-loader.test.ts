// Colocated vitest for lib/evaluations/cohort-rows-loader (G21 P2-B). The
// DB-facing half of the BlockID Cohort row assembly: `./batch` (loadCohortRows),
// `./cohort-decisions` (loadCohortDecisions) and `./overrides`
// (listBatchOverrides) are mocked so this file pins ONLY the loader's own
// wiring, against a small in-memory fake of @/lib/supabase. Pins:
// analysisInputFromSnapshot (null snapshot -> nulls, a stored
// evidence_confidence with no analysis_json -> that number, analysis_json
// with `subs` routes through the Assessment Card builder and the STORED
// column wins over the card's own confidence number, a card-builder throw
// falls back to evidenceConfidenceFromAnalysis and a second throw falls
// back to the stored value alone); loadItemExtras (maps the 0423 columns,
// a 42703 "column does not exist" retries with `id, snapshot_id` and
// defaults, any other error yields an empty map); loadAssessmentLog (maps
// decision fields only, names joined, empty on error / empty ids);
// loadBlockIdCohortRows (no supabase -> rows built from the base rows with
// defaults; with supabase -> extras + viewer decisions + overrides + log
// wired into buildCohortRows, and getCohortDeltas used via a registered
// provider); and findBatchItem (null when the item id is not in the
// batch, else id/evaluationId/projectId/snapshotId/sviTotal/dimensionScores).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
type Db = {
  evaluation_batch_items: Row[];
  projects: Row[];
  claims: Row[];
  svi_snapshots: Row[];
  evaluation_assessments: Row[];
  app_users: Row[];
};

const state: {
  db: Db;
  errors: Partial<Record<keyof Db, { code?: string; message?: string }>>;
  onceErrors: Partial<Record<keyof Db, { code?: string; message?: string }>>;
  configured: boolean;
} = {
  db: { evaluation_batch_items: [], projects: [], claims: [], svi_snapshots: [], evaluation_assessments: [], app_users: [] },
  errors: {},
  onceErrors: {},
  configured: true,
};

function resetDb(): void {
  state.db = { evaluation_batch_items: [], projects: [], claims: [], svi_snapshots: [], evaluation_assessments: [], app_users: [] };
  state.errors = {};
  state.onceErrors = {};
  state.configured = true;
}

function builder(table: keyof Db) {
  type Filter = (r: Row) => boolean;
  const filters: Filter[] = [];
  let ordering: { col: string; asc: boolean } | null = null;
  let lim: number | null = null;

  const rowsMatching = () => {
    let rows = state.db[table].filter((r) => filters.every((f) => f(r)));
    if (ordering) {
      const { col, asc } = ordering;
      rows = [...rows].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : String(a[col] ?? "") > String(b[col] ?? "") ? 1 : 0) * (asc ? 1 : -1));
    }
    if (lim != null) rows = rows.slice(0, lim);
    return rows;
  };

  const run = () => {
    const once = state.onceErrors[table];
    if (once) {
      state.onceErrors[table] = undefined;
      return { data: null, error: once };
    }
    const err = state.errors[table];
    if (err) return { data: null, error: err };
    return { data: rowsMatching().map((r) => ({ ...r })), error: null };
  };

  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select() {
      return b;
    },
    eq(col: string, val: unknown) {
      filters.push((r) => String(r[col]) === String(val));
      return b;
    },
    in(col: string, vals: unknown[]) {
      filters.push((r) => vals.map(String).includes(String(r[col])));
      return b;
    },
    order(col: string, o?: { ascending?: boolean }) {
      ordering = { col, asc: o?.ascending !== false };
      return b;
    },
    limit(n: number) {
      lim = n;
      return b;
    },
    maybeSingle() {
      const { data, error } = run();
      const rows = (data ?? []) as Row[];
      return Promise.resolve({ data: rows[0] ?? null, error });
    },
    then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) {
      return Promise.resolve(run()).then(ok, err);
    },
  });
  return b;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (state.configured ? { from: (t: keyof Db) => builder(t) } : null),
}));

const { loadCohortRowsMock } = vi.hoisted(() => ({ loadCohortRowsMock: vi.fn() }));
vi.mock("./batch", () => ({ loadCohortRows: (b: unknown) => loadCohortRowsMock(b) }));

const { loadCohortDecisionsMock } = vi.hoisted(() => ({ loadCohortDecisionsMock: vi.fn() }));
vi.mock("./cohort-decisions", () => ({ loadCohortDecisions: (ids: unknown, uid: unknown) => loadCohortDecisionsMock(ids, uid) }));

const { listBatchOverridesMock } = vi.hoisted(() => ({ listBatchOverridesMock: vi.fn() }));
vi.mock("./overrides", () => ({ listBatchOverrides: (id: unknown) => listBatchOverridesMock(id) }));

const { cardMock, confMock } = vi.hoisted(() => ({ cardMock: vi.fn(), confMock: vi.fn() }));
vi.mock("@/lib/svi/assessment-card", () => ({ assessmentCardFromAnalysis: (...a: unknown[]) => cardMock(...a) }));
vi.mock("@/lib/svi/evidence-confidence", () => ({ evidenceConfidenceFromAnalysis: (...a: unknown[]) => confMock(...a) }));

import { equalWeights, type CohortRow as BatchCohortRow, type EvaluationBatch } from "./batch-shared";
import { registerCohortDeltaProvider } from "./cohort-rows";
import {
  analysisInputFromSnapshot,
  findBatchItem,
  loadAssessmentLog,
  loadBlockIdCohortRows,
  loadItemExtras,
} from "./cohort-rows-loader";

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

function batch(over: Partial<EvaluationBatch> = {}): EvaluationBatch {
  return { id: "b-1", userId: "u-owner", name: "Cohort 4", rubricWeights: equalWeights(), status: "done", total: 1, doneCount: 1, failedCount: 0, createdAt: "2026-09-10T00:00:00Z", startedAt: null, finishedAt: null, ...over };
}

beforeEach(() => {
  resetDb();
  loadCohortRowsMock.mockReset();
  loadCohortDecisionsMock.mockReset().mockResolvedValue(new Map());
  listBatchOverridesMock.mockReset().mockResolvedValue({ rows: [], available: true });
  cardMock.mockReset();
  confMock.mockReset();
});

afterEach(() => {
  registerCohortDeltaProvider(null);
});

describe("analysisInputFromSnapshot", () => {
  it("a null snapshot yields all nulls except the passed-through verification level / conflicting count", () => {
    expect(analysisInputFromSnapshot(null, 2, 0)).toEqual({ evidenceConfidence: null, verificationLevel: 2, pendingDims: null, unverifiedMaterialClaims: null, conflictingClaims: 0 });
  });

  it("a stored evidence_confidence with no analysis_json is used as-is", () => {
    const r = analysisInputFromSnapshot({ evidence_confidence: 62.6 }, 1, null);
    expect(r).toEqual({ evidenceConfidence: 62.6, verificationLevel: 1, pendingDims: null, unverifiedMaterialClaims: null, conflictingClaims: null });
  });

  it("analysis_json with `subs` routes through the Assessment Card builder; the STORED confidence wins over the card's own number", () => {
    cardMock.mockReturnValueOnce({ pendingDims: 2, unverifiedMaterialClaims: 1, evidenceConfidence: 55 });
    const r = analysisInputFromSnapshot({ analysis_json: { subs: [] }, evidence_confidence: 62 }, 3, 1);
    expect(cardMock).toHaveBeenCalledTimes(1);
    expect(r.pendingDims).toBe(2);
    expect(r.unverifiedMaterialClaims).toBe(1);
    expect(r.evidenceConfidence).toBe(62); // stored wins, not the card's 55
  });

  it("no stored confidence: the card's own evidenceConfidence is used", () => {
    cardMock.mockReturnValueOnce({ pendingDims: 0, unverifiedMaterialClaims: 0, evidenceConfidence: 55 });
    const r = analysisInputFromSnapshot({ analysis_json: { subs: [] }, evidence_confidence: null }, 3, 0);
    expect(r.evidenceConfidence).toBe(55);
  });

  it("a card-builder throw falls back to evidenceConfidenceFromAnalysis", () => {
    cardMock.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    confMock.mockReturnValueOnce(48);
    const r = analysisInputFromSnapshot({ analysis_json: { subs: [] }, evidence_confidence: null }, 3, 0);
    expect(r.evidenceConfidence).toBe(48);
    expect(r.pendingDims).toBeNull(); // never set — the card threw before assigning
  });

  it("a stored value still wins even after a card-builder throw", () => {
    cardMock.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const r = analysisInputFromSnapshot({ analysis_json: { subs: [] }, evidence_confidence: 40 }, 3, 0);
    expect(r.evidenceConfidence).toBe(40);
    expect(confMock).not.toHaveBeenCalled();
  });

  it("both the card builder AND the evidence-confidence fallback throw -> falls back to the stored value (possibly null)", () => {
    cardMock.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    confMock.mockImplementationOnce(() => {
      throw new Error("boom too");
    });
    const r = analysisInputFromSnapshot({ analysis_json: { subs: [] }, evidence_confidence: null }, 3, 0);
    expect(r.evidenceConfidence).toBeNull();
  });
});

describe("loadItemExtras", () => {
  it("maps the 0423 item columns, defaulting an invalid review_status", async () => {
    state.db.evaluation_batch_items.push(
      { id: 1, batch_id: "b-1", snapshot_id: "snap-1", shortlisted: true, review_status: "reviewed", reviewer_id: "u-2" },
      { id: 2, batch_id: "b-1", snapshot_id: null, shortlisted: false, review_status: "bogus", reviewer_id: null },
    );
    const supabase = { from: (t: keyof Db) => builder(t) };
    const extras = await loadItemExtras(supabase as never, "b-1");
    expect(extras.get(1)).toEqual({ snapshotId: "snap-1", shortlisted: true, reviewStatus: "reviewed", reviewerId: "u-2" });
    expect(extras.get(2)).toEqual({ snapshotId: null, shortlisted: false, reviewStatus: "unreviewed", reviewerId: null });
  });

  it("a 42703 column-does-not-exist error retries with just id, snapshot_id and defaults the rest", async () => {
    state.db.evaluation_batch_items.push({ id: 1, batch_id: "b-1", snapshot_id: "snap-1" });
    state.onceErrors.evaluation_batch_items = { code: "42703", message: 'column evaluation_batch_items.review_status does not exist' };
    const supabase = { from: (t: keyof Db) => builder(t) };
    const extras = await loadItemExtras(supabase as never, "b-1");
    expect(extras.get(1)).toEqual({ snapshotId: "snap-1", shortlisted: false, reviewStatus: "unreviewed", reviewerId: null });
  });

  it("any other error yields an empty map (no retry)", async () => {
    state.db.evaluation_batch_items.push({ id: 1, batch_id: "b-1", snapshot_id: "snap-1" });
    state.errors.evaluation_batch_items = { code: "23505", message: "duplicate key" };
    const supabase = { from: (t: keyof Db) => builder(t) };
    const extras = await loadItemExtras(supabase as never, "b-1");
    expect(extras.size).toBe(0);
  });
});

describe("loadAssessmentLog", () => {
  it("maps decision fields only, names joined from app_users", async () => {
    state.db.evaluation_assessments.push(
      { evaluation_id: "e-1", version: 2, status: "draft", decision: "track", conviction: 2, assessor_user_id: "u-3", updated_at: "2026-09-12T00:00:00Z", private_notes: "should never leak" },
      { evaluation_id: "e-1", version: 1, status: "submitted", decision: "bogus", conviction: null, assessor_user_id: null, updated_at: "2026-09-11T00:00:00Z" },
    );
    state.db.app_users.push({ id: "u-3", display_name: "Assessor Three", email: "a3@x.test" });
    const supabase = { from: (t: keyof Db) => builder(t) };
    const log = await loadAssessmentLog(supabase as never, ["e-1"]);
    expect(log).toHaveLength(2);
    expect(log[0]).toEqual({ evaluationId: "e-1", version: 2, status: "draft", decision: "track", conviction: 2, assessorId: "u-3", assessorName: "Assessor Three", updatedAt: "2026-09-12T00:00:00Z" });
    expect(log[1]).toMatchObject({ decision: null, assessorId: null, assessorName: null }); // unknown decision -> null, no assessor -> no name lookup
    expect((log[0] as Record<string, unknown>).private_notes).toBeUndefined();
  });

  it("empty evaluationIds never queries and returns []", async () => {
    const supabase = { from: (t: keyof Db) => builder(t) };
    expect(await loadAssessmentLog(supabase as never, [])).toEqual([]);
  });

  it("a read error returns []", async () => {
    state.errors.evaluation_assessments = { code: "42P01", message: "relation does not exist" };
    const supabase = { from: (t: keyof Db) => builder(t) };
    expect(await loadAssessmentLog(supabase as never, ["e-1"])).toEqual([]);
  });
});

describe("loadBlockIdCohortRows", () => {
  it("no supabase: rows are built from the base rows with defaults", async () => {
    state.configured = false;
    const baseRows = [legacyRow()];
    loadCohortRowsMock.mockResolvedValueOnce(baseRows);
    const result = await loadBlockIdCohortRows(batch(), "u-viewer");
    expect(result.overridesAvailable).toBe(false);
    expect(result.baseRows).toBe(baseRows);
    expect(result.rows).toHaveLength(1);
    const [r] = result.rows;
    expect(r.shortlisted).toBe(false);
    expect(r.reviewStatus).toBe("unreviewed");
    expect(r.reviewer).toBeNull();
    expect(r.confidence).toBeNull();
    expect(r.decision).toBeNull();
    expect(loadCohortDecisionsMock).not.toHaveBeenCalled();
    expect(listBatchOverridesMock).not.toHaveBeenCalled();
  });

  it("with supabase: extras + viewer decisions + overrides + log + the Δ provider are all wired into the row", async () => {
    const baseRows = [legacyRow({ itemId: 1, evaluationId: "e-1", projectId: "p-1" })];
    loadCohortRowsMock.mockResolvedValueOnce(baseRows);
    loadCohortDecisionsMock.mockResolvedValueOnce(new Map([["e-1", { decision: "proceed" as const, conviction: 4, thesisFitPct: 80, assessmentStatus: "submitted" as const }]]));
    listBatchOverridesMock.mockResolvedValueOnce({ rows: [], available: true });

    state.db.evaluation_batch_items.push({ id: 1, batch_id: "b-1", snapshot_id: "snap-1", shortlisted: true, review_status: "reviewed", reviewer_id: "u-2" });
    state.db.app_users.push({ id: "u-2", display_name: "Reviewer Two", email: "r2@x.test" }, { id: "u-3", display_name: "Assessor Three", email: "a3@x.test" });
    state.db.projects.push({ id: "p-1", verification_level: 3 });
    state.db.claims.push({ project_id: "p-1", assessment_status: "conflicting" });
    state.db.svi_snapshots.push({ id: "snap-1", project_id: "p-1", analysis_json: null, evidence_confidence: 58 });
    state.db.evaluation_assessments.push({ evaluation_id: "e-1", version: 1, status: "submitted", decision: "proceed", conviction: 4, assessor_user_id: "u-3", updated_at: "2026-09-13T00:00:00Z" });

    const seenBatchIds: string[] = [];
    registerCohortDeltaProvider(async (batchId) => {
      seenBatchIds.push(batchId);
      return { "p-1": 9 };
    });

    const result = await loadBlockIdCohortRows(batch(), "u-viewer");
    expect(result.overridesAvailable).toBe(true);
    expect(seenBatchIds).toEqual(["b-1"]);
    expect(loadCohortDecisionsMock).toHaveBeenCalledWith(["e-1"], "u-viewer");
    expect(listBatchOverridesMock).toHaveBeenCalledWith("b-1");

    const [r] = result.rows;
    expect(r.shortlisted).toBe(true);
    expect(r.reviewStatus).toBe("reviewed");
    expect(r.reviewer).toEqual({ id: "u-2", name: "Reviewer Two" });
    expect(r.confidence).toBe(58);
    expect(r.verificationLevel).toBe(3);
    expect(r.verification).toBe("L3");
    expect(r.riskFlags).toContain("conflicting_claims");
    expect(r.decision).toBe("proceed");
    expect(r.conviction).toBe(4);
    expect(r.assessmentStatus).toBe("submitted");
    expect(r.delta).toBe(9); // from the registered Δ provider
    expect(r.log).toHaveLength(1);
    expect(r.log[0]).toMatchObject({ kind: "assessment", actorId: "u-3", actorName: "Assessor Three", version: 1 });
  });

  it("swallows a decisions/overrides/log read failure and still returns rows", async () => {
    const baseRows = [legacyRow()];
    loadCohortRowsMock.mockResolvedValueOnce(baseRows);
    loadCohortDecisionsMock.mockRejectedValueOnce(new Error("boom"));
    listBatchOverridesMock.mockRejectedValueOnce(new Error("boom"));
    const result = await loadBlockIdCohortRows(batch(), "u-viewer");
    expect(result.rows).toHaveLength(1);
    expect(result.overridesAvailable).toBe(false);
    expect(result.rows[0].decision).toBeNull();
  });
});

describe("findBatchItem", () => {
  it("null when the item id is not in the batch", async () => {
    loadCohortRowsMock.mockResolvedValueOnce([legacyRow({ itemId: 1 })]);
    expect(await findBatchItem(batch(), 99)).toBeNull();
  });

  it("returns id/evaluationId/projectId/snapshotId/sviTotal/dimensionScores when found", async () => {
    loadCohortRowsMock.mockResolvedValueOnce([legacyRow({ itemId: 1, evaluationId: "e-1", projectId: "p-1", svi: 71, dimensionScores: SCORES })]);
    state.db.evaluation_batch_items.push({ id: 1, batch_id: "b-1", snapshot_id: "snap-1" });
    const item = await findBatchItem(batch(), 1);
    expect(item).toEqual({ id: 1, evaluationId: "e-1", projectId: "p-1", snapshotId: "snap-1", sviTotal: 71, dimensionScores: SCORES });
  });

  it("snapshotId is null when there is no Supabase client, or when the item row is not found", async () => {
    loadCohortRowsMock.mockResolvedValueOnce([legacyRow({ itemId: 1 })]);
    state.configured = false;
    const item = await findBatchItem(batch(), 1);
    expect(item?.snapshotId).toBeNull();
  });
});
