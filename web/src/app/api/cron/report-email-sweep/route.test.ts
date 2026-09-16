// Colocated vitest for /api/cron/report-email-sweep (S-R5): cron auth,
// ?dry=1, the sweep summary, 503 without Supabase, 500 on a failed sweep.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ sweep: vi.fn(), getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/svi/email-queue", () => ({ sweepReportEmails: (db: unknown, opts: unknown, deps: unknown) => mocks.sweep(db, opts, deps) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));

import { GET, POST, dynamic } from "./route";

const OK = { ok: true, dryRun: false, candidates: 1, sent: ["s1"], skipped: [], failed: [] };
const DB = { from: () => ({}) };

function req(url = "http://localhost/api/cron/report-email-sweep", auth?: string) {
  return new Request(url, { headers: auth ? { authorization: auth } : {} });
}

describe("report-email-sweep cron route", () => {
  const origSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    mocks.sweep.mockReset().mockResolvedValue({ ...OK });
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
    delete process.env.CRON_SECRET;
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(401);
    expect(mocks.sweep).not.toHaveBeenCalled();
  });

  it("503 without Supabase; runs the sweep with the client + base URL; ?dry=1 → dryRun", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(503);
    mocks.getSupabaseAdmin.mockReturnValue(DB);
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(mocks.sweep).toHaveBeenCalledWith(DB, { dryRun: false }, { baseUrl: "http://localhost" });
    expect(await res.json()).toMatchObject({ ok: true, sent: ["s1"] });
    await GET(req("http://localhost/api/cron/report-email-sweep?dry=1", "Bearer s3cret"));
    expect(mocks.sweep).toHaveBeenLastCalledWith(DB, { dryRun: true }, expect.anything());
  });

  it("500 when the sweep fails; not_migrated stays 200", async () => {
    mocks.sweep.mockResolvedValue({ ...OK, ok: false, error: "boom" });
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(500);
    mocks.sweep.mockResolvedValue({ ...OK, ok: true, error: "not_migrated", candidates: 0, sent: [] });
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect((await res.json()).error).toBe("not_migrated");
  });
});
