// Unit tests for GET + OPTIONS /api/v1/svi — P9-v1-svi-route-test.
//
// The route is the institutional / team / free-tier public SVI data API
// (T_SVI_EXC_0014). It's the surface external analysts + funds hit when
// they hold a `svi_live_...` bearer key issued by /workspace/svi-api.
// Behaviour to pin against silent regressions:
//
//   1. Bearer-key auth — the route MUST refuse anonymous callers with a 401
//      and the sign-up hint pointing at /workspace/svi-api. Any regression
//      that drops the guard exposes the full listings feed to public
//      scrapers, which invalidates the tiered rate-limit business model.
//   2. Ticker branch — when `?ticker=` is supplied and the row exists, the
//      route returns { ok, tier, data, _meta.generatedAt } (NOT the paged
//      envelope with `pagination`). When the ticker is missing, the route
//      returns 404 with a stable error shape; the listings branch must NOT
//      leak through as a fallback (that would silently return all rows to a
//      typo'd ticker query — an information disclosure regression).
//   3. Ticker match is case-insensitive on BOTH sides — a caller can pass
//      "acme-au" and hit the "ACME-AU" row. Regressing to raw ===
//      breaks documented client behaviour (docs say tickers are case
//      insensitive so widgets can normalise on their end).
//   4. Listings branch — when no ticker is supplied, the route returns the
//      paged envelope { ok, tier, dailyLimit, data, pagination, _meta }
//      with dailyLimit driven by SVI_API_TIERS[tier]. The dailyLimit MUST
//      be surfaced so client SDKs can render a rate-limit warning before
//      the key locks; regressing it to a hard-coded 10 would mislead paid
//      tiers.
//   5. Query normalisation — `page` floors at 1 (a `?page=0` or
//      `?page=-3` request must still page-1, not throw a divide-by-zero
//      or 500 in the paginator). `pageSize` clamps to [1, 100] (a
//      `?pageSize=99999` request must NOT be able to page the entire
//      DB in one hit — that's a DoS on computeListings which loads all
//      analyses per page). `sort` and `sector` fall back to safe defaults
//      when omitted (svi + all). `publicOnly` is true unless the caller
//      passes the literal string "false" (a truthy-string check would
//      accept "0" or "no" and silently expose private rows).
//   6. OPTIONS returns 204 (not 200) with the CORS preflight trio —
//      allow-origin: *, allow-methods must contain GET+OPTIONS,
//      allow-headers must contain Authorization + Content-Type. Regressing
//      to 200 breaks CDN preflight cache separation; regressing the
//      headers breaks every browser-based SDK.
//   7. Every JSON response — success or error — MUST carry the CORS
//      allow-origin header so cross-origin SDK callers actually see the
//      body. Dropping it on the 401 path is a classic bug because the
//      browser silently swallows the response and the SDK renders a
//      "network error" instead of "invalid key".
//
// The test mocks @/lib/svi-api-auth::authenticateSviApiKey (so no supabase in
// the loop) and @/lib/startup-index-listings::computeListings (so no DB read
// through the paginator). SVI_API_TIERS is imported verbatim from the auth
// module — that's a static constant, not a mock target.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const authenticateSviApiKeyMock = vi.fn<
  (req: Request) => Promise<
    | { keyId: string; userId: string; tier: "free" | "team" | "institutional" }
    | null
  >
>();
vi.mock("@/lib/svi-api-auth", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/svi-api-auth")
  >("@/lib/svi-api-auth");
  return {
    ...actual,
    authenticateSviApiKey: (req: Request) => authenticateSviApiKeyMock(req),
  };
});

const computeListingsMock = vi.fn<
  (args: {
    filter: { sector: string; publicOnly: boolean };
    sort: string;
    page: number;
    pageSize: number;
  }) => Promise<{
    rows: Array<{ ticker: string; svi: number }>;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    generatedAt: string;
  }>
>();
vi.mock("@/lib/startup-index-listings", () => ({
  computeListings: (args: Parameters<typeof computeListingsMock>[0]) =>
    computeListingsMock(args),
}));

import { GET, OPTIONS, dynamic } from "./route";

const FAKE_ROWS = [
  { ticker: "ACME-AU", svi: 87.3 },
  { ticker: "OMEGA-AU", svi: 71.9 },
];

function req(url: string): NextRequest {
  return new Request(url) as unknown as NextRequest;
}

