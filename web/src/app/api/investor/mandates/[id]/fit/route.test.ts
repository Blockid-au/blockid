// Colocated vitest for GET /api/investor/mandates/[id]/fit (G13-W3-T2).
// Pins: 401 / 402 (+ recordGateHit), 404 on a malformed id or a mandate the
// caller cannot read (never 403), the persisted rows path (deal-flow v2 for
// that mandate with the URL filters), and the `?project_id=` live path —
// scored with scoreFit only when the project is the caller's evaluation or
// founder-visible, 404 otherwise. Read-only route: not apiRoute()-wrapped.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { userMock, canMock, gateHitMock, mandateMock, dealflowMock, loadMock, visibleMock, dbState } = vi.hoisted(() => ({
  userMock: vi.fn(),
  canMock: vi.fn(),
  gateHitMock: vi.fn(),
  mandateMock: vi.fn(),
  dealflowMock: vi.fn(),
  loadMock: vi.fn(),
  visibleMock: vi.fn(),
  dbState: { evals: [] as unknown[] },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => userMock() }));
vi.mock("@/lib/entitlements", () => ({ can: (u: unknown, f: string) => canMock(u, f), recordGateHit: (u: unknown, f: string, s: string) => gateHitMock(u, f, s) }));
vi.mock("@/lib/investors/mandates", () => ({ getMandateForUser: (u: string, id: string) => mandateMock(u, id) }));
vi.mock("@/lib/investors/dealflow", () => ({ getDealFlowV2: (u: string, f: unknown) => dealflowMock(u, f) }));
vi.mock("@/lib/investors/fit-refresh", () => ({
  loadFitStartups: (_db: unknown, ids: string[]) => loadMock(ids),
  listVisibleProjectIds: () => visibleMock(),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: dbState.evals, error: null }) }) }) }) }),
  }),
}));

import { GET } from "./route";

const USER = { id: "u-1", email: "a@example.com", plan: "investor_angel" };
const MID = "22222222-2222-4222-8222-222222222222";
const PID = "44444444-4444-4444-8444-444444444444";
const MANDATE = { id: MID, label: "Seed fintech", sectors_include: ["fintech"], sectors_exclude: [], business_models: [], customer_types: [], stages: ["seed"], cheque_min_aud: null, cheque_max_aud: null, lead_or_follow: null, geographies: [], revenue_min_aud: null, growth_min_pct: null, min_svi: null, tags_include: [], tags_exclude: [], weights: {} };
const STARTUP = { project_id: PID, name: "PayFlow", taxonomy: { industry: "fintech", industry_secondary: null, business_model: "saas_subscription", customer_types: [], stage_key: "seed", hq_state: "NSW", hq_country: "AU", geo_scope: null, tags: [] }, svi: 70, snapshot_id: "s", snapshot_at: "t", svi_30d_ago: null, archived: false };

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url = `http://localhost/api/investor/mandates/${MID}/fit`) => new Request(url) as unknown as NextRequest;

beforeEach(() => {
  userMock.mockReset().mockResolvedValue(USER);
  canMock.mockReset().mockResolvedValue(true);
  gateHitMock.mockReset().mockResolvedValue(undefined);
  mandateMock.mockReset().mockResolvedValue(MANDATE);
  dealflowMock.mockReset().mockResolvedValue({ migrated: true, mandate: MANDATE, mandates: [MANDATE], rows: [{ project_id: PID, fit: 100 }], total_above_floor: 1, never_computed: false, views: [] });
  loadMock.mockReset().mockResolvedValue(new Map([[PID, STARTUP]]));
  visibleMock.mockReset().mockResolvedValue(new Set<string>());
  dbState.evals = [];
});

describe("GET /api/investor/mandates/[id]/fit", () => {
  it("401 anonymous; 402 feature_locked with recordGateHit", async () => {
    userMock.mockResolvedValue(null);
    expect((await GET(req(), ctx(MID))).status).toBe(401);
    userMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(false);
    expect((await GET(req(), ctx(MID))).status).toBe(402);
    expect(gateHitMock).toHaveBeenCalledWith(expect.objectContaining({ id: "u-1" }), "investor.dealflow", "api");
  });

  it("404 on a malformed id and on a mandate the caller cannot read (never 403)", async () => {
    expect((await GET(req(), ctx("nope"))).status).toBe(404);
    mandateMock.mockResolvedValue(null);
    const res = await GET(req(), ctx(MID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "not_found" });
    expect(dealflowMock).not.toHaveBeenCalled();
  });

  it("persisted rows: deal-flow v2 for that mandate with the URL filters, private no-store", async () => {
    const res = await GET(req(`http://localhost/api/investor/mandates/${MID}/fit?stage=seed&fit=0&sort=svi`), ctx(MID));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toMatchObject({ ok: true, mandate: { id: MID, label: "Seed fintech" }, count: 1, never_computed: false, rows: [{ project_id: PID }] });
    expect(dealflowMock).toHaveBeenCalledWith("u-1", expect.objectContaining({ mandate_id: MID, stage: ["seed"], min_fit: 0, sort: "svi" }));
  });

  it("?project_id= scores live when the project is the caller's evaluation (or founder-visible); 404 otherwise", async () => {
    dbState.evals = [{ id: "e1" }];
    const res = await GET(req(`http://localhost/api/investor/mandates/${MID}/fit?project_id=${PID}`), ctx(MID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.live.project_id).toBe(PID);
    expect(body.live.fit.score).toBe(100);
    expect(body.live.fit.reasons).toContain("Invests in fintech");
    expect(dealflowMock).not.toHaveBeenCalled();

    dbState.evals = [];
    expect((await GET(req(`http://localhost/api/investor/mandates/${MID}/fit?project_id=${PID}`), ctx(MID))).status).toBe(404);
    visibleMock.mockResolvedValue(new Set([PID]));
    expect((await GET(req(`http://localhost/api/investor/mandates/${MID}/fit?project_id=${PID}`), ctx(MID))).status).toBe(200);
    expect((await GET(req(`http://localhost/api/investor/mandates/${MID}/fit?project_id=bad`), ctx(MID))).status).toBe(404);
    loadMock.mockResolvedValue(new Map());
    expect((await GET(req(`http://localhost/api/investor/mandates/${MID}/fit?project_id=${PID}`), ctx(MID))).status).toBe(404);
  });
});
