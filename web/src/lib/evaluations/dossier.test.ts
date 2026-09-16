// Colocated vitest for lib/evaluations/dossier.ts (G13-W2-D1, S-D1).
// Pins:
//   * access = ONE evaluations lookup: unknown id / other evaluator /
//     un-claimed founder → null (the callers 404); evaluator → "assessor";
//     claimed founder → "founder" with the invite token stripped;
//   * the founder view NEVER carries an assessment field (decision chip
//     null, mine null, history empty) while the evaluator's does;
//   * consent masking by tier (attributed_only → evidence counts only;
//     reports_shared → items without document links; full_mentor → links +
//     data-room flag) is applied server-side for BOTH roles;
//   * block 1 = the report cover radar spec (same kind the TBR renders),
//     8 weighted rows in DIM_ORDER with weights from dimension-owners.ts,
//     Δ30d from the older snapshot, 13 criteria rows with honest
//     "0 evidence — self_declared";
//   * a stored report_v2 is preferred; without one the adapter builds it;
//     no snapshot → report.available false, criteria still 13 rows;
//   * round shape: the reads after access run in ONE Promise.all (the
//     percentile is a cached extra) — pinned by counting calls.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
interface Call { table: string; select: string; filters: Array<[string, unknown]>; }
const state = {
  calls: [] as Call[],
  tables: {} as Record<string, Row[] | { error: { code?: string; message?: string } }>,
  admin: true,
  failOnce: {} as Record<string, { code?: string; message?: string }>,
};

function fakeBuilder(table: string) {
  const call: Call = { table, select: "", filters: [] };
  state.calls.push(call);
  let single = false;
  let limit: number | null = null;
  const run = async () => {
    const once = state.failOnce[table];
    if (once) {
      delete state.failOnce[table];
      return { data: null, error: once };
    }
    const src = state.tables[table];
    if (src && !Array.isArray(src)) return { data: null, error: src.error };
    let rows = (src ?? []) as Row[];
    for (const [k, v] of call.filters) {
      if (k === "__or") continue;
      if (k === "__lte") rows = rows.filter((r) => String(r.created_at) <= String(v));
      else if (k === "__in") rows = rows.filter((r) => (v as { col: string; vals: unknown[] }).vals.includes(r[(v as { col: string }).col]));
      else rows = rows.filter((r) => r[k] === v);
    }
    if (limit != null) rows = rows.slice(0, limit);
    if (single) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  };
  const q: Record<string, unknown> = {
    select: (cols: string) => { call.select = cols; return q; },
    eq: (k: string, v: unknown) => { call.filters.push([k, v]); return q; },
    lte: (k: string, v: unknown) => { call.filters.push(["__lte", v]); return q; },
    in: (col: string, vals: unknown[]) => { call.filters.push(["__in", { col, vals }]); return q; },
    or: (expr: string) => { call.filters.push(["__or", expr]); return q; },
    not: () => q,
    order: () => q,
    limit: (n: number) => { limit = n; return q; },
    maybeSingle: () => { single = true; return run(); },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
  };
  return q;
}

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => (state.admin ? { from: (t: string) => fakeBuilder(t) } : null) }));

const getTaxonomyMock = vi.fn();
vi.mock("@/lib/taxonomy/store", () => ({ getTaxonomy: (id: string) => getTaxonomyMock(id) }));

const getAssessmentMock = vi.fn();
vi.mock("@/lib/evaluations/assessments", () => ({ getAssessment: (id: string, viewer: unknown) => getAssessmentMock(id, viewer) }));

const percentileMock = vi.fn();
vi.mock("@/lib/agents/cohort-percentile", () => ({ computeCohortPercentile: (a: unknown) => percentileMock(a) }));

import { __resetDossierCaches, buildCriterionRows, findEvaluationIdForProject, loadDossier, projectEvidenceByTier, resolveDossierAccess } from "./dossier";
import { DIMENSION_OWNERS, DIM_ORDER } from "@/lib/report-pipeline/dimension-owners";
import { fromSnapshot } from "@/lib/report-v2/adapter";

