import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render test for /workspace/evaluations/[evaluationId] — the Investor
// Dossier (G13-W2-D1) — with the Supabase admin client faked at the table
// level so the REAL loader (lib/evaluations/dossier.ts + assessments.ts)
// runs end to end. Pins:
//   * login redirect; notFound() for unknown ids, malformed ids, strangers
//     and an evaluator seat that lost its evaluator entitlement;
//   * header: name, website, state, taxonomy badges with an honest
//     "Unclassified", SVI + Δ30d + percentile, consent chip, last snapshot,
//     evidence count, decision chip (assessor);
//   * block 1 static render: exactly one radar `svg[role="img"]` (the
//     report cover spec through <VisualFigure>), 8 weight cells summing to
//     100 (F3), 13 criterion rows with "0 evidence — self-declared";
//   * the founder preview never carries an assessment field (no decision
//     chip, no private notes, no invite token) while the evaluator sees
//     their decision; blocks 2–6 render as placeholders;
//   * the audit hook fires with role + ids.

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
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/workspace/evaluations/e-1",
}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));

const isEvaluatorUserMock = vi.fn();
vi.mock("@/lib/evaluations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evaluations")>()),
  isEvaluatorUser: (u: unknown) => isEvaluatorUserMock(u),
}));

const appendAuditMock = vi.fn();
vi.mock("@/lib/audit", () => ({ appendAudit: (p: unknown) => appendAuditMock(p) }));

const percentileMock = vi.fn();
vi.mock("@/lib/agents/cohort-percentile", () => ({ computeCohortPercentile: (a: unknown) => percentileMock(a) }));

// ── table-level Supabase admin fake ─────────────────────────────────────────
type Row = Record<string, unknown>;
const state = { tables: {} as Record<string, Row[]> };
function fakeBuilder(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let single = false;
  let limit: number | null = null;
  const run = async () => {
    let rows = (state.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (limit != null) rows = rows.slice(0, limit);
    return single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null };
  };
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
    lte: (k: string, v: unknown) => { filters.push((r) => String(r[k]) <= String(v)); return q; },
    in: (k: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[k])); return q; },
    or: () => q,
    not: () => q,
    order: (k: string, o?: { ascending?: boolean }) => {
      const asc = o?.ascending !== false;
      const src = state.tables[table] ?? [];
      state.tables[table] = [...src].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : String(a[k]) > String(b[k]) ? 1 : 0) * (asc ? 1 : -1));
      return q;
    },
    limit: (n: number) => { limit = n; return q; },
    maybeSingle: () => { single = true; return run(); },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
  };
  return q;
}
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: (t: string) => fakeBuilder(t) }) }));

const USER = {
  id: "u-eval", email: "scout@fund.vc", displayName: "Sam", role: "user", plan: "investor_angel",
  createdAt: "", lastLoginAt: null, googleId: null, avatarUrl: null, discountPct: null,
  startupName: null, startupStage: null, industry: null, onboardingCompleted: true, startupGoals: null,
};
const FOUNDER = { ...USER, id: "u-founder", email: "jo@acme.io", plan: "free" };

const DIMS = { tre: 61, mpc: 70, ftv: 55, ptd: 66, cgh: 48, iri: 52, lco: 40, svm: 58 };
const EVAL: Row = {
  id: "e-1", evaluator_user_id: "u-eval", project_id: "p-1", owner_kind: "founder_claimed", consent_tier: "reports_shared",
  founder_email: "jo@acme.io", founder_user_id: "u-founder", invite_token: "tok-secret", invited_at: null, claimed_at: "2026-09-01T00:00:00Z",
  label: "Cohort 4", notes: null, website: "https://acme.io", state: "NSW", created_at: "2026-08-20T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  projects: { id: "p-1", name: "Acme Robotics", slug: "acme-robotics", industry: "DeepTech", stage: 3, description: null, growth_phase_current: null },
};

