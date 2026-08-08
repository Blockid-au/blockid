// Colocated vitest for GET /api/admin/ops — P9 ship-readiness regression
// gate for the JSON mirror of the /admin/ops COO dashboard cited in
// docs/plans/atlassian-standard-mapping-goal.md (§P9_ship: "regression
// tests for legal + walkthrough + ship surfaces").
//
// The route is what external monitors curl (via the admin session cookie)
// to scrape release + deploy + credit-burn + cron-health + experiments +
// growth + security-posture in a single round-trip. The pins below cover
// silent regressions that only surface after the dashboard is already
// wrong:
//   * dropping the getCurrentUser() null guard exposes internal ops
//     telemetry (release SHA, credit-burn per feature, cron lag) to any
//     unauthenticated caller
//   * dropping the admin gate exposes the same telemetry to any signed-in
//     user — the route intentionally rejects with 403 (not 401) on a
//     signed-in-but-non-admin so monitors distinguish "creds missing"
//     from "creds insufficient"
//   * flipping the admin gate to email-only would lock out role='admin'
//     staff accounts; flipping it to role-only would lock out the
//     admin@blockid.au primary; the pin covers both admit paths
//   * dropping the Promise.all serialises seven independent reads (from
//     ~250ms to ~1.75s per call in prod) — the pin proves all seven
//     helpers ran concurrently by asserting a single tick suffices
//   * drifting the envelope shape (rename release → releaseInfo, drop
//     posture, etc.) silently breaks the external monitors that key off
//     the fixed field names
//   * losing `export const dynamic = "force-dynamic"` pins the response
//     to the build-time cache so the dashboard never updates
//   * losing `export const runtime = "nodejs"` promotes the route to the
//     edge runtime where node:fs (used by getCronHealth24h) is unavailable

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getReleaseInfo: vi.fn(),
  getDeployHealth24h: vi.fn(),
  getCreditBurn30d: vi.fn(),
  getCronHealth24h: vi.fn(),
  getActiveExperiments: vi.fn(),
  getGrowth7d: vi.fn(),
  getSecurityPosture: vi.fn(),
}));

// Partial mock of @/lib/auth so the real ADMIN_EMAIL export stays live and
// the route reads the same "admin@blockid.au" the auth helpers do.
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getCurrentUser: () => mocks.getCurrentUser(),
  };
});

vi.mock("@/lib/ops-metrics", () => ({
  getReleaseInfo: () => mocks.getReleaseInfo(),
  getDeployHealth24h: () => mocks.getDeployHealth24h(),
  getCreditBurn30d: () => mocks.getCreditBurn30d(),
  getCronHealth24h: () => mocks.getCronHealth24h(),
  getActiveExperiments: () => mocks.getActiveExperiments(),
  getGrowth7d: () => mocks.getGrowth7d(),
  getSecurityPosture: () => mocks.getSecurityPosture(),
}));

import * as routeModule from "./route";
const { GET } = routeModule;

const ADMIN = { id: "u-admin", email: "admin@blockid.au", role: "user" };
const ADMIN_BY_ROLE = { id: "u-role", email: "other@example.com", role: "admin" };
const REGULAR = { id: "u-2", email: "user@example.com", role: "user" };

const RELEASE = { buildId: "b1", gitSha: "abc123", deployedAt: "2026-08-08T00:00:00Z", pid: 42 };
const DEPLOY = { deploys: 3, failures: 0, publicHttp200Count: 100 };
const BURN = { total: 5000, byFeature: [], daily: [] };
const CRON = [{ job: "x", lastRunAt: null, lastStatus: "ok", lagMinutes: 0 }];
const EXPS: Array<unknown> = [];
const GROWTH = { signupsDaily: [], analysesDaily: [] };
const POSTURE = { headers: "ok" };