const EVAL: Row = {
  id: "e-1", evaluator_user_id: "u-eval", project_id: "p-1", owner_kind: "founder_claimed", consent_tier: "reports_shared",
  founder_email: "jo@acme.io", founder_user_id: "u-founder", invite_token: "tok-secret", invited_at: null, claimed_at: "2026-09-01T00:00:00Z",
  label: "Cohort 4", notes: null, website: "https://acme.io", state: "NSW", created_at: "2026-08-20T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  projects: { id: "p-1", name: "Acme Robotics", slug: "acme-robotics", industry: "DeepTech", stage: 3, description: null, growth_phase_current: null },
};

const DIMS = { tre: 61, mpc: 70, ftv: 55, ptd: 66, cgh: 48, iri: 52, lco: 40, svm: 58 };
const LATEST: Row = {
  id: "s-2", project_id: "p-1", svi_total: 62, stage: 3, created_at: "2026-09-12T00:00:00Z",
  dim_results: Object.fromEntries(Object.entries(DIMS).map(([k, v]) => [k, { status: "complete", score: v, markdown: null, insights: [] }])),
  dimension_scores: DIMS,
  criterion_results: [
    { key: "idea", title: "Idea & Innovation", primary_dimension: "mpc", weight: 10, score: 74, verdict: "Clear wedge in warehouse robotics.", strengths: [], gaps: [], next_action: "x" },
    { key: "revenue", title: "Revenue", primary_dimension: "tre", weight: 10, score: 40, verdict: "Two paying pilots.", strengths: [], gaps: [], next_action: "y" },
  ],
  analysis_json: { industry: "DeepTech", stageLabel: "Seed" },
  report_v2: null,
};
const OLDER: Row = { id: "s-1", project_id: "p-1", svi_total: 58, stage: 3, created_at: "2026-08-01T00:00:00Z", dim_results: null, dimension_scores: { ...DIMS, tre: 50, lco: 44 } };

const EVIDENCE: Row[] = [
  { project_id: "p-1", dimension: "tre", evidence_type: "customer_contracts", evidence_label: "Customer contracts", confidence_level: "document_uploaded", evidence_value_or_url: "drive://contracts.pdf", created_at: "2026-09-02T00:00:00Z" },
  { project_id: "p-1", dimension: "tre", evidence_type: "stripe", evidence_label: "Stripe MRR", confidence_level: "connected_source", evidence_value_or_url: null, created_at: "2026-09-03T00:00:00Z" },
  { project_id: "p-1", dimension: "mpc", evidence_type: "landing", evidence_label: "Landing page", confidence_level: "public_url", evidence_value_or_url: "https://acme.io", created_at: "2026-09-04T00:00:00Z" },
];

const MINE = { id: "a-1", evaluationId: "e-1", decision: "track", status: "submitted", version: 2, privateNotes: "secret", conviction: 3 };

beforeEach(() => {
  state.calls = [];
  state.admin = true;
  state.failOnce = {};
  state.tables = {
    evaluations: [EVAL],
    svi_snapshots: [LATEST, OLDER],
    svi_dimension_evidence: EVIDENCE,
    connector_snapshots: [{ project_id: "p-1", provider: "stripe" }, { project_id: "p-1", provider: "stripe" }],
    evaluation_reports: [{ evaluation_id: "e-1", share_token: "tok-abc", created_at: "2026-09-12T00:00:00Z", kind: "full" }],
  };
  getTaxonomyMock.mockReset();
  getTaxonomyMock.mockResolvedValue({ industry: "advanced_manufacturing", business_model: "unclassified", stage_key: "seed", sources: { industry: "auto" }, tags: [] });
  getAssessmentMock.mockReset();
  getAssessmentMock.mockImplementation(async (_id: string, viewer: { role: string }) =>
    viewer.role === "founder"
      ? { available: true, mine: null, history: [], sharedWithFounder: null }
      : { available: true, mine: MINE, history: [{ id: "a-1", version: 2 }, { id: "a-0", version: 1 }], sharedWithFounder: null },
  );
  percentileMock.mockReset();
  percentileMock.mockResolvedValue({ percentile: 61.4, source: "real_cohort", cohortSize: 120, stageMatched: 3 });
  __resetDossierCaches();
});

