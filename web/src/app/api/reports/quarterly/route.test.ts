// Route tests for GET /api/reports/quarterly (T0272). Pins: 401 anonymous,
// 403 feature_locked without lp_report / lp_export (Scout, Firm) + gate hit,
// 400 without ?batch= or ?cohort=, 404 for a batch that is not the caller
// batch, and the ?batch= HTML: text/html + noindex, cohort-scoped cover and
// summary, per-startup one-liners, the doctoral (DBA) sentence with no
// "PhD", the evaluator disclaimer and the Auschain entity line, plus the
// ?cohort= path over cohort_members.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const getEntitlementsMock = vi.fn();
const recordGateHitMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({
  getEntitlements: (plan: string, id: string) => getEntitlementsMock(plan, id),
  recordGateHit: (u: unknown, f: string, s: string) => recordGateHitMock(u, f, s),
}));

const getBatchMock = vi.fn();
const loadRowsMock = vi.fn();
vi.mock("@/lib/evaluations/batch", () => ({
  getBatchForUser: (u: string, id: string) => getBatchMock(u, id),
  loadCohortRows: (b: unknown) => loadRowsMock(b),
}));

const fromMock = vi.fn();
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: (t: string) => fromMock(t) }) }));

import { COHORT_UNAVAILABLE, GET, dynamic } from "./route";

const USER = { id: "u-1", email: "prog@accel.au", plan: "investor_vc_small", displayName: "Plus Eight" };
const PROGRAM_FLAGS = ["investor.dealflow", "portfolio", "lp_export", "lp_report"];
const BATCH = { id: "b-1", userId: "u-1", name: "Cohort 4 intake", rubricWeights: { ftv: 12.5, mpc: 12.5, ptd: 12.5, tre: 12.5, cgh: 12.5, iri: 12.5, lco: 12.5, svm: 12.5 }, status: "done", total: 2, doneCount: 2, failedCount: 0, createdAt: "2026-09-10T00:00:00Z", startedAt: null, finishedAt: "2026-09-10T13:00:00Z" };
const ROWS = [
  { itemId: 1, evaluationId: "e-1", projectId: "p-1", projectSlug: "acme", startup: "Acme Robotics", label: null, industry: "DeepTech", state: "NSW", status: "done", svi: 71, weighted: 64.5, stage: 3, delta: 9, topStrength: "Founder & Team", topGap: "Traction & Revenue", dimensionScores: { ftv: 80, tre: 40 }, reportUrl: "/tbr/tok-a", pdfUrl: null, error: null, scoredAt: "2026-09-10T12:00:00Z" },
  { itemId: 2, evaluationId: "e-2", projectId: "p-2", projectSlug: "beta", startup: "Beta Health", label: null, industry: null, state: null, status: "done", svi: 58, weighted: 58, stage: 2, delta: -4, topStrength: null, topGap: null, dimensionScores: null, reportUrl: "/tbr/tok-b", pdfUrl: null, error: null, scoredAt: "2026-09-10T12:10:00Z" },
];

function req(query: string): Request {
  return new Request("http://localhost/api/reports/quarterly" + query, { headers: { "x-nonce": "n0nce" } });
}

function cohortTable(rows: unknown[], error: unknown = null) {
  const b: Record<string, unknown> = {};
  const resolve = () => Promise.resolve({ data: error ? null : rows, error });
  Object.assign(b, {
    select: () => b,
    eq: () => b,
    in: () => b,
    maybeSingle: () => resolve().then((r) => ({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error })),
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => resolve().then(ok, err),
  });
  return b;
}

/** Route the fake by table: the live 0021 schema (review #14). */
function liveCohortDb(over: Partial<Record<string, unknown[]>> = {}, errors: Partial<Record<string, unknown>> = {}) {
  const tables: Record<string, unknown[]> = {
    accelerator_cohorts: [{ id: "c-1", name: "Cohort 4 intake", manager_email: "prog@accel.au" }],
    cohort_members: [
      { id: "m-1", startup_name: "Gamma", email: "g@x.au", svi_account_id: "acc-1" },
      { id: "m-2", startup_name: "Delta", email: "d@x.au", svi_account_id: "acc-2" },
      { id: "m-3", startup_name: null, email: "nolink@x.au", svi_account_id: null },
    ],
    svi_accounts: [
      { id: "acc-1", current_svi: 66, current_stage: 4 },
      { id: "acc-2", current_svi: null, current_stage: 2 },
    ],
    ...over,
  };
  return (t: string) => cohortTable(tables[t] ?? [], errors[t] ?? null);
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.SITE_URL;
  getCurrentUserMock.mockResolvedValue(USER);
  getEntitlementsMock.mockResolvedValue(PROGRAM_FLAGS);
  getBatchMock.mockResolvedValue(BATCH);
  loadRowsMock.mockResolvedValue(ROWS);
  fromMock.mockImplementation(() => cohortTable([]));
});

