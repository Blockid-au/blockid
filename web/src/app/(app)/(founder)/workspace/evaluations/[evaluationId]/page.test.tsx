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
//     their decision; S-D3: block 3 lists evidence by consent tier with the
//     request-upgrade CTA, block 6 carries the action bar + audit trail, the
//     header the Export IC action; the founder gets none of the actions;
//   * S-R4: block 2 renders the valuation from ReportV2 (consensus band,
//     six methods, range bars svg), block 5 the progress radar scoped to
//     this evaluation, the header carries mandate fit (assessor) and
//     "Since last view"; the audit hook fires with role + ids + the SVI.

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
      { id: "a-1", evaluation_id: "e-1", project_id: "p-1", assessor_user_id: "u-eval", snapshot_id: "s-1", version: 1, status: "submitted", decision: "track", conviction: 3, private_notes: "SECRET-NOTE", shared_notes: null, shared_fields: [], shared_with_founder_at: null, submitted_at: "2026-09-12T00:00:00Z", created_at: "2026-09-11T00:00:00Z", updated_at: "2026-09-12T00:00:00Z" },
    ],
    svi_dimension_evidence: [
      { project_id: "p-1", dimension: "mpc", evidence_type: "landing", evidence_label: "Landing page", confidence_level: "public_url", evidence_value_or_url: "https://acme.io", created_at: "2026-09-04T00:00:00Z" },
    ],
    connector_snapshots: [{ project_id: "p-1", provider: "stripe" }],
    evaluation_reports: [{ evaluation_id: "e-1", share_token: "tok-abc", created_at: "2026-09-12T00:00:00Z", kind: "full" }],
    // S-R4 header / block 5 sources.
    audit_events: [{ id: 7, user_id: "u-eval", action: "dossier.viewed", resource_id: "e-1", ts: "2026-09-10T00:00:00Z", detail: { svi_total: 60 } }],
    mandate_fit_scores: [{ mandate_id: "m-1", project_id: "p-1", score: 77, reasons: ["Industry match"], gaps: [], blockers: [], computed_at: "2026-09-15T00:00:00Z" }],
    evaluator_progress_sends: [],
    // S-D3 seats: the evaluator's personal org (0393) with its single seat.
    investor_organisations: [{ id: "org-1", slug: "personal", name: "Personal", kind: "angel", owner_user_id: "u-eval", is_personal: true }],
    investor_organisation_members: [{ id: "m-1", org_id: "org-1", user_id: "u-eval", role: "investment_partner", created_at: "2026-09-01T00:00:00Z", investor_organisations: { id: "org-1", slug: "personal", name: "Personal", kind: "angel", owner_user_id: "u-eval", is_personal: true } }],
    app_users: [{ id: "u-eval", display_name: "Sam", email: "scout@fund.vc" }],
  };
}

// S-T2 mandates: one default mandate for the evaluator seat.
const MANDATE = { id: "m-1", label: "Seed deep-tech AU", sectors_include: ["advanced_manufacturing"], sectors_exclude: [], business_models: [], customer_types: [], stages: ["seed"], cheque_min_aud: null, cheque_max_aud: null, lead_or_follow: null, geographies: [], revenue_min_aud: null, growth_min_pct: null, min_svi: null, tags_include: [], tags_exclude: [], weights: null, is_default: true };
vi.mock("@/lib/investors/mandates", () => ({
  listMandates: async () => ({ migrated: true, mandates: [MANDATE], primary: MANDATE }),
  // S-D3: the seats reader falls back to the personal org (0393 row seeded above).
  getOrCreatePersonalOrg: async () => ({ id: "org-1", slug: "personal", name: "Personal", kind: "angel", owner_user_id: "u-eval", is_personal: true }),
  isMissingRelation: () => false,
}));

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
}, 30_000); // the first dossier import is the heavy one — the 10 s hook default flaked under deploy-gate load