describe("resolveDossierAccess", () => {
  it("evaluator → assessor; claimed founder → founder (invite token stripped); strangers → null", async () => {
    const a = await resolveDossierAccess("e-1", "u-eval");
    expect(a?.role).toBe("assessor");
    expect(a?.evaluation.inviteToken).toBe("tok-secret");
    expect(a?.project.slug).toBe("acme-robotics");

    const f = await resolveDossierAccess("e-1", "u-founder");
    expect(f?.role).toBe("founder");
    expect(f?.evaluation.inviteToken).toBeNull();

    state.tables.evaluations = [{ ...EVAL, owner_kind: "founder_invited", claimed_at: null }];
    expect(await resolveDossierAccess("e-1", "u-founder")).toBeNull();
    expect(await resolveDossierAccess("e-1", "u-stranger")).toBeNull();
    expect(await resolveDossierAccess("nope", "u-eval")).toBeNull();
  });
});

describe("loadDossier — evaluator", () => {
  it("returns header + block 1 from persisted rows with weights, Δ30d, percentile and the cover radar", async () => {
    const d = await loadDossier("e-1", "u-eval");
    expect(d).not.toBeNull();
    expect(d!.viewer).toEqual({ role: "assessor", userId: "u-eval" });
    const h = d!.header;
    expect(h.name).toBe("Acme Robotics");
    expect(h.website).toBe("https://acme.io");
    expect(h.state).toBe("NSW");
    expect(h.svi).toBe(62);
    expect(h.delta30d).toBe(4);
    expect(h.percentile).toEqual({ value: 61, source: "real_cohort", cohortSize: 120 });
    expect(h.consentTier).toBe("reports_shared");
    expect(h.founderClaimed).toBe(true);
    expect(h.lastSnapshotAt).toBe("2026-09-12T00:00:00Z");
    expect(h.evidence).toEqual({ items: 3, connected: 1, providers: ["stripe"] });
    expect(h.decision).toEqual({ value: "track", status: "submitted", version: 2 });
    expect(h.badges.map((b) => b.label)).toEqual(["Advanced manufacturing", "Unclassified", "Seed (Post-PMF)"]);
    expect(h.badges[1].unclassified).toBe(true);

    const r = d!.report;
    expect(r.available).toBe(true);
    expect(r.source).toBe("adapter");
    expect(r.radar?.kind).toBe("radar");
    expect(r.radar?.id).toBe("cover-radar");
    expect(r.dims.map((x) => x.dim)).toEqual([...DIM_ORDER]);
    expect(r.dims.map((x) => x.weight)).toEqual(DIM_ORDER.map((k) => DIMENSION_OWNERS[k].weight));
    expect(r.dims.reduce((s, x) => s + x.weight, 0)).toBe(100);
    const tre = r.dims.find((x) => x.dim === "tre")!;
    expect(tre.score).toBe(61);
    expect(tre.delta30d).toBe(11);
    expect(tre.ownerAgent).toBe("CRO");
    expect(typeof tre.p50).toBe("number");
    expect(r.criteria).toHaveLength(13);
    const idea = r.criteria.find((c) => c.key === "idea")!;
    expect(idea.score).toBe(74);
    expect(idea.verdict).toBe("Clear wedge in warehouse robotics.");
    expect(idea.evidenceCount).toBe(1); // mpc has one public_url row
    expect(idea.strongestSource).toBe("public_url");
    const docs = r.criteria.find((c) => c.key === "documents")!;
    expect(docs.evidenceCount).toBe(0);
    expect(docs.strongestSource).toBe("self_declared");
    expect(r.links.fullReport).toBe("/tbr/tok-abc");
    expect(r.links.analyze).toBe("/workspace/projects/acme-robotics/analyze");

    expect(d!.assessment.mine).toEqual(MINE);
    expect(d!.assessment.history).toHaveLength(2);
    expect(getAssessmentMock).toHaveBeenCalledWith("e-1", { userId: "u-eval", role: "assessor" });
  });

  it("prefers a stored report_v2 over the adapter", async () => {
    const stored = fromSnapshot({ snapshotId: "s-2", projectId: "p-1", startupName: "Stored Name", stage: 3, sviTotal: 62, dimStates: { tre: { score: 61 } }, tier: "standard" });
    state.tables.svi_snapshots = [{ ...LATEST, report_v2: { ...stored, source: "pipeline" } }, OLDER];
    const d = await loadDossier("e-1", "u-eval");
    expect(d!.report.source).toBe("pipeline");
  });

  it("no snapshot → report unavailable but 13 honest criteria rows and null score", async () => {
    state.tables.svi_snapshots = [];
    const d = await loadDossier("e-1", "u-eval");
    expect(d!.header.svi).toBeNull();
    expect(d!.header.delta30d).toBeNull();
    expect(d!.header.percentile).toBeNull();
    expect(d!.report.available).toBe(false);
    expect(d!.report.radar).toBeNull();
    expect(d!.report.dims).toEqual([]);
    expect(d!.report.criteria).toHaveLength(13);
    expect(d!.report.criteria[0].verdict).toBe("Not scored yet.");
    expect(percentileMock).not.toHaveBeenCalled();
  });

  it("runs the post-access reads as one parallel round and caches the percentile for 10 minutes", async () => {
    await loadDossier("e-1", "u-eval");
    const tables = state.calls.map((c) => c.table);
    expect(tables[0]).toBe("evaluations");
    expect(tables.slice(1).sort()).toEqual(["connector_snapshots", "evaluation_reports", "svi_dimension_evidence", "svi_snapshots", "svi_snapshots"]);
    expect(percentileMock).toHaveBeenCalledTimes(1);
    await loadDossier("e-1", "u-eval");
    expect(percentileMock).toHaveBeenCalledTimes(1);
  });

  it("0395 not applied: retries the latest-snapshot read without report_v2", async () => {
    state.failOnce.svi_snapshots = { code: "42703", message: "column svi_snapshots.report_v2 does not exist" };
    const d = await loadDossier("e-1", "u-eval");
    expect(d).not.toBeNull();
    expect(d!.header.svi).toBe(62);
    const snapshotCalls = state.calls.filter((c) => c.table === "svi_snapshots");
    expect(snapshotCalls[0].select).toContain("report_v2");
    expect(snapshotCalls.some((c) => !c.select.includes("report_v2"))).toBe(true);
  });
});

