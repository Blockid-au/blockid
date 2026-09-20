// Colocated vitest for /api/cron/outcome-signals (G21 P3-A): CRON_SECRET
// ladder (Bearer / x-cron-secret / missing secret fails closed), GET and
// POST both run, `?cap=` is forwarded and clamped, `?dry=1` derives without
// writing, GITHUB_TOKEN gates the tag fetcher, 503 without a db, a job
// failure is a 500. The derivation is pinned in lib/outcomes/proposals.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runOutcomeSignals: vi.fn(),
  listRecentlySnapshottedProjects: vi.fn(),
  loadProposalContext: vi.fn(),
  deriveProposals: vi.fn(),
  db: { from: () => ({}) } as unknown,
}));
vi.mock("@/lib/outcomes/proposals", async () => {
  const actual = await vi.importActual<typeof import("@/lib/outcomes/proposals")>("@/lib/outcomes/proposals");
  return {
    ...actual,
    runOutcomeSignals: (...a: unknown[]) => mocks.runOutcomeSignals(...a),
    listRecentlySnapshottedProjects: (...a: unknown[]) => mocks.listRecentlySnapshottedProjects(...a),
    loadProposalContext: (...a: unknown[]) => mocks.loadProposalContext(...a),
    deriveProposals: (...a: unknown[]) => mocks.deriveProposals(...a),
  };
});
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.db }));
vi.mock("@/lib/audit", () => ({ appendAudit: vi.fn(async () => ({})) }));

import { GET, POST } from "./route";

const SECRET = "test_cron_secret_outcomes";
const RESULT = { ok: true, at: "2026-09-20T03:10:00.000Z", projects: 2, derived: 3, inserted: 1, capped: false, warnings: [] };

function req(path = "/api/cron/outcome-signals", headers: Record<string, string> = {}, method = "GET") {
  return new Request(`http://localhost${path}`, { method, headers });
}
const auth = { authorization: `Bearer ${SECRET}` };

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  delete process.env.GITHUB_TOKEN;
  mocks.db = { from: () => ({}) };
  mocks.runOutcomeSignals.mockReset();
  mocks.runOutcomeSignals.mockResolvedValue(RESULT);
  mocks.listRecentlySnapshottedProjects.mockReset();
  mocks.listRecentlySnapshottedProjects.mockResolvedValue({ ids: ["p-1"], capped: false });
  mocks.loadProposalContext.mockReset();
  mocks.loadProposalContext.mockResolvedValue({ ctx: { projectId: "p-1" }, warnings: ["p-1 warn"] });
  mocks.deriveProposals.mockReset();
  mocks.deriveProposals.mockReturnValue([{ kind: "grant_success", source: "external_signal", observed_at: "2026-03-04T00:00:00.000Z" }]);
});
afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.GITHUB_TOKEN;
});

describe("auth", () => {
  it("401 without a credential, wrong one, or unset secret (fail closed); Bearer + x-cron-secret both work; GET and POST run", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("/api/cron/outcome-signals", { authorization: "Bearer nope" }))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req("/api/cron/outcome-signals", auth))).status).toBe(401);
    expect(mocks.runOutcomeSignals).not.toHaveBeenCalled();
    process.env.CRON_SECRET = SECRET;
    expect((await GET(req("/api/cron/outcome-signals", auth))).status).toBe(200);
    expect((await POST(req("/api/cron/outcome-signals", { "x-cron-secret": SECRET }, "POST"))).status).toBe(200);
    expect(mocks.runOutcomeSignals).toHaveBeenCalledTimes(2);
  });
});

describe("run", () => {
  it("forwards the default cap, no tag fetcher without GITHUB_TOKEN, an audit writer; returns the runner result", async () => {
    const res = await GET(req("/api/cron/outcome-signals", auth));
    const body = await res.json();
    expect(body).toMatchObject({ ...RESULT, dry: false });
    const deps = mocks.runOutcomeSignals.mock.calls[0]![1] as { cap: number; fetchTags?: unknown; audit: unknown };
    expect(deps.cap).toBe(500);
    expect(deps.fetchTags).toBeUndefined();
    expect(typeof deps.audit).toBe("function");
  });

  it("?cap clamps to 2000; GITHUB_TOKEN enables the tag fetcher", async () => {
    process.env.GITHUB_TOKEN = "ghp_test";
    await GET(req("/api/cron/outcome-signals?cap=9999", auth));
    const deps = mocks.runOutcomeSignals.mock.calls[0]![1] as { cap: number; fetchTags?: unknown };
    expect(deps.cap).toBe(2000);
    expect(typeof deps.fetchTags).toBe("function");
  });

  it("?dry=1 derives per project without the runner, reports derived + sample + warnings", async () => {
    const res = await GET(req("/api/cron/outcome-signals?dry=1", auth));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, dry: true, projects: 1, derived: 1, inserted: 0 });
    expect(body.sample[0]).toMatchObject({ project_id: "p-1", kind: "grant_success" });
    expect(body.warnings).toEqual(["p-1: p-1 warn"]);
    expect(mocks.runOutcomeSignals).not.toHaveBeenCalled();
  });

  it("503 without a db; 500 when the job throws (never a silent 200)", async () => {
    mocks.db = null;
    expect((await GET(req("/api/cron/outcome-signals", auth))).status).toBe(503);
    mocks.db = { from: () => ({}) };
    mocks.runOutcomeSignals.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(req("/api/cron/outcome-signals", auth));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });
});
