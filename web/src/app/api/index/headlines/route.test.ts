// Colocated vitest for GET /api/index/headlines — P9-index-headlines-route-test.
//
// This route is the ONLY public snapshot of the BlockID Startup Value Index
// (BSI-AU). It is SSR'd by the /index landing page and consumed by external
// partner dashboards. Silent regressions this pins:
//   - flipping `export const dynamic` off "force-dynamic" so Next serves a
//     stale prerender when the underlying svi_analyses rows have already moved
//     (BSI-AU is a rolling 90-day median — a stale prerender misprices the
//     entire market snapshot on the landing page).
//   - dropping `export const revalidate = 300` so the CDN loses its 5-minute
//     TTL contract with the SSR page (the /index page reads this constant to
//     align its own revalidate cadence — flipping it decouples the two).
//   - dropping the "Cache-Control: public, s-maxage=300, stale-while-revalidate=600"
//     header so edge caches thrash the route on every partner refresh (the
//     aggregator does a full 5000-row Supabase scan; each miss is expensive).
//   - dropping the `ok: true` envelope so partners lose the standard success
//     discriminator every other public /api/* route ships.
//   - dropping the object-spread of the headlines payload so top-level keys
//     (bsiAu, sectorIndices, stageIndices, topMovers, generatedAt, citation)
//     move under a nested "headlines" key — the SSR page destructures the
//     flat shape and will render blank sparklines.
//   - changing the aggregator window argument from 90 days to something else
//     without a corresponding CHANGELOG note — the "BSI-AU as of ..." citation
//     line printed on /index would silently drift.
//
// The test mocks the aggregator (which itself needs Supabase) so it stays a
// pure route contract test — the aggregator's own logic is exercised by its
// colocated startup-index-aggregator.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexHeadlines } from "@/lib/startup-index-aggregator";

// --- Mocks ------------------------------------------------------------------

const computeIndexHeadlinesMock =
  vi.fn<(windowDays?: number) => Promise<IndexHeadlines>>();

vi.mock("@/lib/startup-index-aggregator", () => ({
  computeIndexHeadlines: (windowDays?: number) =>
    computeIndexHeadlinesMock(windowDays),
}));

// Route import must come AFTER the mocks are registered.
import { GET, dynamic, revalidate } from "./route";

// --- Helpers ----------------------------------------------------------------

function fixtureHeadlines(overrides: Partial<IndexHeadlines> = {}): IndexHeadlines {
  return {
    bsiAu: {
      value: 105,
      deltaDay: 1,
      deltaWeek: 3,
      sparkline7d: [102, 103, 104, 103, 105, 104, 105],
      totalCompanies: 138,
      totalCoverageAud: 1_234_567_890,
      analysesToday: 7,
      analysesYesterday: 12,
    },
    sectorIndices: [
      { sector: "saas", label: "SaaS", emoji: "📊", value: 108, deltaWeek: 2, count: 42 },
      { sector: "fintech", label: "Fintech", emoji: "💳", value: 101, deltaWeek: -1, count: 21 },
    ],
    stageIndices: [
      { stage: 0, label: "Concept", value: 95, count: 30 },
      { stage: 4, label: "Revenue", value: 118, count: 12 },
    ],
    topMovers: {
      winners: [{ ticker: "SAAS-ABC", slug: "abc", sector: "saas", svi: 112, deltaWeek: 8 }],
      losers: [{ ticker: "FINT-XYZ", slug: "xyz", sector: "fintech", svi: 90, deltaWeek: -6 }],
    },
    generatedAt: "2026-08-07T00:00:00.000Z",
    citation: "BSI-AU as of 2026-08-07: 105 (n=138 companies, window=90d)",
    ...overrides,
  };
}

async function callGet(): Promise<{
  status: number;
  headers: Headers;
  body: { ok: boolean } & IndexHeadlines;
}> {
  const res = await GET();
  const body = (await res.json()) as { ok: boolean } & IndexHeadlines;
  return { status: res.status, headers: res.headers, body };
}

// --- Setup ------------------------------------------------------------------

