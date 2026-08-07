// Colocated vitest for GET /api/index/listings — P9-index-listings-route-test.
//
// This route is the paginated public listing feed of every analysed startup
// on the BSI-AU exchange. SSR'd by /index/markets and consumed by external
// partner dashboards. Silent regressions this pins against:
//   - flipping `export const dynamic` off "force-dynamic" so Next serves a
//     stale prerender when a founder has just opted-in to publicName visibility
//     (the anonymous → public transition would take up to 300s to reflect).
//   - dropping `export const revalidate = 300` so the CDN loses its 5-minute
//     TTL contract with the SSR page.
//   - dropping the "Cache-Control: public, s-maxage=300, stale-while-revalidate=600"
//     header so edge caches thrash the route on every partner refresh.
//   - dropping the `ok: true` envelope so partners lose the standard success
//     discriminator every other public /api/* route ships.
//   - dropping the object-spread of the ListingsResult payload so top-level
//     keys (rows, total, page, pageSize, totalPages, generatedAt) move under
//     a nested "result" key — the SSR page destructures the flat shape and
//     will render a blank table.
//   - relaxing the pageSize [10, 100] clamp — a `?pageSize=100000` request
//     would push the aggregator into a full-market pull that ships megabytes
//     down every partner refresh.
//   - relaxing the page ≥ 1 clamp so `?page=0` (or `-3`) drops into an off-by-one
//     window that duplicates row 1 across the first two pages.
//   - dropping the strict `public_only === "true"` guard so `?public_only=1`
//     silently narrows to public-only rows and hides 90% of the market from
//     partner integrations that hit the route with URLSearchParams-flavoured
//     "1"/"0" toggles.
//   - dropping the `q.get("stage") == null` short-circuit so a missing stage
//     query lands as `Number(null) === 0` on the aggregator's `.eq('stage',0)`
//     filter and blanks every row that isn't at Concept stage.
//
// The test mocks the aggregator (which itself needs Supabase) so it stays a
// pure route contract test — the aggregator's own logic is exercised by its
// colocated startup-index-listings.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type {
  ListingsResult,
  ListingRow,
  ListingFilter,
  ListingSort,
} from "@/lib/startup-index-listings";

// --- Mocks ------------------------------------------------------------------

