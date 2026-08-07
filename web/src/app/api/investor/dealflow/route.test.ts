// Unit tests for GET /api/investor/dealflow — P9-investor-dealflow-route-test.
//
// Pins the route contract branches from route.ts:
//   1. Anonymous → 401 { ok:false, error:"auth_required" }, no downstream calls.
//   2. Feature-locked → 402 { ok:false, error:"feature_locked",
//      feature:"investor.dealflow" }, recordGateHit fired with surface="api",
//      getDealFlow NOT invoked.
//   3. Happy path → 200 { ok:true, count, rows, filters } with parsed filter
//      echo (stage/sector/jurisdiction/minScore/limit) and rows forwarded from
//      getDealFlow.
//   4. Invalid stage (not in VALID_STAGES) is coerced to null.
//   5. Sector empty string is coerced to null.
//   6. Jurisdiction is uppercased.
//   7. minScore parsed + clamped to [0, 100] (below → 0, above → 100).
//   8. Non-numeric minScore is coerced to null.
//   9. limit parsed + clamped to [1, 200] with default 50 on absent or invalid.
//  10. can() call is shaped { id, plan, segment:"investor", jurisdiction:<c> }
//      so any investor SKU (Angel+) qualifies regardless of the founder plan id.
//  11. dynamic = "force-dynamic" export exists so per-investor dealflow never
//      prerenders into the static shell.
//
// Silent regressions this pins against:
//   - dropping the auth gate → anonymous callers see dealflow rows;
//   - dropping recordGateHit on the 402 path → the CRO funnel loses signal on
//     which features hit the paywall most often;
//   - dropping the .toUpperCase() on jurisdiction → filter is case-sensitive
//     on the DB side and drops legitimate matches ("au" vs "AU");
//   - widening/removing VALID_STAGES gate → unknown stage strings reach the
//     lib and match zero rows silently;
//   - dropping the limit clamp → a caller sends ?limit=1000000 and blows up
//     the score-table read cost;
//   - dropping the minScore clamp → a caller sends ?minScore=-999 and the
//     >= filter is a no-op vs sending ?minScore=1e9 and the read is empty;
//   - dropping the default limit fallback → getDealFlow gets limit:NaN and
//     the Math.min inside blows up to NaN;
//   - swapping the response filter echo shape → the UI depends on
//     { stage, sector, jurisdiction, minScore, limit } to render chip labels.
//
// The auth + entitlements + investor-portal + jurisdiction libs are mocked so
// this test asserts pure route wiring, not read/entitlement/detection behaviour
// (each of those has its own colocated suite).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const canMock = vi.fn();
const recordGateHitMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({
  can: (user: unknown, feature: string) => canMock(user, feature),
  recordGateHit: (user: unknown, feature: string, surface: string) =>
    recordGateHitMock(user, feature, surface),
}));

const getDealFlowMock = vi.fn();
vi.mock("@/lib/investor-portal", () => ({
  getDealFlow: (userId: string, filters: unknown) =>
    getDealFlowMock(userId, filters),
}));

const detectJurisdictionMock = vi.fn();
vi.mock("@/lib/jurisdiction", () => ({
  detectJurisdiction: (req: unknown) => detectJurisdictionMock(req),
}));

import { GET, dynamic } from "./route";

const USER = { id: "u-99", email: "angel@example.com", plan: "investor_angel" };

const ROWS = [
  { id: "s-1", company_name: "Alpha Co", total_score: 82, sector: "fintech" },
  { id: "s-2", company_name: "Beta Co", total_score: 75, sector: "climate" },
];

function makeReq(url: string): NextRequest {
  return new Request(url) as unknown as NextRequest;
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  canMock.mockReset();
  recordGateHitMock.mockReset();
  getDealFlowMock.mockReset();
  detectJurisdictionMock.mockReset();
  getCurrentUserMock.mockResolvedValue(USER);
  canMock.mockResolvedValue(true);
  recordGateHitMock.mockResolvedValue(undefined);
  getDealFlowMock.mockResolvedValue(ROWS);
  detectJurisdictionMock.mockResolvedValue({
    country: "AU",
    source: "ip",
    confidence: "high",
  });
});

