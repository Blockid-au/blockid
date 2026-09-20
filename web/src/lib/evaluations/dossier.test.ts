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
//     percentile is a cached extra) — pinned by counting calls;
//   * S-R4: block 2 (valuation from ReportV2 + the assessor's own view
//     overlaid), block 5 (progress radar scoped to this evaluation + since
//     my last assessment), header mandate fit (persisted row, else scoreFit)
//     and Δ since last view (previous dossier.viewed audit row) — all
//     assessor-only where the spec says so, never on the founder preview.

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

// S-R4 collaborators: mandates (S-T2) and the evaluator progress radar.
const listMandatesMock = vi.fn();
vi.mock("@/lib/investors/mandates", () => ({ listMandates: (uid: string) => listMandatesMock(uid) }));
const progressMock = vi.fn();
vi.mock("@/lib/evaluations/progress-radar", () => ({
  buildEvaluatorProgress: (opts: unknown) => progressMock(opts),
  createSupabaseProgressStore: () => ({ listEvaluations: async () => [{ id: "e-1", projectId: "p-1" }, { id: "e-9", projectId: "p-9" }] }),
}));

// S-D3 collaborators: seats consensus (lib/investor/organisations) — mocked so
// the round shape stays observable; `shareOrg` drives the org-seat access path.
const EMPTY_CONSENSUS = { available: false, orgId: null, orgName: null, seats: [], seatCount: 0, submittedCount: 0, medianRating: {}, disagreement: [], tally: { pass: 0, track: 0, proceed: 0 }, aggregate: null, meanConviction: null, label: "" };
const readConsensusMock = vi.fn(async () => EMPTY_CONSENSUS);
const shareOrgMock = vi.fn(async (): Promise<string | null> => null);
vi.mock("@/lib/investor/organisations", () => ({
  emptyConsensus: () => EMPTY_CONSENSUS,
  readConsensus: (input: unknown) => readConsensusMock(input as never),
  shareOrg: (a: string, b: string) => shareOrgMock(a as never, b as never),
}));

// G14-S37: the founder execution loader (founder_profiles + assessments +
// founder_signals + svi_signals) is mocked so the round shape stays
// observable; the rubric itself is real (lib/founder/execution.ts).
const founderExecutionCtxMock = vi.fn(async (_args: unknown) => ({ profile: null as unknown, evaluatorFlags: null, linkedin: null, github: null }));
vi.mock("@/lib/founder/execution-load", () => ({
  loadFounderExecutionContext: (args: unknown) => founderExecutionCtxMock(args),
}));

import { __resetDossierCaches, buildCriterionRows, findEvaluationIdForProject, loadDossier, projectEvidenceByTier, resolveDossierAccess } from "./dossier";
import { DIMENSION_OWNERS, DIM_ORDER } from "@/lib/report-pipeline/dimension-owners";
import { fromSnapshot } from "@/lib/report-v2/adapter";

