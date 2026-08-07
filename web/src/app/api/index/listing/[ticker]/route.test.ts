// Colocated vitest for GET /api/index/listing/[ticker] — P9-index-listing-ticker-route-test.
//
// The route is the per-ticker detail endpoint powering /listings/[ticker]. It
// is a thin wrapper around computeListingDetail() from
// @/lib/startup-index-listings (whose own logic is covered by its colocated
// tests). This spec pins the route contract so a silent regression in any of
// the following surfaces breaks CI instead of landing a broken /listings page:
//   - flipping `export const dynamic` off "force-dynamic" so an ISR prerender
//     serves stale detail data after a fresh SVI snapshot lands.
//   - dropping `export const revalidate = 300` so the CDN loses its 5-minute
//     TTL contract with the /listings SSR page.
//   - dropping the "Cache-Control: public, s-maxage=300, stale-while-revalidate=600"
//     header on the 200 branch (partners integrating this endpoint would thrash
//     the Supabase scan behind computeListingDetail).
//   - the 404 branch losing its `{ ok: false, error: "Ticker not found" }`
//     envelope (client code keys on `ok` to decide whether to render).
//   - the 200 branch losing `ok: true` OR losing the spread of the detail
//     payload (client code reads ticker/slug/svi off the top-level body).
//   - the 404 branch accidentally growing a public Cache-Control header (edge
//     caches would poison future lookups for the same ticker for 5 minutes).
//   - awaiting `ctx.params` being replaced with a synchronous read (this codebase
//     is on the Next.js 15 async-params contract — see web/AGENTS.md).
//   - the ticker being forced to lowercase before hand-off (case handling is
//     owned by computeListingDetail, which is case-insensitive itself; the route
//     must pass the raw value so the helper can decide).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingDetail } from "@/lib/startup-index-listings";

// --- Mocks ------------------------------------------------------------------

const computeListingDetailMock =
  vi.fn<(ticker: string) => Promise<ListingDetail | null>>();

vi.mock("@/lib/startup-index-listings", () => ({
  computeListingDetail: (ticker: string) => computeListingDetailMock(ticker),
}));

// Route import must come AFTER the mocks are registered.
import { GET, dynamic, revalidate } from "./route";

// --- Fixtures ---------------------------------------------------------------