function seed() {
  state.tables = {
    evaluations: [EVAL],
    svi_snapshots: [
      {
        id: "s-2", project_id: "p-1", svi_total: 62, stage: 3, created_at: "2026-09-12T00:00:00Z", report_v2: null,
        dim_results: Object.fromEntries(Object.entries(DIMS).map(([k, v]) => [k, { status: "complete", score: v }])),
        dimension_scores: DIMS,
        criterion_results: [{ key: "idea", title: "Idea & Innovation", primary_dimension: "mpc", weight: 10, score: 74, verdict: "Clear wedge in warehouse robotics.", strengths: [], gaps: [], next_action: "x" }],
        analysis_json: { industry: "DeepTech", stageLabel: "Seed" },
      },
      { id: "s-1", project_id: "p-1", svi_total: 58, stage: 3, created_at: "2026-08-01T00:00:00Z", dim_results: null, dimension_scores: { ...DIMS, tre: 50 } },
    ],
    startup_taxonomy: [{ project_id: "p-1", industry: "advanced_manufacturing", business_model: "unclassified", stage_key: "seed", customer_types: [], tags: [], sources: { industry: "auto" }, confidence: {}, hq_country: "AU", taxonomy_version: "1.0.0" }],
    evaluation_assessments: [
      { id: "a-1", evaluation_id: "e-1", project_id: "p-1", assessor_user_id: "u-eval", version: 1, status: "submitted", decision: "track", conviction: 3, private_notes: "SECRET-NOTE", shared_notes: null, shared_fields: [], shared_with_founder_at: null, submitted_at: "2026-09-12T00:00:00Z", created_at: "2026-09-11T00:00:00Z", updated_at: "2026-09-12T00:00:00Z" },
    ],
    svi_dimension_evidence: [
      { project_id: "p-1", dimension: "mpc", evidence_type: "landing", evidence_label: "Landing page", confidence_level: "public_url", evidence_value_or_url: "https://acme.io", created_at: "2026-09-04T00:00:00Z" },
    ],
    connector_snapshots: [{ project_id: "p-1", provider: "stripe" }],
    evaluation_reports: [{ evaluation_id: "e-1", share_token: "tok-abc", created_at: "2026-09-12T00:00:00Z", kind: "full" }],
  };
}

async function html(evaluationId = "e-1"): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page({ params: Promise.resolve({ evaluationId }) });
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

beforeEach(async () => {
  seed();
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue(USER);
  isEvaluatorUserMock.mockReset();
  isEvaluatorUserMock.mockResolvedValue(true);
  appendAuditMock.mockReset();
  appendAuditMock.mockResolvedValue({ id: 1n, curr_hash: "x" });
  percentileMock.mockReset();
  percentileMock.mockResolvedValue({ percentile: 61.4, source: "real_cohort", cohortSize: 120, stageMatched: 3 });
  redirectMock.mockClear();
  notFoundMock.mockClear();
  const { __resetDossierCaches } = await import("@/lib/evaluations/dossier");
  __resetDossierCaches();
});