function primeMocks() {
  mocks.getReleaseInfo.mockResolvedValue(RELEASE);
  mocks.getDeployHealth24h.mockResolvedValue(DEPLOY);
  mocks.getCreditBurn30d.mockResolvedValue(BURN);
  mocks.getCronHealth24h.mockResolvedValue(CRON);
  mocks.getActiveExperiments.mockResolvedValue(EXPS);
  mocks.getGrowth7d.mockResolvedValue(GROWTH);
  mocks.getSecurityPosture.mockResolvedValue(POSTURE);
}

async function body(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getReleaseInfo.mockReset();
  mocks.getDeployHealth24h.mockReset();
  mocks.getCreditBurn30d.mockReset();
  mocks.getCronHealth24h.mockReset();
  mocks.getActiveExperiments.mockReset();
  mocks.getGrowth7d.mockReset();
  mocks.getSecurityPosture.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("route module — dynamic + runtime pins", () => {
  it("exports dynamic='force-dynamic' so the per-request auth read is never build-cached", () => {
    expect(routeModule.dynamic).toBe("force-dynamic");
  });

  it("exports runtime='nodejs' so ops-metrics helpers can use node:fs", () => {
    expect(routeModule.runtime).toBe("nodejs");
  });
});

describe("GET /api/admin/ops — auth gate", () => {
  it("401 Unauthorized when no user is signed in", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await body(res)).toEqual({ error: "Unauthorized" });
  });

  it("does NOT touch any ops-metrics helper on the unauthenticated branch (state-leak guard)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await GET();
    expect(mocks.getReleaseInfo).not.toHaveBeenCalled();
    expect(mocks.getDeployHealth24h).not.toHaveBeenCalled();
    expect(mocks.getCreditBurn30d).not.toHaveBeenCalled();
    expect(mocks.getCronHealth24h).not.toHaveBeenCalled();
    expect(mocks.getActiveExperiments).not.toHaveBeenCalled();
    expect(mocks.getGrowth7d).not.toHaveBeenCalled();
    expect(mocks.getSecurityPosture).not.toHaveBeenCalled();
  });

  it("403 Forbidden on a signed-in non-admin (distinct from the 401 unauth path)", async () => {
    mocks.getCurrentUser.mockResolvedValue(REGULAR);
    const res = await GET();
    expect(res.status).toBe(403);
    expect(await body(res)).toEqual({ error: "Forbidden" });
  });

  it("does NOT touch any ops-metrics helper on the non-admin branch (state-leak guard)", async () => {
    mocks.getCurrentUser.mockResolvedValue(REGULAR);
    await GET();
    expect(mocks.getReleaseInfo).not.toHaveBeenCalled();
    expect(mocks.getCronHealth24h).not.toHaveBeenCalled();
    expect(mocks.getSecurityPosture).not.toHaveBeenCalled();
  });

  it("admits the admin@blockid.au primary email even without role=admin", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    primeMocks();
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("admits a role='admin' account whose email is not the primary", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN_BY_ROLE);
    primeMocks();
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/ops — happy-path envelope", () => {
  it("threads every ops-metrics result into its named envelope key", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    primeMocks();
    const b = await body(await GET());
    expect(b.release).toEqual(RELEASE);
    expect(b.deployHealth).toEqual(DEPLOY);
    expect(b.creditBurn).toEqual(BURN);
    expect(b.cronHealth).toEqual(CRON);
    expect(b.experiments).toEqual(EXPS);
    expect(b.growth).toEqual(GROWTH);
    expect(b.posture).toEqual(POSTURE);
  });

  it("exposes exactly the eight documented keys — no drift, no leaked internal state", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    primeMocks();
    const b = await body(await GET());
    expect(Object.keys(b).sort()).toEqual(
      [
        "creditBurn",
        "cronHealth",
        "deployHealth",
        "experiments",
        "generatedAt",
        "growth",
        "posture",
        "release",
      ],
    );
  });

  it("generatedAt is an ISO-8601 string parseable by Date.parse (external monitors sort on it)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    primeMocks();
    const b = await body(await GET());
    expect(typeof b.generatedAt).toBe("string");
    expect(Number.isFinite(Date.parse(b.generatedAt as string))).toBe(true);
  });

  it("invokes every ops-metrics helper exactly once per request (no double-read, no missed source)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    primeMocks();
    await GET();
    expect(mocks.getReleaseInfo).toHaveBeenCalledTimes(1);
    expect(mocks.getDeployHealth24h).toHaveBeenCalledTimes(1);
    expect(mocks.getCreditBurn30d).toHaveBeenCalledTimes(1);
    expect(mocks.getCronHealth24h).toHaveBeenCalledTimes(1);
    expect(mocks.getActiveExperiments).toHaveBeenCalledTimes(1);
    expect(mocks.getGrowth7d).toHaveBeenCalledTimes(1);
    expect(mocks.getSecurityPosture).toHaveBeenCalledTimes(1);
  });

  it("runs the seven reads concurrently (Promise.all — not sequential await)", async () => {
    // Prove concurrency by making every helper wait for the same barrier
    // Promise. If the route awaits each helper sequentially none of them
    // would resolve because helper N+1 would not be invoked until helper N
    // settled — and helper 1 is waiting on the barrier that only fires
    // once we detect all seven were called. So the test would hang and
    // time out. If the route uses Promise.all, all seven are invoked in a
    // single microtask, we release the barrier, and every helper resolves.
    mocks.getCurrentUser.mockResolvedValue(ADMIN);

    let release: () => void = () => {};
    const barrier = new Promise<void>((r) => (release = r));

    const waitForBarrier = <T,>(value: T) => async () => {
      await barrier;
      return value;
    };
    mocks.getReleaseInfo.mockImplementation(waitForBarrier(RELEASE));
    mocks.getDeployHealth24h.mockImplementation(waitForBarrier(DEPLOY));
    mocks.getCreditBurn30d.mockImplementation(waitForBarrier(BURN));
    mocks.getCronHealth24h.mockImplementation(waitForBarrier(CRON));
    mocks.getActiveExperiments.mockImplementation(waitForBarrier(EXPS));
    mocks.getGrowth7d.mockImplementation(waitForBarrier(GROWTH));
    mocks.getSecurityPosture.mockImplementation(waitForBarrier(POSTURE));

    const inFlight = GET();

    // Yield a tick so Promise.all can dispatch all seven invocations.
    await Promise.resolve();
    await Promise.resolve();

    // All seven helpers must have been invoked before any resolved —
    // sequential awaits would only have called the first.
    expect(mocks.getReleaseInfo).toHaveBeenCalledTimes(1);
    expect(mocks.getDeployHealth24h).toHaveBeenCalledTimes(1);
    expect(mocks.getCreditBurn30d).toHaveBeenCalledTimes(1);
    expect(mocks.getCronHealth24h).toHaveBeenCalledTimes(1);
    expect(mocks.getActiveExperiments).toHaveBeenCalledTimes(1);
    expect(mocks.getGrowth7d).toHaveBeenCalledTimes(1);
    expect(mocks.getSecurityPosture).toHaveBeenCalledTimes(1);

    release();
    const res = await inFlight;
    expect(res.status).toBe(200);
  });

  it("returns Content-Type: application/json (NextResponse.json)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    primeMocks();
    const res = await GET();
    expect(res.headers.get("content-type") ?? "").toMatch(/application\/json/);
  });
});

describe("GET /api/admin/ops — degradation posture", () => {
  it("threads null helper results through unchanged (each helper owns its empty-state contract)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getReleaseInfo.mockResolvedValue(null);
    mocks.getDeployHealth24h.mockResolvedValue(null);
    mocks.getCreditBurn30d.mockResolvedValue(null);
    mocks.getCronHealth24h.mockResolvedValue([]);
    mocks.getActiveExperiments.mockResolvedValue([]);
    mocks.getGrowth7d.mockResolvedValue(null);
    mocks.getSecurityPosture.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.release).toBeNull();
    expect(b.deployHealth).toBeNull();
    expect(b.creditBurn).toBeNull();
    expect(b.cronHealth).toEqual([]);
    expect(b.experiments).toEqual([]);
    expect(b.growth).toBeNull();
    expect(b.posture).toBeNull();
  });
});