describe("/workspace/evaluations/[evaluationId]", () => {
  it("redirects anonymous users to login with the dossier as next", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/evaluations/e-1");
  }, 30_000); // first import of the page graph is heavy — flakes at 10 s under deploy-gate load

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
    expect(out).toContain("stage cohort · segmented benchmark (n = 120)");
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

  it("blocks 2–6 render; block 3 lists evidence by tier with the upgrade CTA (S-D3); block 4 is the assessor's AI-vs-me form on their submitted v1; block 6 has the action bar + audit trail (S-D3)", async () => {
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
    // block 6 (S-D3): the action bar + the audit trail from audit_events, current status line
    expect(out).toContain('data-testid="dossier-actions"');
    for (const id of ["action-watchlist", "action-portfolio", "action-intro", "action-export-ic"]) expect(out).toContain(`data-testid="${id}"`);
    expect(out).not.toContain('data-testid="action-batch"'); // Scout: no batch scoring
    expect(out).toContain("Export one-pager"); // Scout → one_page (S6)
    expect(out).toContain('data-testid="audit-trail"');
    expect(out).toContain('data-action="dossier.viewed"');
    expect(out).toContain("Current: v1 submitted");
    expect(out).toContain("Founder-consented access tiers control who sees what.");
    // block 3 (S-D3): the reports_shared item list with source kind + freshness, the legend and the request-upgrade CTA
    expect(out).not.toContain("Items are masked at this tier");
    expect(out).toMatch(/data-testid="evidence-item"[^>]*data-source-kind="public_url"/);
    expect(out).toContain("Public URL");
    expect(out).toContain('data-testid="evidence-legend"');
    expect(out).toContain('data-testid="evidence-upgrade-cta"');
    expect(out).toContain("Request data-room access");
    expect(out).toContain('data-testid="request-access-button"');
    // header (S-D3): Export IC + single personal seat → no consensus chip, the seats prompt under block 4
    expect(out).toContain('data-testid="export-ic"');
    expect(out).not.toContain('data-testid="consensus-chip"');
    expect(out).toContain('data-testid="seats-single"');
    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    expect(appendAuditMock.mock.calls[0][0]).toMatchObject({ action: "dossier.viewed", resource_id: "e-1", user_id: "u-eval", detail: { role: "assessor", surface: "page", svi_total: 62, snapshot_id: "s-2" } });
  });

  it("S-R4: block 2 valuation from ReportV2, block 5 progress radar, header mandate fit + since last view (assessor)", async () => {
    const out = await html();
    const b2 = out.slice(out.indexOf('data-testid="dossier-block-2"'), out.indexOf('data-testid="dossier-block-3"'));
    expect(b2).toContain('data-testid="valuation-consensus"');
    expect(b2).toContain('data-testid="valuation-range-bars"');
    expect(b2).toContain('data-visual-kind="range_bars"');
    expect((b2.match(/<svg[^>]*role="img"/g) ?? []).length).toBe(1);
    expect(b2).toContain('data-testid="valuation-methods"');
    for (const m of ["Revenue multiple", "Berkus", "DCF proxy", "AU comparables", "Risk-factor summation", "Scorecard"]) expect(b2).toContain(m);
    expect(b2).toContain("lifted from the stored snapshot");
    expect(b2).toContain('href="/tbr/tok-abc"');
    const b5 = out.slice(out.indexOf('data-testid="dossier-block-5"'), out.indexOf('data-testid="dossier-block-6"'));
    expect(b5).toContain('data-testid="progress-svi"');
    expect(b5).toContain('data-testid="progress-sparkline"');
    expect(b5).toContain('data-visual-kind="sparkline"');
    expect(b5).toContain('data-testid="progress-since-assessment"');
    expect(out).toMatch(/data-testid="mandate-fit"[\s\S]*?77%/);
    expect(out).toContain("Seed deep-tech AU");
    expect(out).toMatch(/data-testid="since-last-view"[\s\S]*?▲ \+<!-- -->2<!-- --> SVI|data-testid="since-last-view"[\s\S]*?\+2 SVI/);
  });

  it("G21 P3-A: block 7 outcomes & trajectory — assessor gets the record form (evaluator source), the compact trajectory, the consent tier line; founder preview is read-only", async () => {
    state.tables.startup_outcomes = [{ id: "o-1", project_id: "p-1", kind: "grant_success", observed_at: "2026-09-05T00:00:00.000Z", value: { program: "AEA Ignite", source_url: "https://grants.gov.au/x" }, source: "external_signal", confidence: 90, recorded_by: null, status: "confirmed", confirmed_by: "a", confirmed_at: "2026-09-06", note: "checked", created_at: "2026-09-05", updated_at: "2026-09-06" }];
    const out = await html();
    const b7 = out.slice(out.indexOf('data-testid="dossier-block-7"'), out.indexOf('data-testid="dossier-block-6"'));
    expect(b7).toContain("Outcomes &amp; trajectory");
    expect(b7).toContain('data-testid="trajectory-timeline"');
    expect(b7).toContain('data-testid="outcomes-form"');
    expect(b7).toContain("evaluator");
    expect(b7).toContain("reports shared consent tier");
    expect(b7).toContain("AEA Ignite");
    // reports_shared → no source link, no note
    expect(b7).not.toContain("grants.gov.au");
    expect(b7).not.toContain("checked");
    expect(b7).not.toContain('data-testid="outcome-confirm"');
    getCurrentUserMock.mockResolvedValue(FOUNDER);
    isEvaluatorUserMock.mockResolvedValue(false);
    const f = await html();
    const fb7 = f.slice(f.indexOf('data-testid="dossier-block-7"'), f.indexOf('data-testid="dossier-block-6"'));
    expect(fb7).not.toContain('data-testid="outcomes-form"');
    expect(fb7).toContain("AEA Ignite");
    expect(fb7).toContain("grants.gov.au");
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
    // S-D3: no seats table, no action bar, no export, no upgrade CTA for the founder; block 3 says whose view this is
    expect(out).not.toContain('data-testid="seats-consensus"');
    expect(out).not.toContain('data-testid="seats-single"');
    expect(out).not.toContain('data-testid="dossier-actions"');
    expect(out).not.toContain('data-testid="export-ic"');
    expect(out).not.toContain('data-testid="evidence-upgrade-cta"');
    expect(out).toContain("this is what your evaluator sees at the tier you granted");
    const block1 = out.slice(out.indexOf('data-testid="dossier-block-1"'), out.indexOf('data-testid="dossier-block-2"'));
    expect((block1.match(/<svg[^>]*role="img"/g) ?? []).length).toBe(1);
    expect((out.match(/data-testid="weight-cell"/g) ?? []).length).toBe(8);
    // S-R4 founder preview: no mandate fit, no "since my assessment", no assessor overlay.
    expect(out).not.toContain('data-testid="mandate-fit"');
    expect(out).not.toContain('data-testid="progress-since-assessment"');
    expect(out).not.toContain("Seed deep-tech AU");
    expect(out).toContain('data-testid="since-last-view"');
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