describe("dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-investor dealflow never prerenders', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/investor/dealflow — anonymous branch", () => {
  it("returns 401 { ok:false, error:'auth_required' } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(makeReq("http://localhost/api/investor/dealflow"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "auth_required" });
  });

  it("does NOT touch detectJurisdiction / can / recordGateHit / getDealFlow on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET(makeReq("http://localhost/api/investor/dealflow"));
    expect(detectJurisdictionMock).not.toHaveBeenCalled();
    expect(canMock).not.toHaveBeenCalled();
    expect(recordGateHitMock).not.toHaveBeenCalled();
    expect(getDealFlowMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/investor/dealflow — feature-locked branch", () => {
  it("returns 402 { ok:false, error:'feature_locked', feature:'investor.dealflow' } when can() denies", async () => {
    canMock.mockResolvedValue(false);
    const res = await GET(makeReq("http://localhost/api/investor/dealflow"));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "feature_locked",
      feature: "investor.dealflow",
    });
  });

  it("fires recordGateHit(user, 'investor.dealflow', 'api') on the 402 path", async () => {
    canMock.mockResolvedValue(false);
    await GET(makeReq("http://localhost/api/investor/dealflow"));
    expect(recordGateHitMock).toHaveBeenCalledTimes(1);
    const [userArg, featureArg, surfaceArg] = recordGateHitMock.mock.calls[0];
    expect(featureArg).toBe("investor.dealflow");
    expect(surfaceArg).toBe("api");
    expect((userArg as { id: string }).id).toBe("u-99");
  });

  it("does NOT call getDealFlow when the gate denies", async () => {
    canMock.mockResolvedValue(false);
    await GET(makeReq("http://localhost/api/investor/dealflow"));
    expect(getDealFlowMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/investor/dealflow — can() userSubset shape", () => {
  it("passes { id, plan, segment:'investor', jurisdiction } to can()", async () => {
    detectJurisdictionMock.mockResolvedValue({
      country: "NZ",
      source: "declared",
      confidence: "high",
    });
    await GET(makeReq("http://localhost/api/investor/dealflow"));
    const [userArg, featureArg] = canMock.mock.calls[0];
    expect(userArg).toEqual({
      id: "u-99",
      plan: "investor_angel",
      segment: "investor",
      jurisdiction: "NZ",
    });
    expect(featureArg).toBe("investor.dealflow");
  });

  it("falls back to plan '' when the caller has no plan attached", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "u-nil-plan",
      email: "a@b.co",
      plan: null,
    });
    await GET(makeReq("http://localhost/api/investor/dealflow"));
    const [userArg] = canMock.mock.calls[0];
    expect((userArg as { plan: string }).plan).toBe("");
  });

  it("forwards the request into detectJurisdiction verbatim (so cookie + billing headers reach it)", async () => {
    const req = makeReq("http://localhost/api/investor/dealflow");
    await GET(req);
    expect(detectJurisdictionMock).toHaveBeenCalledTimes(1);
    expect(detectJurisdictionMock).toHaveBeenCalledWith(req);
  });
});

describe("GET /api/investor/dealflow — happy path with defaults", () => {
  it("returns 200 { ok:true, count, rows, filters } with default filters when no query params", async () => {
    const res = await GET(makeReq("http://localhost/api/investor/dealflow"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2);
    expect(body.rows).toEqual(ROWS);
    expect(body.filters).toEqual({
      stage: null,
      sector: null,
      jurisdiction: null,
      minScore: null,
      limit: 50,
    });
  });

  it("forwards user.id + normalised filters into getDealFlow (not e.g. email)", async () => {
    await GET(makeReq("http://localhost/api/investor/dealflow"));
    expect(getDealFlowMock).toHaveBeenCalledTimes(1);
    const [userId, filters] = getDealFlowMock.mock.calls[0];
    expect(userId).toBe("u-99");
    expect(filters).toEqual({
      stage: null,
      sector: null,
      jurisdiction: null,
      minScore: null,
      limit: 50,
    });
  });

  it("count === rows.length even when getDealFlow returns an empty array", async () => {
    getDealFlowMock.mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost/api/investor/dealflow"));
    const body = await res.json();
    expect(body.count).toBe(0);
    expect(body.rows).toEqual([]);
  });
});

describe("GET /api/investor/dealflow — stage filter", () => {
  it("accepts a valid stage from VALID_STAGES ('seed')", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?stage=seed"),
    );
    const body = await res.json();
    expect(body.filters.stage).toBe("seed");
    expect(getDealFlowMock.mock.calls[0][1].stage).toBe("seed");
  });

  it("accepts 'any' as a valid stage sentinel", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?stage=any"),
    );
    const body = await res.json();
    expect(body.filters.stage).toBe("any");
  });

  it("coerces an unknown stage to null (never leaks unknown enum to the lib)", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?stage=mega_growth"),
    );
    const body = await res.json();
    expect(body.filters.stage).toBeNull();
    expect(getDealFlowMock.mock.calls[0][1].stage).toBeNull();
  });

  it("treats an empty stage query param as null (trim-then-membership guard)", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?stage="),
    );
    const body = await res.json();
    expect(body.filters.stage).toBeNull();
  });

  it("accepts every canonical StageBand value (pre_seed / seed / series_a / series_b / growth / any)", async () => {
    for (const stage of [
      "pre_seed",
      "seed",
      "series_a",
      "series_b",
      "growth",
      "any",
    ]) {
      getDealFlowMock.mockClear();
      const res = await GET(
        makeReq(`http://localhost/api/investor/dealflow?stage=${stage}`),
      );
      const body = await res.json();
      expect(body.filters.stage).toBe(stage);
    }
  });
});

