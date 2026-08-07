// Unit tests for GET /api/i18n/stats — P9-i18n-stats-route-test.
//
// Route serves the admin-only translation traffic snapshot (T-1403.10).
// Three exit paths:
//   1. INTERNAL_ADMIN_KEY unset → 404 "Not found" (leak-guard: the route
//      must not advertise its existence when the platform hasn't opted in).
//   2. x-admin-key header missing / mismatched → 404 "Not found" (same
//      leak-guard — no 401 to distinguish "wrong key" from "no auth needed").
//   3. header matches → 200 JSON snapshot with both locales + no-store header.
//
// Silent regressions this pins against:
//   - dropping the 404 leak-guard and 200-ing an empty snapshot to anons;
//   - flipping the header/env comparison to a substring / case-insensitive
//     check that lets a partial key through;
//   - leaking the counters into an intermediate cache (Cache-Control
//     private, no-store is the ONLY header on the response and must not drift
//     to public / max-age);
//   - narrowing the snapshot shape and dropping the vi bucket the /admin
//     tile expects.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const snapshotStatsMock = vi.fn<
  () => Record<
    "en" | "vi",
    {
      requests: number;
      strings_requested: number;
      cache_hits: number;
      cache_misses: number;
      gemini_calls: number;
      gemini_success_strings: number;
      gemini_failures: number;
      drift_rejects: number;
      last_at: string | null;
    }
  >
>();
vi.mock("@/lib/i18n/translate-stats", () => ({
  snapshotStats: () => snapshotStatsMock(),
}));

import { GET, dynamic, runtime } from "./route";

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("http://local.test/api/i18n/stats", { headers });
}

function makeSnapshot() {
  return {
    en: {
      requests: 3,
      strings_requested: 42,
      cache_hits: 30,
      cache_misses: 12,
      gemini_calls: 2,
      gemini_success_strings: 10,
      gemini_failures: 0,
      drift_rejects: 1,
      last_at: "2026-08-07T19:00:00.000Z",
    },
    vi: {
      requests: 1,
      strings_requested: 7,
      cache_hits: 0,
      cache_misses: 7,
      gemini_calls: 1,
      gemini_success_strings: 7,
      gemini_failures: 0,
      drift_rejects: 0,
      last_at: "2026-08-07T19:00:01.000Z",
    },
  };
}

const originalAdminKey = process.env.INTERNAL_ADMIN_KEY;

beforeEach(() => {
  snapshotStatsMock.mockReset();
  snapshotStatsMock.mockReturnValue(makeSnapshot());
  delete process.env.INTERNAL_ADMIN_KEY;
});

afterEach(() => {
  if (originalAdminKey === undefined) delete process.env.INTERNAL_ADMIN_KEY;
  else process.env.INTERNAL_ADMIN_KEY = originalAdminKey;
});

