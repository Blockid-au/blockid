// G14-S33 — /api/cron/traction-snapshot: bearer gate, ?dry=1 skips the write,
// warnings on the snapshot are still a 200, a builder throw is a 500, POST is GET.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTractionSnapshot, type BuildTractionSnapshotOptions, type TractionSnapshot } from "@/lib/traction/snapshot";

const mocks = vi.hoisted(() => ({
  build: vi.fn<(opts: BuildTractionSnapshotOptions) => Promise<TractionSnapshot>>(),
  persist: vi.fn<(s: TractionSnapshot, root?: string) => Promise<boolean>>(),
  supabase: { from: vi.fn() },
  stripe: { subscriptions: { list: vi.fn() } } as unknown,
}));
vi.mock("@/lib/traction/snapshot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/traction/snapshot")>();
  return { ...actual, buildTractionSnapshot: (opts: BuildTractionSnapshotOptions) => mocks.build(opts) };
});
vi.mock("@/lib/traction/persist", () => ({ persistTractionSnapshot: (s: TractionSnapshot, root?: string) => mocks.persist(s, root) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.supabase }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => mocks.stripe }));

import { GET, POST } from "./route";

const SECRET = "traction-test-secret";
const NOW = new Date("2026-09-16T03:20:00Z");

function req(query = "", auth: string | null = `Bearer ${SECRET}`, method: "GET" | "POST" = "GET"): Request {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  return new Request(`http://localhost/api/cron/traction-snapshot${query}`, { method, headers });
}

let origSecret: string | undefined;
beforeEach(() => {
  origSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SECRET;
  mocks.build.mockReset();
  mocks.persist.mockReset();
  mocks.build.mockResolvedValue({ ...emptyTractionSnapshot(NOW, "abc"), users: { total: 12, founders: 9, evaluators_by_plan: { investor_angel: 3 }, excluded_count: 4 } });
  mocks.persist.mockResolvedValue(true);
});
afterEach(() => {
  if (origSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = origSecret;
});

describe("auth", () => {
  it("401 without / with a wrong bearer, and no build", async () => {
    expect((await GET(req("", null))).status).toBe(401);
    expect((await GET(req("", "Bearer nope"))).status).toBe(401);
    expect((await GET(req("", SECRET))).status).toBe(401);
    expect(mocks.build).not.toHaveBeenCalled();
  });
  it("fails closed when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req())).status).toBe(401);
  });
});

describe("run", () => {
  it("builds with the service-role client + Stripe, persists, returns the snapshot with persisted:true", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mocks.build).toHaveBeenCalledTimes(1);
    const opts = mocks.build.mock.calls[0][0];
    expect(opts.supabase).toBe(mocks.supabase);
    expect(opts.stripe).toBe(mocks.stripe);
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as { ok: boolean; persisted: boolean; dry: boolean; snapshot: TractionSnapshot };
    expect(body.ok).toBe(true);
    expect(body.dry).toBe(false);
    expect(body.persisted).toBe(true);
    expect(body.snapshot.users.total).toBe(12);
    expect(body.snapshot.users.excluded_count).toBe(4);
  });

  it("?dry=1 builds but does not persist", async () => {
    const res = await GET(req("?dry=1"));
    expect(res.status).toBe(200);
    expect(mocks.build).toHaveBeenCalledTimes(1);
    expect(mocks.persist).not.toHaveBeenCalled();
    const body = (await res.json()) as { persisted: boolean; dry: boolean };
    expect(body.dry).toBe(true);
    expect(body.persisted).toBe(false);
  });

  it("warnings on the snapshot (missing tables) are findings → 200, still persisted", async () => {
    mocks.build.mockResolvedValue({ ...emptyTractionSnapshot(NOW), warnings: ["evaluation_assessments:submitted: 42P01 relation does not exist"] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { snapshot: TractionSnapshot };
    expect(body.snapshot.warnings).toHaveLength(1);
    expect(mocks.persist).toHaveBeenCalledTimes(1);
  });

  it("a failed write is reported as persisted:false, not a 500", async () => {
    mocks.persist.mockResolvedValue(false);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { persisted: boolean }).persisted).toBe(false);
  });

  it("a builder throw is a 500 with the message", async () => {
    mocks.build.mockRejectedValue(new Error("boom"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(((await res.json()) as { ok: boolean; error: string }).error).toBe("boom");
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("POST is the same handler", async () => {
    expect(POST).toBe(GET);
    expect((await POST(req("", `Bearer ${SECRET}`, "POST"))).status).toBe(200);
  });
});