describe("loadDossier — founder preview (§C.1)", () => {
  it("never carries an assessment field: no decision chip, mine null, history empty", async () => {
    const d = await loadDossier("e-1", "u-founder");
    expect(d!.viewer.role).toBe("founder");
    expect(d!.header.decision).toBeNull();
    expect(d!.assessment).toEqual({ available: true, mine: null, history: [], sharedWithFounder: null });
    expect(getAssessmentMock).toHaveBeenCalledWith("e-1", { userId: "u-founder", role: "founder" });
    const json = JSON.stringify(d);
    for (const needle of ["secret", "track", "conviction", "privateNotes", "tok-secret"]) expect(json, `founder view leaked ${needle}`).not.toContain(needle);
    // the report block is the same block 1 the evaluator sees
    expect(d!.report.dims).toHaveLength(8);
    expect(d!.report.radar?.kind).toBe("radar");
  });

  it("an assessments module that returns founder data is still filtered by role at the view boundary", async () => {
    getAssessmentMock.mockResolvedValue({ available: true, mine: MINE, history: [{ id: "a-1" }], sharedWithFounder: null });
    const d = await loadDossier("e-1", "u-founder");
    expect(d!.assessment.mine).toBeNull();
    expect(d!.assessment.history).toEqual([]);
    expect(d!.header.decision).toBeNull();
    // The evaluator's private label never reaches the claimed founder (W2 review P1).
    expect(d!.header.label).toBeNull();
    expect(JSON.stringify(d)).not.toContain("Cohort 4");
  });

  it("the evaluator (assessor) still sees their own label", async () => {
    const d = await loadDossier("e-1", "u-eval");
    expect(d?.header.label).toBe("Cohort 4");
  });
});