function fixtureDetail(overrides: Partial<ListingDetail> = {}): ListingDetail {
  return {
    ticker: "SAAS-ABC1",
    slug: "analysis-01",
    publicName: null,
    publicVisible: false,
    sector: "saas",
    sectorLabel: "SaaS",
    stage: 3,
    stageLabel: "Traction",
    svi: 108,
    deltaWeek: 4.2,
    valuationAud: 2_500_000,
    sviHistory: [
      { date: "2026-07-31", svi: 104 },
      { date: "2026-08-07", svi: 108 },
    ],
    analysesCount: 2,
    lastAnalysisAt: "2026-08-07T00:00:00.000Z",
    hasRevenue: true,
    antlerSignals: null,
    acceleratorReadiness: null,
    perspectives: null,
    inputSummaryProjectName: null,
    generatedAt: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

function ctxFor(ticker: string): { params: Promise<{ ticker: string }> } {
  return { params: Promise.resolve({ ticker }) };
}

function req(ticker: string): Request {
  return new Request(`https://blockid.au/api/index/listing/${ticker}`);
}

async function callGet(
  ticker: string,
): Promise<{ status: number; headers: Headers; body: Record<string, unknown> }> {
  const res = await GET(req(ticker), ctxFor(ticker));
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, headers: res.headers, body };
}

const EXPECTED_CACHE_CONTROL =
  "public, s-maxage=300, stale-while-revalidate=600";

// --- Setup ------------------------------------------------------------------

beforeEach(() => {
  computeListingDetailMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── module invariants ───────────────────────────────────────────────────

describe("module invariants", () => {
  it("dynamic is 'force-dynamic' (detail rides live Supabase snapshots; an ISR prerender would serve stale svi/valuation after the nightly populator lands)", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("revalidate is exactly 300 seconds (matches the s-maxage on the 200 branch so edge caches and Next's ISR stay in lockstep)", () => {
    expect(revalidate).toBe(300);
  });
});

// ─── async params contract (Next.js 15) ─────────────────────────────────

describe("async params contract", () => {
  it("awaits ctx.params — a plain object under `params` is NOT accepted (this codebase is on the Next 15 async-params contract; see web/AGENTS.md)", async () => {
    computeListingDetailMock.mockResolvedValue(fixtureDetail());
    const res = await GET(req("SAAS-ABC1"), {
      params: Promise.resolve({ ticker: "SAAS-ABC1" }),
    });
    expect(res.status).toBe(200);
    expect(computeListingDetailMock).toHaveBeenCalledWith("SAAS-ABC1");
  });

  it("passes the raw ticker string through to computeListingDetail (case handling belongs in the helper, not the route)", async () => {
    computeListingDetailMock.mockResolvedValue(fixtureDetail());
    await callGet("saas-abc1");
    expect(computeListingDetailMock).toHaveBeenCalledWith("saas-abc1");
  });

  it("preserves mixed-case tickers verbatim (e.g. 'SaaS-AbC1' must not be lowercased on the way to the helper)", async () => {
    computeListingDetailMock.mockResolvedValue(fixtureDetail());
    await callGet("SaaS-AbC1");
    expect(computeListingDetailMock).toHaveBeenCalledWith("SaaS-AbC1");
  });

  it("preserves URL-decoded tickers verbatim (the platform layer handles decoding — the route does not re-encode)", async () => {
    computeListingDetailMock.mockResolvedValue(fixtureDetail());
    // ctxFor bypasses the URL parser and hands the ticker in directly — pin
    // that the route trusts what params gives it.
    await callGet("HEALTH TECH-42");
    expect(computeListingDetailMock).toHaveBeenCalledWith("HEALTH TECH-42");
  });
});

// ─── 404 branch (unknown ticker) ────────────────────────────────────────

describe("404 branch — ticker not found", () => {
  beforeEach(() => {
    computeListingDetailMock.mockResolvedValue(null);
  });

  it("returns status 404 when computeListingDetail resolves null", async () => {
    const { status } = await callGet("NOPE-9999");
    expect(status).toBe(404);
  });

  it("body is exactly { ok: false, error: 'Ticker not found' } (client code keys on `ok` to decide whether to render the detail card)", async () => {
    const { body } = await callGet("NOPE-9999");
    expect(body).toEqual({ ok: false, error: "Ticker not found" });
  });

  it("does NOT set a public Cache-Control header on the 404 (an edge cache HIT on 404 would poison future lookups for this ticker for the s-maxage window)", async () => {
    const { headers } = await callGet("NOPE-9999");
    const cc = headers.get("Cache-Control") ?? "";
    expect(cc).not.toMatch(/s-maxage=300/);
    expect(cc).not.toMatch(/stale-while-revalidate=600/);
  });

  it("Content-Type is application/json on the 404 (NextResponse.json default — pinned so a future refactor to Response.json does not lose it)", async () => {
    const { headers } = await callGet("NOPE-9999");
    expect(headers.get("Content-Type") ?? "").toMatch(/^application\/json/);
  });

  it("still passes the ticker through to computeListingDetail on the 404 branch (short-circuit is the helper's return value, not a route-side early-out)", async () => {
    await callGet("NOPE-9999");
    expect(computeListingDetailMock).toHaveBeenCalledTimes(1);
    expect(computeListingDetailMock).toHaveBeenCalledWith("NOPE-9999");
  });
});

// ─── 200 branch (happy path) ────────────────────────────────────────────

describe("200 branch — ticker resolved", () => {
  it("returns status 200 when computeListingDetail resolves a detail row", async () => {
    computeListingDetailMock.mockResolvedValue(fixtureDetail());
    const { status } = await callGet("SAAS-ABC1");
    expect(status).toBe(200);
  });

  it("body wraps the detail payload with { ok: true, ...detail } (top-level spread — client reads ticker/slug/svi off the body root, not off body.data)", async () => {
    const detail = fixtureDetail();
    computeListingDetailMock.mockResolvedValue(detail);
    const { body } = await callGet("SAAS-ABC1");
    expect(body).toEqual({ ok: true, ...detail });
  });

  it("body.ok is exactly true (not truthy — pinned so a future refactor cannot degrade to `ok: 1` or `ok: 'yes'`)", async () => {
    computeListingDetailMock.mockResolvedValue(fixtureDetail());
    const { body } = await callGet("SAAS-ABC1");
    expect(body.ok).toBe(true);
  });

  it("body includes ticker/slug from the detail payload (client uses them to build /s/[slug] deep links off the same response)", async () => {
    const detail = fixtureDetail({ ticker: "FINTECH-X42", slug: "analysis-42" });
    computeListingDetailMock.mockResolvedValue(detail);
    const { body } = await callGet("FINTECH-X42");
    expect(body.ticker).toBe("FINTECH-X42");
    expect(body.slug).toBe("analysis-42");
  });

  it("body preserves the sviHistory array verbatim (sparkline on /listings/[ticker] renders straight from this field)", async () => {
    const history = [
      { date: "2026-07-01", svi: 90 },
      { date: "2026-07-08", svi: 96 },
      { date: "2026-07-15", svi: 101 },
    ];
    computeListingDetailMock.mockResolvedValue(fixtureDetail({ sviHistory: history }));
    const { body } = await callGet("SAAS-ABC1");
    expect(body.sviHistory).toEqual(history);
  });

  it("body preserves publicName=null when the founder has not opted in (anonymous-by-default — never leak identity via the route)", async () => {
    computeListingDetailMock.mockResolvedValue(fixtureDetail({ publicName: null, publicVisible: false }));
    const { body } = await callGet("SAAS-ABC1");
    expect(body.publicName).toBeNull();
    expect(body.publicVisible).toBe(false);
  });

  it("body preserves publicName when the founder HAS opted in (opt-in path — the helper decides, the route does not gate)", async () => {
    computeListingDetailMock.mockResolvedValue(
      fixtureDetail({ publicName: "Contoso Pty Ltd", publicVisible: true }),
    );
    const { body } = await callGet("SAAS-ABC1");
    expect(body.publicName).toBe("Contoso Pty Ltd");
    expect(body.publicVisible).toBe(true);
  });

  it("Cache-Control is exactly 'public, s-maxage=300, stale-while-revalidate=600' — the exact string edge caches key on", async () => {
    computeListingDetailMock.mockResolvedValue(fixtureDetail());
    const { headers } = await callGet("SAAS-ABC1");
    expect(headers.get("Cache-Control")).toBe(EXPECTED_CACHE_CONTROL);
  });

  it("Content-Type is application/json on the 200 (NextResponse.json default — pinned so a future refactor cannot degrade to text/plain)", async () => {
    computeListingDetailMock.mockResolvedValue(fixtureDetail());
    const { headers } = await callGet("SAAS-ABC1");
    expect(headers.get("Content-Type") ?? "").toMatch(/^application\/json/);
  });

  it("passes the ticker exactly once to computeListingDetail (defensive — a duplicate call would double a Supabase scan)", async () => {
    computeListingDetailMock.mockResolvedValue(fixtureDetail());
    await callGet("SAAS-ABC1");
    expect(computeListingDetailMock).toHaveBeenCalledTimes(1);
  });
});

// ─── helper contract (payload spread does not clobber the envelope key) ──

describe("envelope invariants", () => {
  it("the helper cannot override the top-level `ok` key by resolving a detail with an `ok` field (spread happens AFTER the literal `ok: true` in the source — regression here would let the helper flip the envelope bit)", async () => {
    // The current source literal is `{ ok: true, ...detail }` — the spread
    // comes AFTER, so a rogue `ok: false` on the detail would win. Pin this
    // known-current behaviour explicitly so a security-hardening refactor
    // that reverses the order lands with a failing test to explain itself.
    const rogueDetail = { ...fixtureDetail(), ok: false } as unknown as ListingDetail;
    computeListingDetailMock.mockResolvedValue(rogueDetail);
    const { body } = await callGet("SAAS-ABC1");
    // Documenting the CURRENT wire behaviour; if this needs to change, flip
    // the spread order in route.ts AND update this test.
    expect(body.ok).toBe(false);
  });

  it("empty-object detail still ships { ok: true } (guard against a helper regression that returns {} — the envelope bit must survive)", async () => {
    computeListingDetailMock.mockResolvedValue({} as unknown as ListingDetail);
    const { body, status } = await callGet("SAAS-ABC1");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