beforeEach(() => {
  authenticateSviApiKeyMock.mockReset();
  computeListingsMock.mockReset();
  authenticateSviApiKeyMock.mockResolvedValue({
    keyId: "k-1",
    userId: "u-1",
    tier: "team",
  });
  computeListingsMock.mockResolvedValue({
    rows: FAKE_ROWS,
    total: 2,
    page: 1,
    pageSize: 50,
    totalPages: 1,
    generatedAt: "2026-08-13T00:00:00.000Z",
  });
});

describe("/api/v1/svi — module contract", () => {
  it('exports dynamic = "force-dynamic" so tier-scoped responses never prerender into the static shell', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET — auth guard", () => {
  it("returns 401 with the /workspace/svi-api sign-up hint when the caller has no valid bearer key", async () => {
    authenticateSviApiKeyMock.mockResolvedValue(null);
    const res = await GET(req("http://localhost/api/v1/svi"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toContain("svi_live_");
    expect(body.error.message).toContain("/workspace/svi-api");
    expect(computeListingsMock).not.toHaveBeenCalled();
  });

  it("stamps CORS allow-origin on the 401 body so the SDK surface actually sees the error string", async () => {
    authenticateSviApiKeyMock.mockResolvedValue(null);
    const res = await GET(req("http://localhost/api/v1/svi"));
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("passes the incoming Request to authenticateSviApiKey verbatim (auth reads its own Bearer header)", async () => {
    const r = req("http://localhost/api/v1/svi?sector=saas");
    await GET(r);
    expect(authenticateSviApiKeyMock).toHaveBeenCalledTimes(1);
    expect(authenticateSviApiKeyMock).toHaveBeenCalledWith(r);
  });
});

describe("GET — ticker branch", () => {
  it("returns the single-row envelope when the ticker exists (case-insensitive match)", async () => {
    const res = await GET(req("http://localhost/api/v1/svi?ticker=acme-au"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      tier: "team",
      data: FAKE_ROWS[0],
      _meta: { generatedAt: "2026-08-13T00:00:00.000Z" },
    });
    // No pagination envelope in the ticker branch.
    expect(body).not.toHaveProperty("pagination");
    expect(body).not.toHaveProperty("dailyLimit");
  });

  it("matches case-insensitively when the row is stored upper-case and the caller sends lower-case", async () => {
    computeListingsMock.mockResolvedValue({
      rows: [{ ticker: "MIXED-CASE", svi: 42 }],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
      generatedAt: "2026-08-13T00:00:00.000Z",
    });
    const res = await GET(
      req("http://localhost/api/v1/svi?ticker=mixed-case"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ticker).toBe("MIXED-CASE");
  });

  it("returns 404 with a stable error shape when the ticker does not exist (never falls back to the listings envelope)", async () => {
    const res = await GET(req("http://localhost/api/v1/svi?ticker=ghost-au"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "not_found", message: "Ticker not found" },
    });
    expect(body).not.toHaveProperty("data");
    expect(body).not.toHaveProperty("pagination");
  });

  it("stamps CORS allow-origin on the 404 body so the SDK surface actually sees the not-found message", async () => {
    const res = await GET(req("http://localhost/api/v1/svi?ticker=ghost-au"));
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("GET — listings branch", () => {
  it("returns the paged envelope with the caller's tier + tier-specific dailyLimit + pagination + rows", async () => {
    const res = await GET(req("http://localhost/api/v1/svi"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.tier).toBe("team");
    // team tier daily limit is 1000 per SVI_API_TIERS.
    expect(body.dailyLimit).toBe(1000);
    expect(body.data).toEqual(FAKE_ROWS);
    expect(body.pagination).toEqual({
      page: 1,
      pageSize: 50,
      total: 2,
      totalPages: 1,
    });
    expect(body._meta).toEqual({ generatedAt: "2026-08-13T00:00:00.000Z" });
  });

  it("surfaces the free-tier dailyLimit of 10 for a free key (client SDKs need it to render the rate-limit warning)", async () => {
    authenticateSviApiKeyMock.mockResolvedValue({
      keyId: "k-1",
      userId: "u-1",
      tier: "free",
    });
    const res = await GET(req("http://localhost/api/v1/svi"));
    const body = await res.json();
    expect(body.tier).toBe("free");
    expect(body.dailyLimit).toBe(10);
  });

  it("surfaces the institutional dailyLimit of 9_999_999 for an institutional key (unlimited-in-practice sentinel)", async () => {
    authenticateSviApiKeyMock.mockResolvedValue({
      keyId: "k-1",
      userId: "u-1",
      tier: "institutional",
    });
    const res = await GET(req("http://localhost/api/v1/svi"));
    const body = await res.json();
    expect(body.tier).toBe("institutional");
    expect(body.dailyLimit).toBe(9_999_999);
  });

  it("stamps CORS allow-origin on the success body so cross-origin SDK fetches receive the payload", async () => {
    const res = await GET(req("http://localhost/api/v1/svi"));
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("GET — query normalisation", () => {
  it("defaults sector=all + sort=svi + publicOnly=true + page=1 + pageSize=50 when the caller passes nothing", async () => {
    await GET(req("http://localhost/api/v1/svi"));
    expect(computeListingsMock).toHaveBeenCalledWith({
      filter: { sector: "all", publicOnly: true },
      sort: "svi",
      page: 1,
      pageSize: 50,
    });
  });

  it("passes sector + sort verbatim when supplied", async () => {
    await GET(req("http://localhost/api/v1/svi?sector=saas&sort=delta"));
    expect(computeListingsMock).toHaveBeenCalledWith({
      filter: { sector: "saas", publicOnly: true },
      sort: "delta",
      page: 1,
      pageSize: 50,
    });
  });

  it("floors page at 1 when the caller passes page=0 or a negative page (paginator would divide-by-zero on 0)", async () => {
    await GET(req("http://localhost/api/v1/svi?page=0"));
    expect(computeListingsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1 }),
    );
    computeListingsMock.mockClear();
    await GET(req("http://localhost/api/v1/svi?page=-9"));
    expect(computeListingsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1 }),
    );
  });

  it("parses a valid page number verbatim", async () => {
    await GET(req("http://localhost/api/v1/svi?page=7"));
    expect(computeListingsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 7 }),
    );
  });

  it("clamps pageSize to a floor of 1 when the caller passes 0 or negative (empty-page DoS guard)", async () => {
    await GET(req("http://localhost/api/v1/svi?pageSize=0"));
    expect(computeListingsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageSize: 1 }),
    );
    computeListingsMock.mockClear();
    await GET(req("http://localhost/api/v1/svi?pageSize=-500"));
    expect(computeListingsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageSize: 1 }),
    );
  });

  it("clamps pageSize to 100 when the caller passes an over-large value (full-DB pull DoS guard)", async () => {
    await GET(req("http://localhost/api/v1/svi?pageSize=99999"));
    expect(computeListingsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageSize: 100 }),
    );
  });

  it("passes an in-range pageSize verbatim", async () => {
    await GET(req("http://localhost/api/v1/svi?pageSize=25"));
    expect(computeListingsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageSize: 25 }),
    );
  });

  it("defaults publicOnly to true — the only string that flips it off is the literal 'false'", async () => {
    await GET(req("http://localhost/api/v1/svi?publicOnly=false"));
    expect(computeListingsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ filter: { sector: "all", publicOnly: false } }),
    );
    computeListingsMock.mockClear();
    // Any other truthy-looking string must NOT flip the flag off.
    await GET(req("http://localhost/api/v1/svi?publicOnly=0"));
    expect(computeListingsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ filter: { sector: "all", publicOnly: true } }),
    );
    computeListingsMock.mockClear();
    await GET(req("http://localhost/api/v1/svi?publicOnly=no"));
    expect(computeListingsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ filter: { sector: "all", publicOnly: true } }),
    );
  });
});

describe("OPTIONS — CORS preflight", () => {
  it("returns 204 (not 200) so CDNs cache the preflight in the preflight-only slot", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
  });

  it("stamps allow-origin: * for cross-origin SDK bootstraps", async () => {
    const res = await OPTIONS();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("stamps allow-methods containing GET + OPTIONS so browsers accept the fetch", async () => {
    const res = await OPTIONS();
    const methods = res.headers.get("access-control-allow-methods") ?? "";
    expect(methods).toMatch(/GET/);
    expect(methods).toMatch(/OPTIONS/);
  });

  it("stamps allow-headers containing Authorization + Content-Type so browsers accept the Bearer header", async () => {
    const res = await OPTIONS();
    const headers = res.headers.get("access-control-allow-headers") ?? "";
    expect(headers).toMatch(/Authorization/);
    expect(headers).toMatch(/Content-Type/);
  });

  it("returns an empty body (preflight responses must not carry a payload)", async () => {
    const res = await OPTIONS();
    const text = await res.text();
    expect(text).toBe("");
  });
});
