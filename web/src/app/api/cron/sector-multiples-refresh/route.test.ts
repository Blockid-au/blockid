// Colocated vitest for /api/cron/sector-multiples-refresh (S27-C).
// Pins: Bearer CRON_SECRET gate (401 when unset or mismatched), 503 when the
// loop reports supabase_unavailable, `?dry=1` → fetch-only dryRun + entries in the
// body and nothing inserted, and that GET and POST are the same handler.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("@/lib/valuation/multiples-refresh", () => ({
  refreshSectorMultiples: (opts: unknown) => refreshMock(opts),
}));

import { GET, POST, dynamic, maxDuration, refreshModeFor } from "./route";

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
    expect(refreshMock).toHaveBeenCalledWith({ dryRun: false, fetchOnly: false });
  });

  it("S29-hardening: ?dry=1 is FETCH-ONLY (no model); ?dry=1&extract=1 runs the model with no writes; the would-be proposals are echoed on both", async () => {
    refreshMock.mockResolvedValue({ ...OK, dryRun: true, fetchOnly: true, proposed: 0, entries: [], sources: [{ ...OK.sources[0], status: "fetched", candidates: 0, accepted: 0 }] });
    const res = await GET(req("http://localhost/api/cron/sector-multiples-refresh?dry=1", "Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ dryRun: true, fetchOnly: true, entries: [] });
    expect((body.sources as Array<{ status: string }>)[0].status).toBe("fetched");
    expect(refreshMock).toHaveBeenCalledWith({ dryRun: true, fetchOnly: true });

    refreshMock.mockResolvedValue({ ...OK, dryRun: true, fetchOnly: false });
    const full = await GET(req("http://localhost/api/cron/sector-multiples-refresh?dry=1&extract=1", "Bearer s3cret"));
    const fb = (await full.json()) as Record<string, unknown>;
    expect(fb.dryRun).toBe(true);
    expect(fb.entries).toEqual(OK.entries);
    expect(refreshMock).toHaveBeenCalledWith({ dryRun: true, fetchOnly: false });

    // The explicit spelling wins over extract; extract without dry is a live run.
    expect(refreshModeFor(req("http://localhost/x?dry=1&fetchOnly=1&extract=1"))).toEqual({ dryRun: true, fetchOnly: true });
    expect(refreshModeFor(req("http://localhost/x?dry=true"))).toEqual({ dryRun: true, fetchOnly: true });
    expect(refreshModeFor(req("http://localhost/x?extract=1"))).toEqual({ dryRun: false, fetchOnly: false });
    expect(refreshModeFor(req("http://localhost/x"))).toEqual({ dryRun: false, fetchOnly: false });
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
