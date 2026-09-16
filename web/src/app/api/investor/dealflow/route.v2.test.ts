// GET /api/investor/dealflow — the v2 branch (G13-W3-T2, Appendix 1):
// with 0393 applied and a mandate on file the route returns
// mandate_fit_scores-backed rows keyed on project_id with the §B.8 filters
// parsed from the URL; the legacy getDealFlow() path is never called. The
// v1 fallback (`version: 1`, `reason`) is exercised by route.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { userMock, canMock, gateHitMock, legacyMock, v2Mock } = vi.hoisted(() => ({
  userMock: vi.fn(), canMock: vi.fn(), gateHitMock: vi.fn(), legacyMock: vi.fn(), v2Mock: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => userMock() }));
vi.mock("@/lib/entitlements", () => ({ can: (u: unknown, f: string) => canMock(u, f), recordGateHit: (u: unknown, f: string, s: string) => gateHitMock(u, f, s) }));
vi.mock("@/lib/investor-portal", () => ({ getDealFlow: (u: string, f: unknown) => legacyMock(u, f) }));
vi.mock("@/lib/jurisdiction", () => ({ detectJurisdiction: async () => ({ country: "AU", source: "ip", confidence: "high" }) }));
vi.mock("@/lib/investors/dealflow", () => ({ getDealFlowV2: (u: string, f: unknown) => v2Mock(u, f) }));

import { GET } from "./route";

const USER = { id: "u-1", email: "a@example.com", plan: "investor_angel" };
const ROW = { project_id: "p1", company_name: "PayFlow", svi: 64, industry: "fintech", stage_key: "seed", fit: 100, reasons: ["Invests in fintech"], gaps: [], blockers: [], unclassified: false };
const req = (url: string) => new Request(url) as unknown as NextRequest;

beforeEach(() => {
  userMock.mockReset().mockResolvedValue(USER);
  canMock.mockReset().mockResolvedValue(true);
  gateHitMock.mockReset();
  legacyMock.mockReset().mockResolvedValue([]);
  v2Mock.mockReset().mockResolvedValue({ migrated: true, mandate: { id: "m1", label: "Seed fintech" }, mandates: [], rows: [ROW], total_above_floor: 3, never_computed: false, views: [{ id: "abc123", name: "Seed NSW" }] });
});

describe("GET /api/investor/dealflow — v2", () => {
  it("returns version 2 rows for the mandate with the parsed §B.8 filters; legacy loader untouched", async () => {
    const res = await GET(req("http://localhost/api/investor/dealflow?industry=fintech,ai_ml&stage=seed&state=nsw&fit=60&sort=svi"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, version: 2, count: 1, rows: [ROW], mandate: { id: "m1", label: "Seed fintech" }, never_computed: false, total_above_floor: 3 });
    expect(body.views).toEqual([{ id: "abc123", name: "Seed NSW" }]);
    expect(body.filters).toEqual({ industry: ["fintech", "ai_ml"], business_model: [], stage: ["seed"], state: ["NSW"], tags: [], min_fit: 60, sort: "svi" });
    expect(v2Mock).toHaveBeenCalledWith("u-1", body.filters);
    expect(legacyMock).not.toHaveBeenCalled();
  });

  it("falls back to version 1 with the reason when there is no mandate yet", async () => {
    v2Mock.mockResolvedValue({ migrated: true, mandate: null, mandates: [], rows: [], total_above_floor: 0, never_computed: true, views: [] });
    legacyMock.mockResolvedValue([{ score_id: "s1" }]);
    const body = await (await GET(req("http://localhost/api/investor/dealflow"))).json();
    expect(body).toMatchObject({ ok: true, version: 1, reason: "no_mandate", count: 1 });
    expect(legacyMock).toHaveBeenCalled();
  });
});