beforeEach(() => {
  computeIndexHeadlinesMock.mockReset();
  computeIndexHeadlinesMock.mockResolvedValue(fixtureHeadlines());
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── module invariants ────────────────────────────────────────────────────

describe("module invariants", () => {
  it("dynamic is force-dynamic (the underlying svi_analyses rows change every minute; a stale prerender would misprice the entire /index landing page)", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("revalidate is exactly 300 seconds (SSR /index reads this constant to align its cache TTL — flipping it decouples the two surfaces)", () => {
    expect(revalidate).toBe(300);
  });

  it("GET is an async function (Next 15 route handlers must return a Promise so streaming/SSR works)", () => {
    expect(typeof GET).toBe("function");
    // Not strict "async function" because transpilers wrap it, but the return
    // must be a thenable — call it and check.
    const ret = GET();
    expect(typeof (ret as unknown as { then?: unknown }).then).toBe("function");
  });
});

// ─── aggregator contract ─────────────────────────────────────────────────

describe("aggregator contract", () => {
  it("invokes computeIndexHeadlines exactly once per request (no accidental double-fetch that would double the Supabase scan cost)", async () => {
    await callGet();
    expect(computeIndexHeadlinesMock).toHaveBeenCalledTimes(1);
  });

  it("passes windowDays=90 to the aggregator (the citation line printed on /index reads 'window=90d' — changing this drifts the on-screen number)", async () => {
    await callGet();
    expect(computeIndexHeadlinesMock).toHaveBeenCalledWith(90);
  });

  it("does not pass any second argument (the aggregator's signature is (windowDays) only; a stray arg would show up as an unused-var lint after future refactors)", async () => {
    await callGet();
    const firstCall = computeIndexHeadlinesMock.mock.calls[0];
    expect(firstCall.length).toBe(1);
  });

  it("propagates aggregator rejection (the route intentionally has NO try/catch — Next's error boundary handles it; if someone silently wraps it the /index page will render fake zeros instead of 500ing)", async () => {
    computeIndexHeadlinesMock.mockRejectedValueOnce(new Error("db down"));
    await expect(GET()).rejects.toThrow("db down");
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

  it("spreads the headlines payload at the top level, not nested under a 'headlines' key (SSR /index destructures the flat shape)", async () => {
    const { body } = await callGet();
    expect(body.bsiAu).toBeDefined();
    expect(body.sectorIndices).toBeDefined();
    expect(body.stageIndices).toBeDefined();
    expect(body.topMovers).toBeDefined();
    expect(body.generatedAt).toBeDefined();
    expect(body.citation).toBeDefined();
    expect((body as unknown as { headlines?: unknown }).headlines).toBeUndefined();
  });

  it("preserves the bsiAu block verbatim (value, deltaDay, deltaWeek, sparkline7d, totalCompanies, totalCoverageAud, analysesToday, analysesYesterday)", async () => {
    const { body } = await callGet();
    expect(body.bsiAu.value).toBe(105);
    expect(body.bsiAu.deltaDay).toBe(1);
    expect(body.bsiAu.deltaWeek).toBe(3);
    expect(body.bsiAu.sparkline7d).toEqual([102, 103, 104, 103, 105, 104, 105]);
    expect(body.bsiAu.totalCompanies).toBe(138);
    expect(body.bsiAu.totalCoverageAud).toBe(1_234_567_890);
    expect(body.bsiAu.analysesToday).toBe(7);
    expect(body.bsiAu.analysesYesterday).toBe(12);
  });

  it("preserves sectorIndices order and shape (SSR renders them in the order returned; the aggregator already sorted by count desc)", async () => {
    const { body } = await callGet();
    expect(body.sectorIndices).toHaveLength(2);
    expect(body.sectorIndices[0].sector).toBe("saas");
    expect(body.sectorIndices[0].emoji).toBe("📊");
    expect(body.sectorIndices[1].sector).toBe("fintech");
  });

  it("preserves stageIndices order (the aggregator sorts by stage asc; flipping order would show Revenue before Concept on /index)", async () => {
    const { body } = await callGet();
    expect(body.stageIndices.map((s) => s.stage)).toEqual([0, 4]);
  });

  it("preserves topMovers.winners and topMovers.losers arrays (SSR renders both — dropping one silently blanks half the table)", async () => {
    const { body } = await callGet();
    expect(body.topMovers.winners[0].ticker).toBe("SAAS-ABC");
    expect(body.topMovers.losers[0].ticker).toBe("FINT-XYZ");
  });

  it("preserves the citation string verbatim (the AFSL-adjacent 'general information' block on /index cites this literally)", async () => {
    const { body } = await callGet();
    expect(body.citation).toBe(
      "BSI-AU as of 2026-08-07: 105 (n=138 companies, window=90d)",
    );
  });

  it("preserves the generatedAt ISO string (used by /index to render 'Last updated ...' — dropping it would show 'Last updated Invalid Date')", async () => {
    const { body } = await callGet();
    expect(body.generatedAt).toBe("2026-08-07T00:00:00.000Z");
  });
});

// ─── edge cases ──────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles an empty-market payload (zero companies) without crashing — the aggregator returns zeros; the route must forward them so /index can render the 'no data yet' state", async () => {
    computeIndexHeadlinesMock.mockResolvedValueOnce(
      fixtureHeadlines({
        bsiAu: {
          value: 0,
          deltaDay: 0,
          deltaWeek: 0,
          sparkline7d: [0, 0, 0, 0, 0, 0, 0],
          totalCompanies: 0,
          totalCoverageAud: 0,
          analysesToday: 0,
          analysesYesterday: 0,
        },
        sectorIndices: [],
        stageIndices: [],
        topMovers: { winners: [], losers: [] },
      }),
    );
    const { status, body } = await callGet();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.bsiAu.totalCompanies).toBe(0);
    expect(body.sectorIndices).toEqual([]);
    expect(body.topMovers.winners).toEqual([]);
  });

  it("does not include a body.error key on the happy path (partners look for `!body.ok || body.error` — a stray null-valued error field is a hidden failure signal)", async () => {
    const { body } = await callGet();
    expect((body as unknown as { error?: unknown }).error).toBeUndefined();
  });

  it("does not mutate the payload returned by the aggregator (the aggregator caches results in-process for later ticks; a shared reference would leak the `ok` envelope into cached copies)", async () => {
    const original = fixtureHeadlines();
    computeIndexHeadlinesMock.mockResolvedValueOnce(original);
    await callGet();
    expect((original as unknown as { ok?: unknown }).ok).toBeUndefined();
  });

  it("returns a fresh response object on each call (Next's route caching keys on identity in some code paths — reusing a Response is a subtle bug)", async () => {
    const a = await GET();
    const b = await GET();
    expect(a).not.toBe(b);
  });

  it("Cache-Control header survives a second call unchanged (defensive check against a future 'if (isFirstCall)' branch that would let the second call get an implicit no-store)", async () => {
    const a = await GET();
    const b = await GET();
    expect(a.headers.get("Cache-Control")).toBe(b.headers.get("Cache-Control"));
    expect(a.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
  });
});