const EVAL: Row = {
  id: "e-1", evaluator_user_id: "u-eval", project_id: "p-1", owner_kind: "founder_claimed", consent_tier: "reports_shared",
  founder_email: "jo@acme.io", founder_user_id: "u-founder", invite_token: "tok-secret", invited_at: null, claimed_at: "2026-09-01T00:00:00Z",
  label: "Cohort 4", notes: null, website: "https://acme.io", state: "NSW", created_at: "2026-08-20T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  projects: { id: "p-1", name: "Acme Robotics", slug: "acme-robotics", industry: "DeepTech", stage: 3, description: null, growth_phase_current: null, verification_level: 2, user_id: "u-founder" },
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

const MINE = { id: "a-1", evaluationId: "e-1", decision: "track", status: "submitted", version: 2, privateNotes: "secret", conviction: 3, snapshotId: "s-1", updatedAt: "2026-09-02T00:00:00Z", submittedAt: "2026-09-02T00:00:00Z", valuationView: { low_aud: 4_000_000, high_aud: 6_000_000, method_note: "comps-led" } };

const MANDATE = { id: "m-1", label: "Seed deep-tech AU", sectors_include: ["advanced_manufacturing"], sectors_exclude: [], business_models: [], customer_types: [], stages: ["seed"], cheque_min_aud: null, cheque_max_aud: null, lead_or_follow: null, geographies: [], revenue_min_aud: null, growth_min_pct: null, min_svi: null, tags_include: [], tags_exclude: [], weights: null, is_default: true };
const PROGRESS_ITEM = { evaluationId: "e-1", projectId: "p-1", projectSlug: "acme-robotics", name: "Acme Robotics", label: null, sviNow: 62, sviPrev: 58, delta: 4, stageNow: 3, stagePrev: 3, stageChanged: false, newEvidence: 2, lastReport: { at: "2026-09-12T00:00:00Z", svi: 62, kind: "full" }, money: { nextDeadline: null, deadlinesAhead: 1, newMatches: 0 }, scoreHistory: [50, 55, 58, 62] };

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
    audit_events: [{ id: 41, user_id: "u-eval", action: "dossier.viewed", resource_id: "e-1", ts: "2026-09-10T00:00:00Z", detail: { svi_total: 60, snapshot_id: "s-1" } }],
    mandate_fit_scores: [{ mandate_id: "m-1", project_id: "p-1", score: 77, reasons: ["Industry match"], gaps: [], blockers: [], computed_at: "2026-09-15T00:00:00Z" }],
    evaluator_progress_sends: [{ user_id: "u-eval", sent_at: "2026-09-08T00:00:00Z" }],
  };
  listMandatesMock.mockReset().mockResolvedValue({ migrated: true, mandates: [MANDATE], primary: MANDATE });
  progressMock.mockReset().mockResolvedValue({ userId: "u-eval", periodStart: "2026-09-14T00:00:00Z", periodEnd: "2026-09-16T00:00:00Z", items: [PROGRESS_ITEM], movers: [PROGRESS_ITEM], deadlines: [{ evaluationId: "e-1", projectId: "p-1", startup: "Acme Robotics", refKind: "grant", refId: "g-1", name: "Accelerating Commercialisation", closesAt: "2026-10-01", daysLeft: 15, url: null }, { evaluationId: "e-9", projectId: "p-9", startup: "Other", refKind: "program", refId: "pr-1", name: "Startmate", closesAt: "2026-10-05", daysLeft: 19, url: null }], newMatches: 0, newEvidence: 2, digest_ready: true });
  getTaxonomyMock.mockReset();
  getTaxonomyMock.mockResolvedValue({ industry: "advanced_manufacturing", business_model: "unclassified", stage_key: "seed", sources: { industry: "auto" }, tags: [] });
  getAssessmentMock.mockReset();
  getAssessmentMock.mockImplementation(async (_id: string, viewer: { role: string }) =>
    viewer.role === "founder"
      ? { available: true, mine: null, history: [], sharedWithFounder: null }
      : { available: true, mine: MINE, history: [{ id: "a-1", version: 2 }, { id: "a-0", version: 1 }], sharedWithFounder: null },
  );
  percentileMock.mockReset();
  percentileMock.mockResolvedValue({ percentile: 61.4, source: "real_cohort", cohortSize: 120, stageMatched: 3, band: "segmented", label: "segmented benchmark (n = 120)", published: { percentile: 61, n: 120, band: "segmented", label: "segmented benchmark (n = 120)", segment: "AU stage-3 cohort" } });
  readConsensusMock.mockReset().mockResolvedValue(EMPTY_CONSENSUS);
  shareOrgMock.mockReset().mockResolvedValue(null);
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
    expect(shareOrgMock).toHaveBeenCalledWith("u-stranger", "u-eval");
  });

  it("S-D3 F1: a same-org seat opens the evaluator's dossier as an assessor (viaOrgId set); strangers still null", async () => {
    shareOrgMock.mockImplementation(async (a: string, b: string) => (a === "u-seat" && b === "u-eval" ? "org-1" : null));
    const seat = await resolveDossierAccess("e-1", "u-seat");
    expect(seat?.role).toBe("assessor");
    expect(seat?.viaOrgId).toBe("org-1");
    expect(seat?.project.slug).toBe("acme-robotics");
    const direct = await resolveDossierAccess("e-1", "u-eval");
    expect(direct?.viaOrgId).toBeNull();
    expect(await resolveDossierAccess("e-1", "u-other")).toBeNull();
    const d = await loadDossier("e-1", "u-seat");
    expect(d?.viewer.role).toBe("assessor");
    expect(d?.header.viaOrgSeat).toBe(true);
  });
});