describe("module exports", () => {
  it("marks the route dynamic so Next never caches the snapshot at build", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("pins the node runtime — the stats live on the node server process, not edge", () => {
    expect(runtime).toBe("nodejs");
  });
});

describe("GET /api/i18n/stats — env / auth leak-guard", () => {
  it("returns 404 with 'Not found' body when INTERNAL_ADMIN_KEY is unset", async () => {
    const res = await GET(makeReq({ "x-admin-key": "anything" }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
    expect(snapshotStatsMock).not.toHaveBeenCalled();
  });

  it("returns 404 when INTERNAL_ADMIN_KEY is set to empty string (still opt-out)", async () => {
    process.env.INTERNAL_ADMIN_KEY = "";
    const res = await GET(makeReq({ "x-admin-key": "" }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
    expect(snapshotStatsMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the x-admin-key header is missing entirely", async () => {
    process.env.INTERNAL_ADMIN_KEY = "correct-horse-battery-staple";
    const res = await GET(makeReq());
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
    expect(snapshotStatsMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the x-admin-key header holds an empty string", async () => {
    process.env.INTERNAL_ADMIN_KEY = "correct-horse-battery-staple";
    const res = await GET(makeReq({ "x-admin-key": "" }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
    expect(snapshotStatsMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the x-admin-key header does not match the env exactly", async () => {
    process.env.INTERNAL_ADMIN_KEY = "correct-horse-battery-staple";
    const res = await GET(makeReq({ "x-admin-key": "wrong-key" }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
    expect(snapshotStatsMock).not.toHaveBeenCalled();
  });

  it("rejects a case-mismatched header even when it differs only in casing", async () => {
    process.env.INTERNAL_ADMIN_KEY = "CorrectHorseBatteryStaple";
    const res = await GET(makeReq({ "x-admin-key": "correcthorsebatterystaple" }));
    expect(res.status).toBe(404);
    expect(snapshotStatsMock).not.toHaveBeenCalled();
  });

  it("rejects a header that is a prefix of the env (no substring / startsWith trap)", async () => {
    process.env.INTERNAL_ADMIN_KEY = "correct-horse-battery-staple";
    const res = await GET(makeReq({ "x-admin-key": "correct-horse" }));
    expect(res.status).toBe(404);
    expect(snapshotStatsMock).not.toHaveBeenCalled();
  });

  it("rejects a header that has extra trailing content beyond the env value", async () => {
    process.env.INTERNAL_ADMIN_KEY = "correct-horse-battery-staple";
    const res = await GET(
      makeReq({ "x-admin-key": "correct-horse-battery-staple-extra" }),
    );
    expect(res.status).toBe(404);
    expect(snapshotStatsMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/i18n/stats — authorised happy path", () => {
  it("returns 200 with the snapshot when the header matches the env exactly", async () => {
    process.env.INTERNAL_ADMIN_KEY = "correct-horse-battery-staple";
    const res = await GET(makeReq({ "x-admin-key": "correct-horse-battery-staple" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ReturnType<typeof makeSnapshot>;
    expect(body).toEqual(makeSnapshot());
    expect(snapshotStatsMock).toHaveBeenCalledTimes(1);
  });

  it("sets Cache-Control: private, no-store on the successful response (never public)", async () => {
    process.env.INTERNAL_ADMIN_KEY = "k";
    const res = await GET(makeReq({ "x-admin-key": "k" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns application/json content-type on the success path", async () => {
    process.env.INTERNAL_ADMIN_KEY = "k";
    const res = await GET(makeReq({ "x-admin-key": "k" }));
    expect(res.headers.get("content-type") ?? "").toMatch(/application\/json/);
  });

  it("propagates both en and vi buckets in the response body", async () => {
    process.env.INTERNAL_ADMIN_KEY = "k";
    const res = await GET(makeReq({ "x-admin-key": "k" }));
    const body = (await res.json()) as ReturnType<typeof makeSnapshot>;
    expect(Object.keys(body).sort()).toEqual(["en", "vi"]);
    expect(body.en.requests).toBe(3);
    expect(body.vi.requests).toBe(1);
    expect(body.en.gemini_success_strings).toBe(10);
    expect(body.vi.cache_misses).toBe(7);
  });

  it("invokes snapshotStats() lazily — never called on any 404 path", async () => {
    process.env.INTERNAL_ADMIN_KEY = "k";
    await GET(makeReq({ "x-admin-key": "wrong" }));
    await GET(makeReq({}));
    expect(snapshotStatsMock).not.toHaveBeenCalled();
    await GET(makeReq({ "x-admin-key": "k" }));
    expect(snapshotStatsMock).toHaveBeenCalledTimes(1);
  });

  it("returns a fresh snapshot on each authorised call (no in-route memoisation)", async () => {
    process.env.INTERNAL_ADMIN_KEY = "k";
    await GET(makeReq({ "x-admin-key": "k" }));
    await GET(makeReq({ "x-admin-key": "k" }));
    await GET(makeReq({ "x-admin-key": "k" }));
    expect(snapshotStatsMock).toHaveBeenCalledTimes(3);
  });

  it("passes null last_at through when a locale has never been hit", async () => {
    snapshotStatsMock.mockReturnValue({
      en: {
        requests: 0,
        strings_requested: 0,
        cache_hits: 0,
        cache_misses: 0,
        gemini_calls: 0,
        gemini_success_strings: 0,
        gemini_failures: 0,
        drift_rejects: 0,
        last_at: null,
      },
      vi: {
        requests: 0,
        strings_requested: 0,
        cache_hits: 0,
        cache_misses: 0,
        gemini_calls: 0,
        gemini_success_strings: 0,
        gemini_failures: 0,
        drift_rejects: 0,
        last_at: null,
      },
    });
    process.env.INTERNAL_ADMIN_KEY = "k";
    const res = await GET(makeReq({ "x-admin-key": "k" }));
    const body = (await res.json()) as { en: { last_at: string | null } };
    expect(body.en.last_at).toBeNull();
  });
});
