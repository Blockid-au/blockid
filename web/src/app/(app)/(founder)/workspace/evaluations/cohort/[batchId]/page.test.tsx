// /workspace/evaluations/cohort/[batchId] — the BlockID Cohort page (G21
// P2-B rewrite). The data layer is mocked at the module boundary
// (batch-members, cohort-rows-loader) so the REAL CohortTable / CohortMembers
// / EvaluatorReportDisclaimer render end to end; `getSupabaseAdmin` is faked
// at the table level only for the page's own `loadCohortMeta` read
// (weights_version + the newest cohort_snapshots row), both fail-soft.
//
// Pins: login redirect; notFound() for a non-member; the h1 renders before
// the table; the role line; the header stats (n / median SVI / median
// confidence / shortlisted / last snapshot, "no snapshot yet" when
// cohort_snapshots errors); the rubric weights line; cohort members (creator
// chip, invite toggle for owner only); Download CSV; the LP report gate;
// the program-journey link; the table itself (data-role); "Humans make the
// decision."; the evaluator disclaimer; and that a `?stage=3` query reaches
// the table as `initialFilters`, hiding non-matching rows.

import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
const notFoundMock = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  notFound: () => notFoundMock(),
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined, push: () => undefined }),
  usePathname: () => "/workspace/evaluations/cohort/b-1",
  useSearchParams: () => new URLSearchParams(),
}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));

const getEntitlementsMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({ getEntitlements: (plan: string, id: string) => getEntitlementsMock(plan, id) }));

const assertBatchRoleMock = vi.fn();
const listBatchMembersMock = vi.fn();
vi.mock("@/lib/evaluations/batch-members", () => ({
  assertBatchRole: (batchId: string, userId: string, minRole?: string) => assertBatchRoleMock(batchId, userId, minRole),
  listBatchMembers: (batch: unknown) => listBatchMembersMock(batch),
}));

const loadBlockIdCohortRowsMock = vi.fn();
vi.mock("@/lib/evaluations/cohort-rows-loader", () => ({
  loadBlockIdCohortRows: (batch: unknown, viewerId: string) => loadBlockIdCohortRowsMock(batch, viewerId),
}));
// G24-C: the catalogue read (cookie + both JSON catalogues) is mocked to the EN
// labels so the first test's import budget stays where it was.
vi.mock("@/lib/evaluations/demo-cohort-labels", async () => {
  const shared = await import("@/lib/evaluations/demo-cohort-shared");
  return { loadDemoCohortLabels: async () => shared.DEMO_COHORT_LABELS_EN };
});