describe("/workspace/evaluations/[evaluationId]", () => {
  it("redirects anonymous users to login with the dossier as next", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/evaluations/e-1");
  });

  it("404s unknown / malformed ids, strangers, and a seat without evaluator entitlement", async () => {
    await expect(html("e-nope")).rejects.toThrow("NOT_FOUND");
    await expect(html("e 1;drop")).rejects.toThrow("NOT_FOUND");
    getCurrentUserMock.mockResolvedValue({ ...USER, id: "u-stranger" });
    await expect(html()).rejects.toThrow("NOT_FOUND");
    getCurrentUserMock.mockResolvedValue(USER);
    isEvaluatorUserMock.mockResolvedValue(false);
    await expect(html()).rejects.toThrow("NOT_FOUND");
    expect(appendAuditMock).not.toHaveBeenCalled();
  });

  it("renders the header from persisted rows (badges, SVI, Δ30d, percentile, consent, snapshot date, evidence, decision)", async () => {
    const out = await html();
    expect(out).toContain('data-viewer-role="assessor"');
    expect(out).toContain("Acme Robotics");
    expect(out).toContain("acme.io");
    expect(out).toContain("NSW");
    expect(out).toContain("Advanced manufacturing");
    expect(out).toContain("Seed (Post-PMF)");
    expect(out).toContain("Unclassified"); // business model — honest, never guessed
    expect(out).toMatch(/data-testid="dossier-svi"[^>]*>62</);
    expect(out).toContain("▲ +4 / 30 d");
    expect(out).toContain("p61");
    expect(out).toContain("stage cohort · n=120");
    expect(out).toContain("Reports shared");
    expect(out).toContain("Founder claimed");
    expect(out).toMatch(/12 Sept? 2026/);
    expect(out).toContain("1 items · 1 connected");
    expect(out).toContain("stripe");
    expect(out).toMatch(/data-testid="decision-chip"[^>]*>track</);
    expect(out).toContain("Cohort 4");
  });

  it("block 1: one radar svg[role=img] from the report cover, 8 weight cells summing to 100, 13 criteria with honest evidence", async () => {
    const out = await html();
    const block = out.slice(out.indexOf('data-testid="dossier-block-1"'), out.indexOf('data-testid="dossier-block-2"'));
    expect(block).toContain('data-visual-kind="radar"');
    expect((block.match(/<svg[^>]*role="img"/g) ?? []).length).toBe(1);
    const weights = [...block.matchAll(/data-testid="weight-cell"[^>]*>(\d+)</g)].map((m) => Number(m[1]));
    expect(weights).toEqual([20, 18, 15, 12, 12, 10, 8, 5]);
    expect(weights.reduce((s, w) => s + w, 0)).toBe(100);
    expect((block.match(/data-testid="dim-row"/g) ?? []).length).toBe(8);
    expect(block).toContain("CRO"); // TRE owner
    expect(block).toContain("▲ +11"); // TRE Δ30d
    expect((block.match(/data-testid="criterion-row"/g) ?? []).length).toBe(13);
    expect(block).toContain("Clear wedge in warehouse robotics.");
    expect(block).toContain("1 evidence · public URL");
    expect(block).toContain("0 evidence — self-declared");
    expect(block).toContain('href="/tbr/tok-abc"');
    expect(block).toContain("Open full Trusted Business Report");
  });

  it("blocks 2, 3, 5 render as labelled placeholders; block 4 is the assessor's AI-vs-me form on their submitted v1; block 6 lists the audit actions", async () => {
    const out = await html();
    for (const n of [2, 3, 4, 5, 6]) expect(out).toContain(`data-testid="dossier-block-${n}"`);
    // S-D2 block 4: the form is seeded from the assessor's own row (v1 submitted → next save is v2).
    expect(out).toMatch(/data-testid="assessment-form"[^>]*data-status="submitted"[^>]*data-version="1"/);
    expect(out).toContain("AI verdict vs my view — per dimension");
    expect(out).toMatch(/data-testid="ai-score-TRE"[^>]*>61\/100/);
    expect(out).toContain('id="dim-TRE-rating"');
    expect(out).toContain('for="private-notes"');
    expect(out).toContain("SECRET-NOTE"); // the assessor sees their own private notes
    expect(out).toContain("Submit v2");
    expect(out).toContain('data-testid="assessment-share-open"');
    expect(out).toContain("History — 1 version");
    // block 6: actions + the §C.2 audit actions, current status line
    expect(out).toContain('data-testid="audit-actions"');
    expect(out).toContain("assessment.share_revoked");
    expect(out).toContain("Current: v1 submitted");
    expect(out).toContain("Founder-consented access tiers control who sees what.");
    expect(out).not.toContain("Items are masked at this tier");
    expect(out).toContain("1 item visible at this tier");
    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    expect(appendAuditMock.mock.calls[0][0]).toMatchObject({ action: "dossier.viewed", resource_id: "e-1", user_id: "u-eval", detail: { role: "assessor", surface: "page" } });
  });

  it("founder preview: same block 1, NO assessment field anywhere, no evaluator entitlement needed", async () => {
    getCurrentUserMock.mockResolvedValue(FOUNDER);
    isEvaluatorUserMock.mockResolvedValue(false);
    const out = await html();
    expect(out).toContain('data-viewer-role="founder"');
    expect(out).toContain("Read-only preview of what your evaluator sees");
    expect(out).toContain('data-testid="decision-private"');
    expect(out).not.toContain('data-testid="decision-chip"');
    expect(out).toContain('data-testid="assessment-private"');
    expect(out).not.toContain("Your current view");
    expect(out).not.toContain("SECRET-NOTE");
    expect(out).not.toContain("tok-secret");
    expect(out).not.toContain(">track<");
    expect((out.match(/<svg[^>]*role="img"/g) ?? []).length).toBe(1);
    expect((out.match(/data-testid="weight-cell"/g) ?? []).length).toBe(8);
    expect(appendAuditMock.mock.calls[0][0]).toMatchObject({ user_id: "u-founder", detail: { role: "founder" } });
  });

  it("no snapshot: header says Not scored yet, block 1 shows the empty state but still 13 criteria", async () => {
    state.tables.svi_snapshots = [];
    state.tables.evaluation_reports = [];
    const out = await html();
    expect(out).toContain("Not scored yet");
    expect(out).toContain('data-testid="report-empty"');
    expect(out).not.toContain('role="img"');
    expect((out.match(/data-testid="criterion-row"/g) ?? []).length).toBe(13);
    expect(out).toContain("Score this startup");
    expect(out).toContain("/workspace/projects/acme-robotics/analyze");
  });
});