interface ComputeListingsArgs {
  filter?: ListingFilter;
  sort?: ListingSort;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

const computeListingsMock =
  vi.fn<(args: ComputeListingsArgs) => Promise<ListingsResult>>();

vi.mock("@/lib/startup-index-listings", () => ({
  computeListings: (args: ComputeListingsArgs) => computeListingsMock(args),
}));

// Route import must come AFTER the mocks are registered.
import { GET, dynamic, revalidate } from "./route";

// --- Helpers ----------------------------------------------------------------

function fixtureRow(overrides: Partial<ListingRow> = {}): ListingRow {
  return {
    ticker: "SAAS-ABC",
    slug: "acme-abc",
    identityHash: "abc123def456",
    sector: "saas",
    sectorLabel: "SaaS",
    stage: 4,
    stageLabel: "Revenue",
    svi: 112,
    deltaWeek: 3,
    valuationAud: 12_500_000,
    sparkline: [110, 111, 112, 111, 113, 112, 112],
    publicName: null,
    publicVisible: false,
    hasRevenue: true,
    lastAnalysisAt: "2026-08-07T00:00:00.000Z",
    analysesCount: 7,
    ...overrides,
  };
}

function fixtureResult(overrides: Partial<ListingsResult> = {}): ListingsResult {
  return {
    rows: [fixtureRow(), fixtureRow({ ticker: "FINT-XYZ", sector: "fintech" })],
    total: 138,
    page: 1,
    pageSize: 50,
    totalPages: 3,
    generatedAt: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

function makeReq(query = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/index/listings${query ? `?${query}` : ""}`,
  );
}

async function callGet(query = ""): Promise<{
  status: number;
  headers: Headers;
  body: { ok: boolean } & ListingsResult;
}> {
  const res = await GET(makeReq(query));
  const body = (await res.json()) as { ok: boolean } & ListingsResult;
  return { status: res.status, headers: res.headers, body };
}

// --- Setup ------------------------------------------------------------------

beforeEach(() => {
  computeListingsMock.mockReset();
  computeListingsMock.mockResolvedValue(fixtureResult());
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── module invariants ────────────────────────────────────────────────────

describe("module invariants", () => {
  it("dynamic is force-dynamic (a founder toggling publicVisible must reflect within one request, not one prerender window)", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("revalidate is exactly 300 seconds (SSR /index/markets pairs its cache TTL with this constant — flipping it decouples the two surfaces)", () => {
    expect(revalidate).toBe(300);
  });

  it("GET is thenable (Next 15 route handlers must return a Promise so streaming/SSR works)", () => {
    const ret = GET(makeReq());
    expect(typeof (ret as unknown as { then?: unknown }).then).toBe("function");
  });
});

// ─── aggregator contract ─────────────────────────────────────────────────

describe("aggregator contract", () => {
  it("invokes computeListings exactly once per request (no accidental double-fetch that would double the Supabase scan cost)", async () => {
    await callGet();
    expect(computeListingsMock).toHaveBeenCalledTimes(1);
  });

  it("passes a single args object (the aggregator signature is (args) — a stray second arg would leak into rest-args and show up as an unused-var lint)", async () => {
    await callGet();
    expect(computeListingsMock.mock.calls[0].length).toBe(1);
  });

  it("propagates aggregator rejection (the route intentionally has NO try/catch — Next's error boundary handles it; a silent wrap would render fake zeros instead of 500ing)", async () => {
    computeListingsMock.mockRejectedValueOnce(new Error("db down"));
    await expect(GET(makeReq())).rejects.toThrow("db down");
  });
});

// ─── query parsing: filter ───────────────────────────────────────────────

describe("query parsing — filter", () => {
  it("defaults filter.sector to 'all' when omitted", async () => {
    await callGet();
    expect(computeListingsMock.mock.calls[0][0].filter?.sector).toBe("all");
  });

  it("passes filter.sector verbatim from ?sector=", async () => {
    await callGet("sector=fintech");
    expect(computeListingsMock.mock.calls[0][0].filter?.sector).toBe("fintech");
  });

  it("defaults filter.stage to 'all' when omitted (dropping the `== null` short-circuit would make Number(null)===0 and blank every non-Concept row)", async () => {
    await callGet();
    expect(computeListingsMock.mock.calls[0][0].filter?.stage).toBe("all");
  });

  it("passes filter.stage as literal 'all' when ?stage=all", async () => {
    await callGet("stage=all");
    expect(computeListingsMock.mock.calls[0][0].filter?.stage).toBe("all");
  });

  it("coerces ?stage=4 to the numeric 4 (aggregator .eq() dispatches on typeof number vs string)", async () => {
    await callGet("stage=4");
    expect(computeListingsMock.mock.calls[0][0].filter?.stage).toBe(4);
  });

  it("defaults filter.publicOnly to false when ?public_only is omitted", async () => {
    await callGet();
    expect(computeListingsMock.mock.calls[0][0].filter?.publicOnly).toBe(false);
  });

  it("filter.publicOnly is true only for the exact string 'true' (?public_only=true)", async () => {
    await callGet("public_only=true");
    expect(computeListingsMock.mock.calls[0][0].filter?.publicOnly).toBe(true);
  });

  it("filter.publicOnly stays false for a truthy-looking '1' (partners must pass literal 'true')", async () => {
    await callGet("public_only=1");
    expect(computeListingsMock.mock.calls[0][0].filter?.publicOnly).toBe(false);
  });

  it("filter.publicOnly stays false for the string 'TRUE' — case-sensitive (dropping case-sensitivity would collide with partners passing 'True' meaning 'all rows')", async () => {
    await callGet("public_only=TRUE");
    expect(computeListingsMock.mock.calls[0][0].filter?.publicOnly).toBe(false);
  });

  it("defaults filter.revenueOnly to false when ?revenue_only is omitted", async () => {
    await callGet();
    expect(computeListingsMock.mock.calls[0][0].filter?.revenueOnly).toBe(false);
  });

  it("filter.revenueOnly is true only for the exact string 'true' (?revenue_only=true)", async () => {
    await callGet("revenue_only=true");
    expect(computeListingsMock.mock.calls[0][0].filter?.revenueOnly).toBe(true);
  });

  it("filter.revenueOnly stays false for the string 'yes'", async () => {
    await callGet("revenue_only=yes");
    expect(computeListingsMock.mock.calls[0][0].filter?.revenueOnly).toBe(false);
  });
});

// ─── query parsing: sort/order ───────────────────────────────────────────

describe("query parsing — sort / order", () => {
  it("defaults sort to 'svi' when ?sort is omitted (the /index/markets default column)", async () => {
    await callGet();
    expect(computeListingsMock.mock.calls[0][0].sort).toBe("svi");
  });

  it("passes sort verbatim from ?sort= for each of the 5 canonical keys (svi/delta/valuation/stage/recent)", async () => {
    for (const s of ["svi", "delta", "valuation", "stage", "recent"] as ListingSort[]) {
      computeListingsMock.mockClear();
      await callGet(`sort=${s}`);
      expect(computeListingsMock.mock.calls[0][0].sort).toBe(s);
    }
  });

  it("defaults order to 'desc' when ?order is omitted (the /index/markets column-header arrow defaults to down)", async () => {
    await callGet();
    expect(computeListingsMock.mock.calls[0][0].order).toBe("desc");
  });

  it("passes order verbatim from ?order=asc", async () => {
    await callGet("order=asc");
    expect(computeListingsMock.mock.calls[0][0].order).toBe("asc");
  });
});

// ─── query parsing: page / pageSize ──────────────────────────────────────

describe("query parsing — page / pageSize", () => {
  it("defaults page to 1 when ?page is omitted", async () => {
    await callGet();
    expect(computeListingsMock.mock.calls[0][0].page).toBe(1);
  });

  it("passes ?page=3 through as the number 3", async () => {
    await callGet("page=3");
    expect(computeListingsMock.mock.calls[0][0].page).toBe(3);
  });

  it("clamps page to 1 when a non-positive integer is supplied (?page=0 → 1, prevents an off-by-one window that duplicates row 1)", async () => {
    await callGet("page=0");
    expect(computeListingsMock.mock.calls[0][0].page).toBe(1);
  });

  it("clamps page to 1 when a negative integer is supplied (?page=-5 → 1)", async () => {
    await callGet("page=-5");
    expect(computeListingsMock.mock.calls[0][0].page).toBe(1);
  });

  it("defaults pageSize to 50 when ?pageSize is omitted", async () => {
    await callGet();
    expect(computeListingsMock.mock.calls[0][0].pageSize).toBe(50);
  });

  it("passes ?pageSize=25 through as the number 25", async () => {
    await callGet("pageSize=25");
    expect(computeListingsMock.mock.calls[0][0].pageSize).toBe(25);
  });

  it("clamps pageSize to a floor of 10 when a smaller number is supplied (?pageSize=5 → 10, prevents pathological 1-row-per-page pagination)", async () => {
    await callGet("pageSize=5");
    expect(computeListingsMock.mock.calls[0][0].pageSize).toBe(10);
  });

  it("clamps pageSize to a ceiling of 100 when a larger number is supplied (?pageSize=500 → 100, prevents a full-market pull down to a partner integration)", async () => {
    await callGet("pageSize=500");
    expect(computeListingsMock.mock.calls[0][0].pageSize).toBe(100);
  });
});

// ─── HTTP envelope ────────────────────────────────────────────────────────

describe("HTTP envelope", () => {
  it("returns 200", async () => {
    const { status } = await callGet();
    expect(status).toBe(200);
  });

  it("Content-Type is application/json", async () => {
    const { headers } = await callGet();
    expect(headers.get("Content-Type") ?? "").toMatch(/^application\/json/);
  });

  it("Cache-Control is 'public, s-maxage=300, stale-while-revalidate=600' — the exact string edge caches key on (dropping s-maxage would let the CDN cache indefinitely)", async () => {
    const { headers } = await callGet();
    expect(headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
  });

  it("body parses as a plain JSON object (not an array — some SDKs dispatch on array-vs-object)", async () => {
    const { body } = await callGet();
    expect(body).toBeTypeOf("object");
    expect(body).not.toBeNull();
    expect(Array.isArray(body)).toBe(false);
  });
});

// ─── envelope shape ───────────────────────────────────────────────────────

describe("envelope shape", () => {
  it("body.ok === true (partners dispatch on this discriminator — the whole public /api/* family ships it)", async () => {
    const { body } = await callGet();
    expect(body.ok).toBe(true);
  });

  it("spreads the ListingsResult payload at the top level, not nested under a 'result' key (SSR /index/markets destructures the flat shape)", async () => {
    const { body } = await callGet();
    expect(body.rows).toBeDefined();
    expect(body.total).toBeDefined();
    expect(body.page).toBeDefined();
    expect(body.pageSize).toBeDefined();
    expect(body.totalPages).toBeDefined();
    expect(body.generatedAt).toBeDefined();
    expect((body as unknown as { result?: unknown }).result).toBeUndefined();
  });

  it("preserves rows[] order verbatim (the aggregator has already applied sort+order — reversing here would flip every /index/markets column)", async () => {
    const { body } = await callGet();
    expect(body.rows.map((r) => r.ticker)).toEqual(["SAAS-ABC", "FINT-XYZ"]);
  });

  it("preserves per-row keys verbatim (ticker, slug, sector, stage, svi, valuationAud, publicName, publicVisible, hasRevenue)", async () => {
    const { body } = await callGet();
    const r = body.rows[0];
    expect(r.ticker).toBe("SAAS-ABC");
    expect(r.slug).toBe("acme-abc");
    expect(r.sector).toBe("saas");
    expect(r.stage).toBe(4);
    expect(r.svi).toBe(112);
    expect(r.valuationAud).toBe(12_500_000);
    expect(r.publicName).toBeNull();
    expect(r.publicVisible).toBe(false);
    expect(r.hasRevenue).toBe(true);
  });

  it("preserves the total, page, pageSize, totalPages, generatedAt scalars verbatim", async () => {
    computeListingsMock.mockResolvedValueOnce(
      fixtureResult({
        total: 217,
        page: 2,
        pageSize: 25,
        totalPages: 9,
        generatedAt: "2026-08-07T04:30:00.000Z",
      }),
    );
    const { body } = await callGet("page=2&pageSize=25");
    expect(body.total).toBe(217);
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(25);
    expect(body.totalPages).toBe(9);
    expect(body.generatedAt).toBe("2026-08-07T04:30:00.000Z");
  });
});

// ─── edge cases ──────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles an empty-market payload (zero rows) without crashing", async () => {
    computeListingsMock.mockResolvedValueOnce(
      fixtureResult({ rows: [], total: 0, totalPages: 0 }),
    );
    const { status, body } = await callGet();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.rows).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("does not include a body.error key on the happy path (partners look for `!body.ok || body.error` — a stray null-valued error field is a hidden failure signal)", async () => {
    const { body } = await callGet();
    expect((body as unknown as { error?: unknown }).error).toBeUndefined();
  });

  it("does not mutate the payload returned by the aggregator (aggregator results may be memoised — a shared reference would leak the `ok` envelope into cached copies)", async () => {
    const original = fixtureResult();
    computeListingsMock.mockResolvedValueOnce(original);
    await callGet();
    expect((original as unknown as { ok?: unknown }).ok).toBeUndefined();
  });

  it("returns a fresh Response object on each call (Next's route caching keys on identity in some code paths — reusing a Response is a subtle bug)", async () => {
    const a = await GET(makeReq());
    const b = await GET(makeReq());
    expect(a).not.toBe(b);
  });
});
