// Colocated vitest for /api/cron/sector-multiples-refresh (S27-C).
// Pins: Bearer CRON_SECRET gate (401 when unset or mismatched), 503 when the
// loop reports supabase_unavailable, `?dry=1` → dryRun:true + entries in the
// body and nothing inserted, and that GET and POST are the same handler.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("@/lib/valuation/multiples-refresh", () => ({
  refreshSectorMultiples: (opts: unknown) => refreshMock(opts),
}));

import { GET, POST, dynamic, maxDuration } from "./route";

const OK = {
  ok: true,
  dryRun: false,
  ranAt: "2026-10-01T03:00:00.000Z",
  sources: [{ id: "saas-capital-index", url: "https://www.saas-capital.com/the-saas-capital-index/", status: "proposed", textChars: 900, candidates: 1, accepted: 1, duplicates: 0, rejected: [] }],
  proposed: 1,
  duplicates: 0,
  entries: [{ sector: "saas", arr_low: 6.5, arr_mid: 7.4, arr_high: 8.2, status: "proposed", proposed_by: "cron" }],
};

function req(url = "http://localhost/api/cron/sector-multiples-refresh", auth?: string, method = "GET") {
  return new Request(url, { method, headers: auth ? { authorization: auth } : {} });
}

describe("sector-multiples-refresh route", () => {
  const origSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    refreshMock.mockReset();
    refreshMock.mockResolvedValue({ ...OK });
  });
  afterEach(() => {
    if (origSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = origSecret;
  });

  it("exports force-dynamic + 300 s maxDuration and POST === GET", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(300);
    expect(POST).toBe(GET);
  });

  it("401 without / with wrong bearer, and when CRON_SECRET is unset", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req(undefined, "Bearer nope"))).status).toBe(401);
    expect((await GET(req(undefined, "Bearer s3cret-x"))).status).toBe(401);
    expect((await GET(req(undefined, "bearer s3cret"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(401);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("live run: 200 with the per-source log, no entries in the body", async () => {
    const res = await POST(req(undefined, "Bearer s3cret", "POST"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(false);
    expect(body.proposed).toBe(1);
    expect(body.sources).toHaveLength(1);
    expect(body.entries).toBeUndefined();
    expect(typeof body.duration_ms).toBe("number");
    expect(refreshMock).toHaveBeenCalledWith({ dryRun: false });
  });

  it("?dry=1 → dryRun:true passed to the loop and the would-be proposals echoed", async () => {
    refreshMock.mockResolvedValue({ ...OK, dryRun: true });
    const res = await GET(req("http://localhost/api/cron/sector-multiples-refresh?dry=1", "Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.dryRun).toBe(true);
    expect(body.entries).toEqual(OK.entries);
    expect(refreshMock).toHaveBeenCalledWith({ dryRun: true });
  });

  it("503 when the loop reports supabase_unavailable; 500 on any other loop error", async () => {
    refreshMock.mockResolvedValue({ ...OK, ok: false, error: "supabase_unavailable" });
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(503);
    refreshMock.mockResolvedValue({ ...OK, ok: false, error: "boom" });
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe("boom");
  });
});
