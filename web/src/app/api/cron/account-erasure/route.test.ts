// Colocated vitest for /api/cron/account-erasure (S24-B).
// Pins: Bearer CRON_SECRET gate (401), 503 without Supabase, `?dry=1` passes
// dryRun through, only accounts past the 7-day grace are erased (actor
// "cron"), one failure → 500 with per-account errors and the rest still
// processed, `?limit` clamped, POST === GET, force-dynamic.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  due: [] as { id: string; deletion_requested_at: string }[],
  listArgs: [] as unknown[],
  erase: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.db }));
vi.mock("@/lib/privacy/deletion-request", async () => {
  const real = await vi.importActual<typeof import("@/lib/privacy/deletion-request")>("@/lib/privacy/deletion-request");
  return {
    ...real,
    listDueForErasure: async (_db: unknown, now: Date, limit: number) => {
      mocks.listArgs.push({ now, limit });
      return mocks.due;
    },
  };
});
vi.mock("@/lib/privacy/erase-account", () => ({ eraseAccount: (id: string, o: unknown) => mocks.erase(id, o) }));

import { GET, POST, dynamic, maxDuration } from "./route";

function req(qs = "", auth?: string) {
  return new Request(`http://localhost/api/cron/account-erasure${qs}`, { headers: auth ? { authorization: auth } : {} });
}

describe("account-erasure cron", () => {
  const orig = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    mocks.db = { from: () => ({}) };
    mocks.due = [
      { id: "a", deletion_requested_at: "2026-09-01T00:00:00Z" },
      { id: "b", deletion_requested_at: "2026-09-02T00:00:00Z" },
    ];
    mocks.listArgs = [];
    mocks.erase.mockReset().mockImplementation(async (id: string, o: { dryRun: boolean }) => ({
      ok: id !== "b",
      dryRun: o.dryRun,
      userId: id,
      alreadyErased: false,
      error: id === "b" ? "stripe_failed" : undefined,
      report: { totals: { delete: 2, anonymise: 1, detach: 0, detach_project: 0, extras: 0 } },
      stripe: { customer: true, subscriptions_cancelled: 1, payment_methods_detached: 0, customer_minimised: true, errors: [] },
      storage: { bucket: "dataroom", requested: 0, removed: 0, errors: [] },
      audit_id: "1",
      duration_ms: 1,
    }));
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = orig;
  });

  it("exports force-dynamic, 300 s budget, POST === GET", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(300);
    expect(POST).toBe(GET);
  });

  it("401 without / wrong bearer and when CRON_SECRET is unset; 503 without Supabase", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("", "Bearer nope"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req("", "Bearer s3cret"))).status).toBe(401);
    process.env.CRON_SECRET = "s3cret";
    mocks.db = null;
    expect((await GET(req("", "Bearer s3cret"))).status).toBe(503);
    expect(mocks.erase).not.toHaveBeenCalled();
  });

  it("erases every due account as actor cron; a failure → 500 but the others are still processed", async () => {
    const res = await GET(req("", "Bearer s3cret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, dryRun: false, graceDays: 7, due: 2, erased: 1, failed: 1, error: "erasure_failed" });
    expect(body.accounts).toEqual([
      expect.objectContaining({ user_id: "a", ok: true, totals: { delete: 2, anonymise: 1, detach: 0, detach_project: 0, extras: 0 } }),
      expect.objectContaining({ user_id: "b", ok: false, error: "stripe_failed" }),
    ]);
    expect(mocks.erase).toHaveBeenCalledTimes(2);
    expect(mocks.erase.mock.calls[0][1]).toMatchObject({ dryRun: false, actor: "cron", reason: "self_service_grace_elapsed", actorUserId: null });
    expect(mocks.listArgs[0]).toMatchObject({ limit: 25 });
  });

  it("?dry=1 passes dryRun through and 200 when everything is fine; ?limit clamps", async () => {
    mocks.due = [{ id: "a", deletion_requested_at: "2026-09-01T00:00:00Z" }];
    const res = await GET(req("?dry=1&limit=999", "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, dryRun: true, due: 1, erased: 1, failed: 0 });
    expect(mocks.erase.mock.calls[0][1]).toMatchObject({ dryRun: true });
    expect(mocks.listArgs[0]).toMatchObject({ limit: 25 });
    mocks.due = [];
    const r2 = await GET(req("?limit=0", "Bearer s3cret"));
    expect(await r2.json()).toMatchObject({ ok: true, due: 0 });
    expect(mocks.listArgs[1]).toMatchObject({ limit: 1 });
  });
});
