// Colocated vitest for /api/cron/privacy-retention (S15-A).
// Pins: Bearer CRON_SECRET gate (401 when unset or mismatched), 503 when the
// sweep reports supabase_unavailable, 500 on a rule failure, `?dry=1` →
// dryRun:true passed through with per-rule counts returned, `?limit=N`
// forwarded, force-dynamic, and GET === POST (cron-runner.sh POSTs).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sweepMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/privacy/retention", () => ({
  runRetentionSweep: (opts: unknown) => sweepMock(opts),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));

import { GET, POST, dynamic, maxDuration } from "./route";

const RULE = {
  rule: "guest_funding_reports",
  table: "funding_reports",
  column: "created_at",
  days: 365,
  mode: "anonymise",
  cutoff: "2025-09-14T03:15:00.000Z",
  candidates: 3,
  protected: 0,
  affected: 3,
  would_affect: 3,
  more: false,
  batch_limit: 500,
  dry_run: false,
};
const OK = { ok: true, dryRun: false, now: "2026-09-14T03:15:00.000Z", rules: [RULE], affected_total: 3, protected_total: 0 };

function req(url = "http://localhost/api/cron/privacy-retention", auth?: string) {
  return new Request(url, { headers: auth ? { authorization: auth } : {} });
}

describe("privacy-retention route", () => {
  const origSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    sweepMock.mockReset().mockResolvedValue({ ...OK });
  });
  afterEach(() => {
    if (origSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = origSecret;
  });

  it("exports force-dynamic, a 300 s budget, and POST === GET", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(300);
    expect(POST).toBe(GET);
  });

  it("401 without / with wrong bearer, and when CRON_SECRET is unset", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req(undefined, "Bearer nope"))).status).toBe(401);
    expect((await GET(req(undefined, "Bearer s3cre"))).status).toBe(401);
    expect((await GET(req(undefined, "Bearer s3cretX"))).status).toBe(401);
    expect((await GET(req(undefined, "s3cret"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(401);
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("runs the sweep (dryRun false, default limit) and returns its summary with duration_ms", async () => {
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, affected_total: 3, rules: [{ rule: "guest_funding_reports", affected: 3 }] });
    expect(typeof body.duration_ms).toBe("number");
    expect(sweepMock).toHaveBeenCalledTimes(1);
    const opts = sweepMock.mock.calls[0][0] as { db: unknown; dryRun: boolean; limit: number | undefined };
    expect(opts.dryRun).toBe(false);
    expect(opts.limit).toBeUndefined();
    expect(opts.db).toBeTruthy();
  });

  it("?dry=1 passes dryRun:true through and returns the per-rule counts", async () => {
    sweepMock.mockResolvedValueOnce({ ...OK, dryRun: true, rules: [{ ...RULE, affected: 0, would_affect: 3, dry_run: true }], affected_total: 0 });
    const res = await GET(req("http://localhost/api/cron/privacy-retention?dry=1", "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ dryRun: true, affected_total: 0, rules: [{ would_affect: 3, affected: 0, dry_run: true }] });
    expect((sweepMock.mock.calls[0][0] as { dryRun: boolean }).dryRun).toBe(true);
  });

  it("?limit=N is forwarded (the sweep clamps it)", async () => {
    await GET(req("http://localhost/api/cron/privacy-retention?limit=25", "Bearer s3cret"));
    expect((sweepMock.mock.calls[0][0] as { limit: number }).limit).toBe(25);
    await GET(req("http://localhost/api/cron/privacy-retention?limit=abc", "Bearer s3cret"));
    expect((sweepMock.mock.calls[1][0] as { limit: number | undefined }).limit).toBeUndefined();
  });

  it("503 on supabase_unavailable, 500 on a rule failure (summary still returned)", async () => {
    sweepMock.mockResolvedValueOnce({ ...OK, ok: false, error: "supabase_unavailable", rules: [] });
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(503);
    sweepMock.mockResolvedValueOnce({ ...OK, ok: false, error: "retention_rule_failed", rules: [{ ...RULE, error: "boom" }] });
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, error: "retention_rule_failed", rules: [{ error: "boom" }] });
  });
});