describe("consent masking — projectEvidenceByTier", () => {
  const rows = EVIDENCE.map((r) => ({ ...r })) as Parameters<typeof projectEvidenceByTier>[1];

  it("attributed_only → counts only, no items, upgrade to reports_shared", () => {
    const b = projectEvidenceByTier("attributed_only", rows, ["stripe"]);
    expect(b.items).toBeNull();
    expect(b.countsByDimension.tre).toBe(2);
    expect(b.countsByDimension.mpc).toBe(1);
    expect(b.dataroomAvailable).toBe(false);
    expect(b.requestUpgrade).toBe("reports_shared");
    expect(JSON.stringify(b)).not.toContain("drive://");
  });

  it("reports_shared → items, public URLs only, document links withheld", () => {
    const b = projectEvidenceByTier("reports_shared", rows, []);
    expect(b.items).toHaveLength(3);
    expect(b.items!.find((i) => i.type === "customer_contracts")!.url).toBeNull();
    expect(b.items!.find((i) => i.type === "landing")!.url).toBe("https://acme.io");
    expect(b.dataroomAvailable).toBe(false);
    expect(b.requestUpgrade).toBe("full_mentor");
  });

  it("full_mentor → every link + data-room flag, nothing further to request", () => {
    const b = projectEvidenceByTier("full_mentor", rows, []);
    expect(b.items!.find((i) => i.type === "customer_contracts")!.url).toBe("drive://contracts.pdf");
    expect(b.dataroomAvailable).toBe(true);
    expect(b.requestUpgrade).toBeNull();
  });

  it("the loader applies the evaluation's tier (attributed_only hides items from BOTH roles)", async () => {
    state.tables.evaluations = [{ ...EVAL, consent_tier: "attributed_only" }];
    const ev = await loadDossier("e-1", "u-eval");
    const fo = await loadDossier("e-1", "u-founder");
    expect(ev!.evidence.items).toBeNull();
    expect(fo!.evidence.items).toBeNull();
    expect(JSON.stringify(ev)).not.toContain("drive://");
  });
});

describe("buildCriterionRows", () => {
  it("without a report every criterion still renders with 0 evidence — self_declared", () => {
    const rows = buildCriterionRows(null, { tre: 0, mpc: 0, ftv: 0, ptd: 0, cgh: 0, iri: 0, lco: 0, svm: 0 }, {});
    expect(rows).toHaveLength(13);
    expect(rows.every((r) => r.score === null && r.evidenceCount === 0 && r.strongestSource === "self_declared")).toBe(true);
  });
});

describe("findEvaluationIdForProject", () => {
  it("prefers the caller's own evaluator row, else a claimed founder row, else null", async () => {
    state.tables.evaluations = [EVAL];
    expect(await findEvaluationIdForProject("u-eval", "p-1")).toBe("e-1");
    expect(await findEvaluationIdForProject("u-founder", "p-1")).toBe("e-1");
    expect(await findEvaluationIdForProject("u-stranger", "p-1")).toBeNull();
  });
});