describe("GET /api/investor/dealflow — sector filter", () => {
  it("passes a trimmed non-empty sector through verbatim", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?sector=fintech"),
    );
    const body = await res.json();
    expect(body.filters.sector).toBe("fintech");
  });

  it("coerces an empty sector query param to null (no zero-length string match)", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?sector="),
    );
    const body = await res.json();
    expect(body.filters.sector).toBeNull();
  });

  it("coerces a whitespace-only sector to null (trim then check)", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?sector=%20%20"),
    );
    const body = await res.json();
    expect(body.filters.sector).toBeNull();
  });
});

describe("GET /api/investor/dealflow — jurisdiction filter", () => {
  it("uppercases a lowercase jurisdiction ('au' → 'AU')", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?jurisdiction=au"),
    );
    const body = await res.json();
    expect(body.filters.jurisdiction).toBe("AU");
  });

  it("uppercases a mixed-case jurisdiction ('Nz' → 'NZ')", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?jurisdiction=Nz"),
    );
    const body = await res.json();
    expect(body.filters.jurisdiction).toBe("NZ");
  });

  it("coerces empty jurisdiction to null (before the .toUpperCase())", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?jurisdiction="),
    );
    const body = await res.json();
    expect(body.filters.jurisdiction).toBeNull();
  });
});

describe("GET /api/investor/dealflow — minScore clamping", () => {
  it("passes a numeric minScore through (70)", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?minScore=70"),
    );
    const body = await res.json();
    expect(body.filters.minScore).toBe(70);
    expect(getDealFlowMock.mock.calls[0][1].minScore).toBe(70);
  });

  it("clamps a below-range minScore up to 0 (never sends negative to the >= filter)", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?minScore=-25"),
    );
    const body = await res.json();
    expect(body.filters.minScore).toBe(0);
  });

  it("clamps an above-range minScore down to 100 (SVI ceiling)", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?minScore=250"),
    );
    const body = await res.json();
    expect(body.filters.minScore).toBe(100);
  });

  it("coerces a non-numeric minScore to null (never sends NaN to the lib)", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?minScore=abc"),
    );
    const body = await res.json();
    expect(body.filters.minScore).toBeNull();
  });

  it("accepts minScore=0 as a valid explicit floor (not coerced to null)", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?minScore=0"),
    );
    const body = await res.json();
    expect(body.filters.minScore).toBe(0);
  });

  it("accepts minScore=100 as the SVI ceiling (not coerced to 99)", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?minScore=100"),
    );
    const body = await res.json();
    expect(body.filters.minScore).toBe(100);
  });
});

describe("GET /api/investor/dealflow — limit clamping", () => {
  it("passes a valid limit through (25)", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?limit=25"),
    );
    const body = await res.json();
    expect(body.filters.limit).toBe(25);
    expect(getDealFlowMock.mock.calls[0][1].limit).toBe(25);
  });

  it("clamps a below-range limit up to 1 (never sends 0 to the lib)", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?limit=0"),
    );
    const body = await res.json();
    expect(body.filters.limit).toBe(1);
  });

  it("clamps an above-range limit down to 200 (score-table read-cost ceiling)", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?limit=100000"),
    );
    const body = await res.json();
    expect(body.filters.limit).toBe(200);
  });

  it("falls back to default 50 when limit is absent", async () => {
    const res = await GET(makeReq("http://localhost/api/investor/dealflow"));
    const body = await res.json();
    expect(body.filters.limit).toBe(50);
  });

  it("falls back to default 50 when limit is non-numeric", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?limit=huge"),
    );
    const body = await res.json();
    expect(body.filters.limit).toBe(50);
  });

  it("accepts limit=1 as the smallest legal value (not clamped up)", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?limit=1"),
    );
    const body = await res.json();
    expect(body.filters.limit).toBe(1);
  });

  it("accepts limit=200 as the ceiling (not clamped down)", async () => {
    const res = await GET(
      makeReq("http://localhost/api/investor/dealflow?limit=200"),
    );
    const body = await res.json();
    expect(body.filters.limit).toBe(200);
  });
});

describe("GET /api/investor/dealflow — combined query parsing", () => {
  it("parses all five params together and forwards them normalised", async () => {
    const res = await GET(
      makeReq(
        "http://localhost/api/investor/dealflow?stage=series_a&sector=climate&jurisdiction=au&minScore=60&limit=25",
      ),
    );
    const body = await res.json();
    expect(body.filters).toEqual({
      stage: "series_a",
      sector: "climate",
      jurisdiction: "AU",
      minScore: 60,
      limit: 25,
    });
    expect(getDealFlowMock.mock.calls[0][1]).toEqual({
      stage: "series_a",
      sector: "climate",
      jurisdiction: "AU",
      minScore: 60,
      limit: 25,
    });
  });

  it("echoes the exact filter payload the lib was called with (contract lock)", async () => {
    await GET(
      makeReq(
        "http://localhost/api/investor/dealflow?stage=growth&sector=biotech&jurisdiction=US&minScore=45&limit=10",
      ),
    );
    const [, filters] = getDealFlowMock.mock.calls[0];
    expect(filters).toEqual({
      stage: "growth",
      sector: "biotech",
      jurisdiction: "US",
      minScore: 45,
      limit: 10,
    });
  });
});