// ── table-level fake for the page's OWN loadCohortMeta() Supabase reads ────
const supabaseMock = vi.hoisted(() => ({
  weightsRow: { data: { weights_version: 1 } as unknown, error: null as unknown },
  snapshotRows: { data: [] as unknown[], error: null as unknown },
  orgRow: { data: { name: "Acme Ventures" } as unknown, error: null as unknown },
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "evaluation_batches") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => supabaseMock.weightsRow }) }) };
      }
      if (table === "investor_organisations") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => supabaseMock.orgRow }) }) };
      }
      if (table === "cohort_snapshots") {
        return { select: () => ({ eq: () => ({ order: () => ({ limit: async () => supabaseMock.snapshotRows }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { buildCohortRows, type CohortAnalysisInput, type CohortItemInput, type CohortRow } from "@/lib/evaluations/cohort-rows";
import { equalWeights, type CohortRow as BatchCohortRow, type EvaluationBatch } from "@/lib/evaluations/batch-shared";

function legacyRow(over: Partial<BatchCohortRow> = {}): BatchCohortRow {
  return {
    itemId: 1,
    evaluationId: "e-1",
    projectId: "p-1",
    projectSlug: "acme",
    startup: "Acme",
    label: null,
    industry: "DeepTech",
    state: "NSW",
    status: "done",
    svi: 71,
    weighted: null,
    stage: 3,
    delta: 4,
    topStrength: "Founder & Team",
    topGap: "Traction & Revenue",
    dimensionScores: { ftv: 80, mpc: 80, ptd: 80, tre: 40, cgh: 80, iri: 80, lco: 80, svm: 80 },
    reportUrl: "/tbr/tok-a",
    pdfUrl: "/api/svi/report/pdf?token=tok-a",
    error: null,
    scoredAt: "2026-09-10T12:05:00Z",
    decision: null,
    conviction: null,
    thesisFitPct: null,
    assessmentStatus: null,
    ...over,
  };
}

function row(opts: { legacy?: Partial<BatchCohortRow>; item?: Partial<Pick<CohortItemInput, "shortlisted" | "reviewStatus">>; analysis?: Partial<CohortAnalysisInput> } = {}): CohortRow {
  const legacy = legacyRow(opts.legacy);
  const item: CohortItemInput = { ...legacy, snapshotId: null, shortlisted: false, reviewStatus: "unreviewed", reviewerId: null, reviewerName: null, ...opts.item };
  const analyses: Record<string, CohortAnalysisInput> = { [legacy.projectId]: { evidenceConfidence: 82, verificationLevel: 3, pendingDims: 0, unverifiedMaterialClaims: 0, conflictingClaims: 0, ...opts.analysis } };
  const [built] = buildCohortRows([item], analyses, {}, [], equalWeights());
  return built!;
}

const ROWS: CohortRow[] = [
  row({ legacy: { itemId: 1, evaluationId: "e-1", projectId: "p-1", startup: "Acme", svi: 71, stage: 3 }, item: { shortlisted: true }, analysis: { evidenceConfidence: 82 } }),
  row({ legacy: { itemId: 2, evaluationId: "e-2", projectId: "p-2", startup: "Beta", svi: 50, stage: 2, dimensionScores: { ftv: 50, mpc: 50, ptd: 50, tre: 50, cgh: 50, iri: 50, lco: 50, svm: 50 } }, analysis: { evidenceConfidence: 40 } }),
];

const USER = {
  id: "u-1", email: "prog@accel.au", displayName: "Pat", role: "user", plan: "investor_vc_small",
  createdAt: "", lastLoginAt: null, googleId: null, avatarUrl: null, discountPct: null,
  startupName: null, startupStage: null, industry: null, onboardingCompleted: true, startupGoals: null,
};

const BATCH: EvaluationBatch = {
  id: "b-1", userId: "u-1", name: "Cohort 4 intake", rubricWeights: equalWeights(), status: "running",
  total: 3, doneCount: 2, failedCount: 1, createdAt: "2026-09-10T00:00:00Z", startedAt: "2026-09-10T12:00:00Z", finishedAt: null,
};

const MEMBERS = {
  members: [
    { userId: "u-1", role: "owner" as const, email: "prog@accel.au", displayName: "Pat Nguyen", invitedBy: null, createdAt: "2026-09-10T00:00:00Z", isCreator: true },
    { userId: "u-2", role: "reviewer" as const, email: "sam@fund.vc", displayName: "Sam Reviewer", invitedBy: "u-1", createdAt: "2026-09-10T01:00:00Z", isCreator: false },
  ],
  available: true,
};

async function html(batchId = "b-1", sp: Record<string, string | string[] | undefined> = {}): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page({ params: Promise.resolve({ batchId }), searchParams: Promise.resolve(sp) });
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

// The page's module graph is the cost of the FIRST test (it was timing out at
// 5 s under a loaded box); warm it once under the 10 s hook budget instead.
beforeAll(async () => {
  await import("./page");
});

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
  getEntitlementsMock.mockResolvedValue(["lp_export", "lp_report", "portfolio"]);
  assertBatchRoleMock.mockResolvedValue({ ok: true, batch: BATCH, role: "owner", isCreator: true });
  listBatchMembersMock.mockResolvedValue(MEMBERS);
  loadBlockIdCohortRowsMock.mockResolvedValue({ rows: ROWS, baseRows: [], overridesAvailable: true });
  supabaseMock.weightsRow = { data: { weights_version: 1 }, error: null };
  supabaseMock.snapshotRows = { data: [], error: null };
  supabaseMock.orgRow = { data: { name: "Acme Ventures" }, error: null };
});

describe("/workspace/evaluations/cohort/[batchId]", () => {
  it("redirects anonymous users to login with the cohort path as next", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/evaluations/cohort/b-1");
  });

  it("404s when assertBatchRole finds no membership", async () => {
    assertBatchRoleMock.mockResolvedValue({ ok: false, error: "not_found" });
    await expect(html("b-other")).rejects.toThrow("NOT_FOUND");
    expect(assertBatchRoleMock).toHaveBeenCalledWith("b-other", "u-1", "viewer");
    expect(loadBlockIdCohortRowsMock).not.toHaveBeenCalled();
  });

  it("the h1 renders before the table, and cohort-role shows the caller's role", async () => {
    const out = await html();
    const h1Idx = out.indexOf('data-testid="cohort-h1"');
    const tableIdx = out.indexOf('data-testid="blockid-cohort"');
    expect(h1Idx).toBeGreaterThan(-1);
    expect(tableIdx).toBeGreaterThan(-1);
    expect(h1Idx).toBeLessThan(tableIdx);
    expect(out).toContain("BlockID Cohort — Cohort 4 intake");
    expect(out).toMatch(/data-testid="cohort-role"[^>]*>owner</);
  });

  // G22-B (0433): the Organisation chip — only when the batch carries org_id; name from investor_organisations, "—" when the org row is gone.
  it("renders the Organisation chip with the org name when org_id is set, '—' when the org row is missing, and no chip without org_id", async () => {
    expect(await html()).not.toContain('data-testid="cohort-org-chip"');
    assertBatchRoleMock.mockResolvedValue({ ok: true, batch: { ...BATCH, orgId: "org-1" }, role: "owner", isCreator: true });
    const out = await html();
    expect(out).toContain('data-testid="cohort-org-chip"');
    expect(out).toMatch(/cohort-org-chip[\s\S]*?Acme Ventures/);
    supabaseMock.orgRow = { data: null, error: null };
    const gone = await html();
    expect(gone).toContain('data-testid="cohort-org-chip"');
    expect(gone).not.toContain("Acme Ventures");
  });

  it("header stats: n, median SVI, median confidence, shortlisted, and 'no snapshot yet' when cohort_snapshots errors", async () => {
    supabaseMock.snapshotRows = { data: null, error: { code: "42P01", message: "relation \"cohort_snapshots\" does not exist" } };
    const out = await html();
    expect(out).toContain('data-testid="cohort-stats"');
    expect(out).toMatch(/n <\/dt><dd[^>]*>2</); // n = 2
    expect(out).toContain(">60.5<"); // median SVI of [71, 50]
    expect(out).toContain(">61<"); // median confidence of [82, 40]
    expect(out).toMatch(/Shortlisted <\/dt><dd[^>]*>1</); // one shortlisted row
    expect(out).toMatch(/data-testid="cohort-last-snapshot"[^>]*>no snapshot yet</);
  });

  it("shows the taken_at date when a cohort_snapshots row exists", async () => {
    supabaseMock.weightsRow = { data: { weights_version: 2 }, error: null };
    supabaseMock.snapshotRows = { data: [{ taken_at: "2026-09-19T00:00:00Z" }], error: null };
    const out = await html();
    expect(out).not.toContain("no snapshot yet");
    expect(out).toContain('data-testid="cohort-last-snapshot"');
    expect(out).toContain("Program weights v2:");
  });

  it("cohort members: the creator chip renders, and invite-reviewer-toggle only for the owner", async () => {
    const owner = await html();
    expect(owner).toContain('data-testid="cohort-members"');
    expect(owner).toContain("Pat Nguyen");
    expect(owner).toContain("Sam Reviewer");
    expect(owner).toContain('data-testid="invite-reviewer-toggle"');

    assertBatchRoleMock.mockResolvedValue({ ok: true, batch: BATCH, role: "reviewer", isCreator: false });
    const reviewer = await html();
    expect(reviewer).toContain('data-testid="cohort-members"');
    expect(reviewer).not.toContain('data-testid="invite-reviewer-toggle"');
  });

  it("Download CSV link, program-journey link, and the LP report gated on lp_report / lp_export", async () => {
    const out = await html();
    expect(out).toContain('href="/api/evaluations/batch/b-1/export.csv"');
    expect(out).toContain("Download CSV");
    expect(out).toMatch(/data-testid="cohort-program-journey"[^>]*href="\/workspace\/accelerator"/);
    expect(out).toContain("/api/reports/quarterly?batch=b-1");
    expect(out).toContain("Sponsor / LP report");
  });

  it("hides the LP report and offers the pricing link when the flag is missing", async () => {
    getEntitlementsMock.mockResolvedValue(["accelerator.cohort"]);
    const out = await html();
    expect(out).not.toContain("/api/reports/quarterly?batch=b-1");
    expect(out).toContain("Sponsor / LP report — Program");
    expect(out).toContain("/pricing?segment=evaluator");
  });

  it("renders the table with the caller's role, 'Humans make the decision.', and the evaluator disclaimer", async () => {
    const out = await html();
    expect(out).toMatch(/data-testid="blockid-cohort" data-role="owner"/);
    expect(out).toContain('data-testid="humans-decide"');
    expect(out).toContain("Humans make the decision.");
    expect(out).toContain('data-surface="evaluator_report"');
  });

  it("a ?stage=3 query reaches the table as initialFilters, hiding non-matching rows", async () => {
    const out = await html("b-1", { stage: "3" });
    expect((out.match(/data-testid="cohort-row"/g) ?? []).length).toBe(1);
    expect(out).toContain(">Acme<");
    expect(out).not.toContain(">Beta<");
  });

  it("a real cohort carries no demo markup", async () => {
    const out = await html();
    expect(out).not.toContain('data-testid="demo-cohort-banner"');
    expect(out).not.toContain('data-testid="demo-chip"');
    expect(out).toContain('data-testid="cohort-import-section"');
  });

  it("G24-C demo cohort: the banner + 'Remove demo cohort' for the owner, a chip on the h1 and on EVERY row, and no CSV import into the demo", async () => {
    assertBatchRoleMock.mockResolvedValue({ ok: true, batch: { ...BATCH, name: "Demo cohort", isDemo: true }, role: "owner", isCreator: true });
    const out = await html();
    expect(out).toContain('data-testid="demo-cohort-banner"');
    expect(out).toContain('data-testid="remove-demo-cohort"');
    expect(out).toContain("Demo data — fictional");
    expect(out).not.toContain('data-testid="cohort-import-section"');
    // h1 chip + banner chip + one per row (2 rows) + the compare drawer renders closed (no cards).
    const rows = (out.match(/data-testid="cohort-row"/g) ?? []).length;
    expect(rows).toBe(2);
    expect((out.match(/data-testid="demo-chip"/g) ?? []).length).toBe(2 + rows);
  });

  it("G24-C demo cohort: a reviewer sees the banner but no remove control", async () => {
    assertBatchRoleMock.mockResolvedValue({ ok: true, batch: { ...BATCH, userId: "u-9", name: "Demo cohort", isDemo: true }, role: "reviewer", isCreator: false });
    const out = await html();
    expect(out).toContain('data-testid="demo-cohort-banner"');
    expect(out).not.toContain('data-testid="remove-demo-cohort"');
  });
});