describe("GET /api/reports/quarterly", () => {
  it("exports dynamic = force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("401s anonymous callers", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await GET(req("?batch=b-1"))).status).toBe(401);
    expect(getBatchMock).not.toHaveBeenCalled();
  });

  it("403s Scout / Firm (no lp_report / lp_export) with the upgrade hint and records the gate hit", async () => {
    getEntitlementsMock.mockResolvedValue(["investor.dealflow", "advisor.cohort", "white_label"]);
    const res = await GET(req("?batch=b-1"));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("feature_locked");
    expect(json.feature).toBe("lp_report");
    expect(json.upgrade_url).toBe("/pricing?segment=evaluator");
    expect(recordGateHitMock).toHaveBeenCalledWith({ id: "u-1", plan: "investor_vc_small", segment: "investor" }, "lp_report", "api");
    expect(getBatchMock).not.toHaveBeenCalled();
  });

  it("400s without a scope and 404s a batch the caller does not own", async () => {
    expect((await GET(req(""))).status).toBe(400);
    getBatchMock.mockResolvedValue(null);
    const res = await GET(req("?batch=b-other"));
    expect(res.status).toBe(404);
    expect(getBatchMock).toHaveBeenCalledWith("u-1", "b-other");
    expect(loadRowsMock).not.toHaveBeenCalled();
  });

  it("?batch= renders the cohort-scoped sponsor / LP report as print-ready HTML", async () => {
    const res = await GET(req("?batch=b-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const html = await res.text();
    expect(loadRowsMock).toHaveBeenCalledWith(BATCH);
    // Cover + summary scoped to the batch.
    expect(html).toContain("<title>Cohort 4 intake — Sponsor / LP report Q");
    expect(html).toContain("Prepared by Plus Eight");
    expect(html).toContain("2 startups");
    expect(html).toContain("<div class=\"v\">64.5</div><div class=\"l\">Median SVI</div>");
    expect(html).toContain("Acme Robotics ▲ 9 → SVI 71");
    expect(html).toContain("Beta Health ▼ 4 → SVI 58");
    // Per-startup one-liners with report links on this host.
    expect(html).toContain("<strong>Acme Robotics</strong> — SVI 71 · weighted 64.5 · MVP · ▲ 9 — strongest on Founder &amp; Team, biggest gap Traction &amp; Revenue");
    expect(html).toContain("<a href=\"http://localhost/tbr/tok-a\">report</a>");
    // Methodology: doctoral sentence (DBA), never PhD.
    expect(html).toContain("doctoral research (DBA) on startup valuation");
    expect(html).not.toMatch(/PhD/);
    expect(html).toContain("equal weights across the 8 dimensions");
    // Evaluator disclaimer + legal/billing entity.
    expect(html).toContain("data-surface=\"evaluator_report\"");
    expect(html).toContain("General information only — not financial, investment, or legal advice.");
    expect(html).toContain("Auschain PTY LTD (ACN 659 615 111, ABN 79 659 615 111)");
    expect(html).not.toContain("PPL Food");
    // CSP: the print button binds through the nonced script, no inline handler.
    expect(html).toContain("<script nonce=\"n0nce\">");
    expect(html).not.toContain("onclick=");
  });

  it("#14 ?cohort= reads the live 0021 schema: accelerator_cohorts (manager_email = caller) → cohort_members → svi_accounts", async () => {
    fromMock.mockImplementation(liveCohortDb());
    const res = await GET(req("?cohort=c-1"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(fromMock).toHaveBeenCalledWith("accelerator_cohorts");
    expect(fromMock).toHaveBeenCalledWith("cohort_members");
    expect(fromMock).toHaveBeenCalledWith("svi_accounts");
    expect(html).toContain("Cohort 4 intake");
    expect(html).toContain("<strong>Gamma</strong> — SVI 66 · Early traction · new");
    expect(html).toContain("<strong>Delta</strong> — not scored yet");
    expect(html).toContain("<strong>nolink@x.au</strong> — not scored yet");
    expect(html).toContain("doctoral research (DBA)");
    expect(getBatchMock).not.toHaveBeenCalled();
  });

  it("#14 ?cohort= 404s a cohort the caller does not manage, an unknown cohort and an empty one", async () => {
    fromMock.mockImplementation(liveCohortDb({ accelerator_cohorts: [{ id: "c-1", name: "Theirs", manager_email: "someone@else.au" }] }));
    const res = await GET(req("?cohort=c-1"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "not_found" });
    expect(fromMock).not.toHaveBeenCalledWith("cohort_members");

    fromMock.mockImplementation(liveCohortDb({ accelerator_cohorts: [] }));
    expect((await GET(req("?cohort=c-unknown"))).status).toBe(404);

    fromMock.mockImplementation(liveCohortDb({ cohort_members: [] }));
    expect((await GET(req("?cohort=c-1"))).status).toBe(404);
  });

  it("#14 ?cohort= answers 404 cohort_report_unavailable with the ?batch= hint when the accelerator tables cannot serve it", async () => {
    fromMock.mockImplementation(liveCohortDb({}, { cohort_members: { code: "42P01", message: "relation does not exist" } }));
    const res = await GET(req("?cohort=c-1"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(COHORT_UNAVAILABLE);

    fromMock.mockImplementation(liveCohortDb({}, { accelerator_cohorts: { code: "42703", message: "column missing" } }));
    expect(await (await GET(req("?cohort=c-1"))).json()).toEqual({ ok: false, error: "cohort_report_unavailable", hint: "Use ?batch=<id> from Batch score" });
  });
});
