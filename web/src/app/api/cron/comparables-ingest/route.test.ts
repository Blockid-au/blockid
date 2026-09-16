// Colocated vitest for /api/cron/comparables-ingest (S-R5): cron auth,
// ?dry=1 → write:false, the service-role client is handed to the runner,
// 503 without Supabase, 500 when the runner reports a DB failure.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ run: vi.fn(), getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/valuation/comparables-ingest", () => ({ runComparablesIngest: (opts: unknown, deps: unknown) => mocks.run(opts, deps) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));

import { GET, POST, dynamic } from "./route";

const ROW = {
  name: "Weebit Nano",
  round_date: "2026-09-16",
  stage: "growth",
  sector: "Unclassified",
  amount_aud: 40_000_000,
  source_name: "asx",
  confidence: 0.8,
  source_url: "https://www.asx.com.au/x",
  source_excerpt: "…",
  note: null,
  currency: "AUD",
  round_label: "Placement",
  source_date: "2026-09-16",
};
const OK = { ok: true, dryRun: false, ranAt: "2026-09-16T10:00:00.000Z", sources: [{ id: "asx", status: "ok", pages: 1, candidates: 1 }], candidates: 1, duplicates: 0, inserted: 1, rows: [ROW] };
const DB = { from: () => ({}) };

function req(url = "http://localhost/api/cron/comparables-ingest", auth?: string) {
  return new Request(url, { headers: auth ? { authorization: auth } : {} });
}

describe("comparables-ingest cron route", () => {
  const origSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    mocks.run.mockReset().mockResolvedValue({ ...OK });
    mocks.getSupabaseAdmin.mockReset().mockReturnValue(DB);
  });
  afterEach(() => {
    if (origSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = origSecret;
  });

  it("exports force-dynamic and POST === GET", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(POST).toBe(GET);
  });

  it("401 without / with wrong bearer, and when CRON_SECRET is unset", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req(undefined, "Bearer nope"))).status).toBe(401);
    expect((await GET(req(undefined, "s3cret"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("503 when Supabase is not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(503);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("writes by default: runner gets write:true + the service-role client; summary + duration_ms returned, rows trimmed", async () => {
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({ write: true }, { db: DB });
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, inserted: 1, candidates: 1 });
    expect(typeof body.duration_ms).toBe("number");
    expect(body.rows[0]).toEqual({ name: "Weebit Nano", round_date: "2026-09-16", stage: "growth", sector: "Unclassified", amount_aud: 40_000_000, source_name: "asx", confidence: 0.8 });
  });

  it("?dry=1 passes write:false", async () => {
    mocks.run.mockResolvedValue({ ...OK, dryRun: true, inserted: 0 });
    const res = await GET(req("http://localhost/api/cron/comparables-ingest?dry=1", "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({ write: false }, { db: DB });
    expect((await res.json()).dryRun).toBe(true);
  });

  it("500 when the runner reports a DB failure", async () => {
    mocks.run.mockResolvedValue({ ...OK, ok: false, error: "permission denied", inserted: 0 });
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("permission denied");
  });
});