describe("loadDossier — signature (G21 P3-C)", () => {
  it("an assessor gets the block (fail-soft reads: empty tables → no role / org, overrides 0), the founder none", async () => {
    const d = await loadDossier("e-1", "u-eval");
    expect(d!.signature).toMatchObject({ role: "Evaluator", organisation: null, humansLine: expect.stringContaining("Humans make the decision") });
    expect(d!.signature!.methodologyVersion.length).toBeGreaterThan(0);
    expect(d!.signature!.date).toMatch(/\d{4}$/);
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
    expect(h.percentile).toEqual({ value: 61, source: "real_cohort", cohortSize: 120, label: "segmented benchmark (n = 120)" });
    expect(h.consentTier).toBe("reports_shared");
    expect(h.founderClaimed).toBe(true);
    expect(h.lastSnapshotAt).toBe("2026-09-12T00:00:00Z");
    expect(h.evidence).toEqual({ items: 3, connected: 1, providers: ["stripe"] });
    // S36: projects.verification_level joined on the evaluation read → the header badge (L2 = ABR Active).
    expect(h.verification).toEqual({ level: 2, abnVerified: true, label: "Verified ABN" });
    expect(d!.report.source).not.toBe("pipeline");
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
    // G14-S37: no founder profile → null block; the loader was asked for the OWNER (projects.user_id).
    expect(r.founderExecution).toBeNull();
    expect(founderExecutionCtxMock).toHaveBeenCalledWith({ accountId: "u-founder", projectId: "p-1" });

    expect(d!.assessment.mine).toEqual(MINE);
    expect(d!.assessment.history).toHaveLength(2);
    expect(getAssessmentMock).toHaveBeenCalledWith("e-1", { userId: "u-eval", role: "assessor" });

    // G21-P1-B: the Assessment Card rides on the same report + Evidence Hub rows.
    const card = d!.assessmentCard!;
    expect(card).not.toBeNull();
    expect(card.startupName).toBe("Acme Robotics");
    expect(card.svi).toBe(62);
    expect(card.verification).toMatchObject({ level: 2, label: "BlockID Verified L2" });
    expect(card.evidenceConfidence).toBeGreaterThanOrEqual(0);
    expect(card.evidenceConfidence).toBeLessThanOrEqual(100);
    expect(card.benchmark).toBeUndefined();
    expect(typeof card.unverifiedMaterialClaims).toBe("number");
  });

  it("G14-S37: a structured founder profile becomes the FTV founder-execution block (score, cap, breakdown); references_checked lifts the cap", async () => {
    const profile = {
      account_id: "u-founder", email: "jo@acme.io", full_name: "Jo", role: "CEO", linkedin_url: null, bio: null, prev_employers: [], ship_history: [], years_in_domain: 12, domain_insight: null, ambition: null,
      co_founders: [], advisors: [], notable_hires: [], public_visible: true, contactable_by_investors: false,
      prior_exits: [{ company: "Loom", year: 2020, type: "acquisition", value_band: "1m-10m" }, { company: "Weave", year: 2016, type: "ipo", value_band: "50m+" }],
      prior_raises: [{ company: "Loom", round: "series_b_plus", amount_aud_band: "20m+", year: 2019 }],
      github_url: "https://github.com/jo", full_time_pct: 100, worked_together_before: true,
      roles: { ceo: "Jo", cto: "Sam", cpo: "Ada", cfo: "Kim" }, execution_score: null, execution_computed_at: null, execution_source: {},
    };
    founderExecutionCtxMock.mockResolvedValueOnce({ profile, evaluatorFlags: null, linkedin: null, github: null });
    const capped = await loadDossier("e-1", "u-eval");
    expect(capped!.report.founderExecution).toMatchObject({ score: 70, rawScore: 96, capped: true, capLiftedBy: null, structured: true, rubricVersion: "1.0" });
    expect(capped!.report.founderExecution!.breakdown).toHaveLength(7);
    expect(capped!.report.founderExecution!.breakdown[0]).toMatchObject({ key: "exits", points: 30, max: 30 });

    founderExecutionCtxMock.mockResolvedValueOnce({ profile, evaluatorFlags: { references_checked: true }, linkedin: null, github: null });
    const lifted = await loadDossier("e-1", "u-eval");
    expect(lifted!.report.founderExecution).toMatchObject({ score: 96, capped: false, capLiftedBy: "references_checked", capReason: null });
  });

  it("prefers a stored report_v2 over the adapter", async () => {
    const stored = fromSnapshot({ snapshotId: "s-2", projectId: "p-1", startupName: "Stored Name", stage: 3, sviTotal: 62, dimStates: { tre: { score: 61 } }, tier: "standard" });
    state.tables.svi_snapshots = [{ ...LATEST, report_v2: { ...stored, source: "pipeline" } }, OLDER];
    const d = await loadDossier("e-1", "u-eval");
    expect(d!.report.source).toBe("pipeline");
  });

  it("S-R5 (W4 review d): the evaluator's own evaluation_reports.report_v2 wins over the founder's snapshot; a row without one falls back", async () => {
    const mine = fromSnapshot({ snapshotId: "s-eval", projectId: "p-1", startupName: "Evaluator Saw This", stage: 3, sviTotal: 66, dimStates: { tre: { score: 70 } }, tier: "standard" });
    state.tables.evaluation_reports = [
      { id: "er-2", evaluation_id: "e-1", share_token: "tok-new", created_at: "2026-09-15T00:00:00Z", kind: "full", report_v2: { ...mine, source: "pipeline" } },
      { id: "er-1", evaluation_id: "e-1", share_token: "tok-old", created_at: "2026-09-12T00:00:00Z", kind: "full", report_v2: null },
    ];
    const d = await loadDossier("e-1", "u-eval");
    expect(d!.report.source).toBe("pipeline");
    expect(d!.report.dims.find((r) => r.dim === "tre")?.score).toBe(70);
    expect(d!.report.links.fullReport).toContain("tok-new");
    // One read: report_v2 rides the first select (W5 review — no second round trip).
    const reads = state.calls.filter((c) => c.table === "evaluation_reports");
    expect(reads).toHaveLength(1);
    expect(reads[0].select).toContain("report_v2");

    __resetDossierCaches();
    state.calls.length = 0;
    state.tables.evaluation_reports = [{ id: "er-3", evaluation_id: "e-1", share_token: "tok-3", created_at: "2026-09-16T00:00:00Z", kind: "full", report_v2: null }];
    const fallback = await loadDossier("e-1", "u-eval");
    expect(fallback!.report.source).not.toBe("pipeline");
    expect(fallback!.report.dims.find((r) => r.dim === "tre")?.score).toBe(61);
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
    // G21-P1-B: no report → no Assessment Card.
    expect(d!.assessmentCard).toBeNull();
  });

  it("runs the post-access reads as one parallel round and caches the percentile for 10 minutes", async () => {
    await loadDossier("e-1", "u-eval");
    const tables = state.calls.map((c) => c.table);
    expect(tables[0]).toBe("evaluations");
    // Round 1 (7 S-D1 reads + the previous-view audit row) then round 2
    // (mandate fit row · progress send · the assessed snapshot · S-D3 the
    // viewer's audit trail; the consensus reader is mocked) + the G21 P1
    // Assessment Card context (claim register + stage benchmark, fail-soft)
    // + G21 P3-C: connector freshness (oauth_connections_v2 + connector_snapshots
    // for the stale-connector hint) and the reviewer signature (app_users ·
    // investor_organisation_members · assessment_overrides), all fail-soft.
    expect(tables.slice(1, 7).sort()).toEqual(["audit_events", "connector_snapshots", "evaluation_reports", "svi_dimension_evidence", "svi_snapshots", "svi_snapshots"]);
    expect(tables.slice(7).sort()).toEqual([
      "app_users", "assessment_overrides", "audit_events", "claims", "connector_snapshots", "evaluator_progress_sends", "investor_organisation_members",
      "mandate_fit_scores", "oauth_connections_v2", "svi_analyses", "svi_snapshots", "svi_snapshots",
    ]);
    expect(readConsensusMock).toHaveBeenCalledTimes(1);
    expect(readConsensusMock).toHaveBeenCalledWith(expect.objectContaining({ evaluationId: "e-1", viewerUserId: "u-eval" }));
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

describe("loadDossier — S-R4 blocks 2 / 5 + header fit / Δ since last view", () => {
  it("block 2: valuation from the report with the assessor's own view overlaid on the range bars", async () => {
    const d = await loadDossier("e-1", "u-eval");
    const v = d!.valuation;
    expect(v.available).toBe(true);
    expect(v.source).toBe("adapter");
    expect(v.pending).toBe(false);
    expect(v.consensus?.midAud).toBeGreaterThan(0);
    expect(v.methods).toHaveLength(7);
    expect(v.methods.map((m) => m.method)).toContain("scorecard");
    expect(v.methods.map((m) => m.method)).toContain("stage_baseline");
    expect(v.comparables.n).toBeGreaterThan(0);
    expect(v.rangeBars?.kind).toBe("range_bars");
    expect(v.rangeBars?.id).toMatch(/-mine$/);
    expect((v.rangeBars?.data as { rows: Array<{ label: string }> }).rows.some((r) => r.label === "My view")).toBe(true);
    expect(v.myView).toEqual({ lowAud: 4_000_000, highAud: 6_000_000, note: "comps-led" });
    expect(v.rangeBars?.svg).toContain('role="img"');
  });

  it("block 5: progress radar scoped to this evaluation, deadlines filtered, last send + since-my-assessment", async () => {
    const d = await loadDossier("e-1", "u-eval");
    const p = d!.progress;
    expect(p.available).toBe(true);
    expect(progressMock).toHaveBeenCalledTimes(1);
    const opts = progressMock.mock.calls[0][0] as { userId: string; store: { listEvaluations: (u: string) => Promise<Array<{ id: string }>> } };
    expect(opts.userId).toBe("u-eval");
    // the store wrapper keeps only THIS evaluation
    expect((await opts.store.listEvaluations("u-eval")).map((e) => e.id)).toEqual(["e-1"]);
    expect(p.item?.delta).toBe(4);
    expect(p.deadlines.map((x) => x.name)).toEqual(["Accelerating Commercialisation"]);
    expect(p.lastSendAt).toBe("2026-09-08T00:00:00Z");
    expect(p.sparkline?.kind).toBe("sparkline");
    // since my last assessment: snapshot s-1 (58) → latest 62
    expect(p.sinceAssessment).toMatchObject({ version: 2, snapshotId: "s-1", sviThen: 58, sviNow: 62, delta: 4 });
  });

  it("header: mandate fit from the persisted row, Δ since last view from the previous audit row", async () => {
    const d = await loadDossier("e-1", "u-eval");
    expect(d!.header.mandateFit).toMatchObject({ mandateId: "m-1", mandateLabel: "Seed deep-tech AU", score: 77, passesFloor: true, source: "persisted", reasons: ["Industry match"] });
    expect(d!.header.sinceLastView).toEqual({ viewedAt: "2026-09-10T00:00:00Z", sviThen: 60, sviNow: 62, delta: 2 });
  });

  it("header: no persisted fit row → scoreFit on read (source computed); no previous view → sinceLastView null", async () => {
    state.tables.mandate_fit_scores = [];
    state.tables.audit_events = [];
    const d = await loadDossier("e-1", "u-eval");
    expect(d!.header.mandateFit?.source).toBe("computed");
    expect(d!.header.mandateFit?.score).toBeGreaterThan(0);
    expect(d!.header.sinceLastView).toBeNull();
    listMandatesMock.mockResolvedValue({ migrated: true, mandates: [], primary: null });
    const none = await loadDossier("e-1", "u-eval");
    expect(none!.header.mandateFit).toBeNull();
  });

  it("degrades: a throwing radar / missing tables leave honest empty states", async () => {
    progressMock.mockRejectedValue(new Error("boom"));
    state.tables.evaluator_progress_sends = { error: { code: "42P01", message: "relation evaluator_progress_sends does not exist" } };
    state.tables.svi_snapshots = [];
    const d = await loadDossier("e-1", "u-eval");
    expect(d!.progress.item).toBeNull();
    expect(d!.progress.lastSendAt).toBeNull();
    expect(d!.valuation.available).toBe(false);
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
    for (const needle of ["secret", "track", "conviction", "privateNotes", "tok-secret", "comps-led", "My view", "Seed deep-tech"]) expect(json, `founder view leaked ${needle}`).not.toContain(needle);
    // S-R4: no mandate fit, no since-assessment, no valuation overlay for the founder;
    // the progress radar is the evaluator's (keyed on the evaluator seat).
    expect(d!.header.mandateFit).toBeNull();
    expect(listMandatesMock).not.toHaveBeenCalled();
    expect(d!.valuation.myView).toBeNull();
    expect(d!.valuation.rangeBars?.id).not.toMatch(/-mine$/);
    expect(d!.progress.sinceAssessment).toBeNull();
    expect((progressMock.mock.calls[0][0] as { userId: string }).userId).toBe("u-eval");
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
