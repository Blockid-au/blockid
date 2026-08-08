// Colocated vitest for POST /api/admin/ga4-refresh — P9-admin-ga4-refresh-route-test.
//
// The route is an admin-gated on-demand GA4 pull. It (1) verifies the caller
// is admin, (2) enforces a 60-second in-process throttle against double-clicks
// blowing the GA4 daily quota, (3) calls fetchDailySnapshot(), (4) appends the
// snapshot line to web/content/reports/ga4-daily.jsonl (idempotent per date),
// and (5) returns { ok, date, sessions, appended }. Silent regressions this
// suite pins against:
//
//   - Dropping the admin gate so any logged-in user can burn the GA4 quota.
//   - Dropping the null-user guard.
//   - Losing the 60s throttle so a double-click doubles the daily quota spend.
//   - Consuming the throttle window BEFORE the auth check (would let a stranger
//     throttle admin out of their own console).
//   - Renaming the fixed ga4-daily.jsonl path → the CDO dashboard silently
//     stops appending forever.
//   - Losing the per-date idempotence check so a manual refresh doubles today's
//     row and skews the trend7d rolling window.
//   - Dropping the { ok:false, error, hint } envelope from fetchDailySnapshot
//     failures — the admin panel keys off error+hint to render the "GA4 not
//     configured" callout.
//   - Losing `export const dynamic = "force-dynamic"` — the route reads
//     per-request auth state and mutates a JSONL file; a build-time cache
//     would pin both.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Ga4SnapshotResult } from "@/lib/ga4/data-api-client";

// --- Mocks (hoisted so they exist before the route import) ----------------

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{ id: string; email: string; role?: string } | null>>(),
  fetchDailySnapshot: vi.fn<() => Promise<Ga4SnapshotResult>>(),
  mkdir: vi.fn<(p: string, opts?: { recursive?: boolean }) => Promise<void>>(),
  readFile: vi.fn<(p: string, enc?: string) => Promise<string>>(),
  appendFile: vi.fn<(p: string, data: string, enc?: string) => Promise<void>>(),
}));

// Preserve ADMIN_EMAIL so the real admin check runs.
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getCurrentUser: () => mocks.getCurrentUser(),
  };
});

vi.mock("@/lib/ga4/data-api-client", () => ({
  fetchDailySnapshot: () => mocks.fetchDailySnapshot(),
}));

vi.mock("node:fs/promises", () => {
  const impl = {
    mkdir: (p: string, opts?: { recursive?: boolean }) => mocks.mkdir(p, opts),
    readFile: (p: string, enc?: string) => mocks.readFile(p, enc),
    appendFile: (p: string, data: string, enc?: string) => mocks.appendFile(p, data, enc),
  };
  // The route does `import fs from "node:fs/promises"` (default import), so the
  // mock module needs both a default export AND the named exports.
  return { ...impl, default: impl };
});

import { POST, dynamic } from "./route";

// --- Helpers --------------------------------------------------------------

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const ADMIN_USER = { id: "u-admin-1", email: "admin@blockid.au" };
const NON_ADMIN_USER = { id: "u-42", email: "someone@example.com" };

const JSONL_PATH = `${process.cwd()}/content/reports/ga4-daily.jsonl`;

function snapshotResult(overrides: Partial<Ga4SnapshotResult> = {}): Ga4SnapshotResult {
  return {
    ok: true,
    snapshot: {
      captured_at: "2026-08-08T00:00:00.000Z",
      date: "2026-08-07",
      range_days: 1,
      property_id: "properties/123",
      totals: {
        sessions: 42,
        activeUsers: 30,
        newUsers: 12,
        screenPageViews: 100,
        conversions: 3,
        engagementRate: 0.55,
        averageSessionDuration: 65.5,
      },
      topPages: [],
      topEvents: [],
      sourceMedium: [],
      trend7d: [],
    },
    ...overrides,
  } as Ga4SnapshotResult;
}

// Reset the module-scoped throttle by rewinding the shared globalThis marker
// the route consults each call. The route stores `__ga4RefreshLastAt` on
// globalThis so it survives HMR — tests must reset it or a stale timestamp
// from case N poisons case N+1.
function resetThrottle(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__ga4RefreshLastAt = 0;
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.fetchDailySnapshot.mockReset();
  mocks.mkdir.mockReset();
  mocks.readFile.mockReset();
  mocks.appendFile.mockReset();
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  mocks.fetchDailySnapshot.mockResolvedValue(snapshotResult());
  mocks.mkdir.mockResolvedValue(undefined);
  // Default: file does not exist yet.
  mocks.readFile.mockRejectedValue(new Error("ENOENT"));
  mocks.appendFile.mockResolvedValue(undefined);
  resetThrottle();
});

afterEach(() => {
  vi.clearAllMocks();
  resetThrottle();
});

// -------------------------------------------------------------------------
describe("dynamic export", () => {
  it("forces dynamic — this route reads per-user auth state AND mutates a JSONL file, must not be prerendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// -------------------------------------------------------------------------
describe("auth gate", () => {
  it("returns 403 { ok:false, error:'forbidden' } when getCurrentUser() is null", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(403);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "forbidden" });
  });

  it("returns 403 when the caller is authenticated but not admin", async () => {
    mocks.getCurrentUser.mockResolvedValue(NON_ADMIN_USER);
    const res = await POST();
    expect(res.status).toBe(403);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "forbidden" });
  });

  it("treats admin@blockid.au as admin regardless of role", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1", email: "admin@blockid.au", role: "user" });
    const res = await POST();
    expect(res.status).toBe(200);
  });

  it("treats a non-primary email with role='admin' as admin (role fallback)", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-9", email: "other@x.com", role: "admin" });
    const res = await POST();
    expect(res.status).toBe(200);
  });

  it("does not call fetchDailySnapshot() on the unauthenticated path (no quota burn on strangers)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await POST();
    expect(mocks.fetchDailySnapshot).not.toHaveBeenCalled();
  });

  it("does not call fetchDailySnapshot() on the non-admin path (no quota burn on logged-in non-admins)", async () => {
    mocks.getCurrentUser.mockResolvedValue(NON_ADMIN_USER);
    await POST();
    expect(mocks.fetchDailySnapshot).not.toHaveBeenCalled();
  });

  it("does not touch the JSONL file on the forbidden path (no disk I/O leak on 403)", async () => {
    mocks.getCurrentUser.mockResolvedValue(NON_ADMIN_USER);
    await POST();
    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.appendFile).not.toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------------
describe("throttle (60s in-process)", () => {
  it("allows the first admin call after a cold start (throttle window is empty)", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
  });

  it("returns 429 with a 'rate-limited' error when called again within 60s", async () => {
    await POST();
    const res = await POST();
    expect(res.status).toBe(429);
    const body = await jsonOf(res);
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error as string).toMatch(/rate-limited/);
    expect(body.error as string).toMatch(/retry in \d+s/);
  });

  it("advertises the remaining wait in whole seconds (Math.ceil, not fractional)", async () => {
    await POST();
    const res = await POST();
    const body = await jsonOf(res);
    const match = /retry in (\d+)s/.exec(body.error as string);
    expect(match).not.toBeNull();
    const secs = Number(match![1]);
    expect(Number.isInteger(secs)).toBe(true);
    expect(secs).toBeGreaterThan(0);
    expect(secs).toBeLessThanOrEqual(60);
  });

  it("does not call fetchDailySnapshot() when throttled (that is the point of the throttle)", async () => {
    await POST();
    mocks.fetchDailySnapshot.mockClear();
    await POST();
    expect(mocks.fetchDailySnapshot).not.toHaveBeenCalled();
  });

  it("does not append to the JSONL when throttled (no double-write on same date)", async () => {
    await POST();
    mocks.appendFile.mockClear();
    const res = await POST();
    expect(res.status).toBe(429);
    expect(mocks.appendFile).not.toHaveBeenCalled();
  });

  it("releases the throttle after 60s have elapsed (window advances forward, does not stick open)", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-08T00:00:00.000Z"));
      resetThrottle();
      const first = await POST();
      expect(first.status).toBe(200);

      vi.setSystemTime(new Date("2026-08-08T00:01:01.000Z")); // +61s
      const second = await POST();
      expect(second.status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does NOT consume the throttle window on the 403 path — throttle check follows the auth check", async () => {
    // A stranger repeatedly hitting the route must not lock out an admin.
    mocks.getCurrentUser.mockResolvedValue(NON_ADMIN_USER);
    await POST();
    await POST();
    await POST();

    // Now admin arrives — must not be throttled.
    mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
    const res = await POST();
    expect(res.status).toBe(200);
  });

  it("consumes the throttle window even when fetchDailySnapshot() fails (quota was already touched by the attempt)", async () => {
    mocks.fetchDailySnapshot.mockResolvedValueOnce({
      ok: false,
      error: "GA4 API not configured",
      hint: "Set GA4_PROPERTY_ID",
    });
    const first = await POST();
    expect(first.status).toBe(500);

    // Second admin call within 60s must be throttled — the failed attempt still
    // counts against the daily quota budget the throttle is defending.
    mocks.fetchDailySnapshot.mockResolvedValue(snapshotResult());
    const second = await POST();
    expect(second.status).toBe(429);
  });
});

// -------------------------------------------------------------------------
describe("fetchDailySnapshot() failure surfacing", () => {
  it("returns 500 with { ok:false, error, hint } when GA4 is not configured", async () => {
    mocks.fetchDailySnapshot.mockResolvedValueOnce({
      ok: false,
      error: "GA4 API not configured",
      hint: "Set GA4_PROPERTY_ID and GOOGLE_APPLICATION_CREDENTIALS_JSON in .env.local — see docs/plans/mega-2026-07-24/05-cdo-ga4-dashboard.md.",
    });
    const res = await POST();
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toEqual({
      ok: false,
      error: "GA4 API not configured",
      hint: "Set GA4_PROPERTY_ID and GOOGLE_APPLICATION_CREDENTIALS_JSON in .env.local — see docs/plans/mega-2026-07-24/05-cdo-ga4-dashboard.md.",
    });
  });

  it("passes through arbitrary error strings from fetchDailySnapshot() without transformation", async () => {
    mocks.fetchDailySnapshot.mockResolvedValueOnce({
      ok: false,
      error: "runReport 403: PERMISSION_DENIED",
    });
    const body = await jsonOf(await POST());
    expect(body.error).toBe("runReport 403: PERMISSION_DENIED");
    // hint is optional — undefined when omitted (JSON encodes as absent key).
    expect(body).not.toHaveProperty("hint");
  });

  it("does not attempt to append to the JSONL when fetchDailySnapshot() fails (no partial-write footgun)", async () => {
    mocks.fetchDailySnapshot.mockResolvedValueOnce({
      ok: false,
      error: "network",
    });
    await POST();
    expect(mocks.appendFile).not.toHaveBeenCalled();
    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------------
describe("happy path — JSONL append", () => {
  it("returns 200 with { ok:true, date, sessions, appended:true } on a fresh JSONL", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({
      ok: true,
      date: "2026-08-07",
      sessions: 42,
      appended: true,
    });
  });

  it("threads the exact date from the snapshot into the response (regression on hardcoded 'today')", async () => {
    const base = snapshotResult();
    if (!base.ok) throw new Error("snapshotResult() base must be ok:true");
    mocks.fetchDailySnapshot.mockResolvedValueOnce(
      snapshotResult({
        ok: true,
        snapshot: {
          ...base.snapshot,
          date: "2020-01-15",
          totals: { ...base.snapshot.totals, sessions: 999 },
        },
      } as Ga4SnapshotResult),
    );
    const body = await jsonOf(await POST());
    expect(body.date).toBe("2020-01-15");
    expect(body.sessions).toBe(999);
  });

  it("mkdir's the reports directory with recursive:true (fresh checkout has no content/reports yet)", async () => {
    await POST();
    expect(mocks.mkdir).toHaveBeenCalledTimes(1);
    const [, opts] = mocks.mkdir.mock.calls[0];
    expect(opts).toEqual({ recursive: true });
  });

  it("appends to the fixed ga4-daily.jsonl absolute path (regression on relocations)", async () => {
    await POST();
    expect(mocks.appendFile).toHaveBeenCalledTimes(1);
    expect(mocks.appendFile.mock.calls[0][0]).toBe(JSONL_PATH);
  });

  it("mkdir's the DIRECTORY of the JSONL (not the file itself)", async () => {
    await POST();
    const [dir] = mocks.mkdir.mock.calls[0];
    expect(dir).toBe(`${process.cwd()}/content/reports`);
  });

  it("writes JSON.stringify(snapshot) + '\\n' as a single append (one line per snapshot, trailing newline)", async () => {
    await POST();
    const [, data, enc] = mocks.appendFile.mock.calls[0];
    expect(enc).toBe("utf8");
    expect((data as string).endsWith("\n")).toBe(true);
    const parsed = JSON.parse((data as string).trimEnd());
    expect(parsed.date).toBe("2026-08-07");
    expect(parsed.totals.sessions).toBe(42);
  });

  it("reads the JSONL exactly once (for the idempotence check) before appending", async () => {
    await POST();
    expect(mocks.readFile).toHaveBeenCalledTimes(1);
    expect(mocks.readFile.mock.calls[0][0]).toBe(JSONL_PATH);
    expect(mocks.readFile.mock.calls[0][1]).toBe("utf8");
  });

  it("tolerates a missing JSONL on the first-ever admin refresh (readFile ENOENT → treat as empty)", async () => {
    mocks.readFile.mockRejectedValueOnce(new Error("ENOENT: no such file"));
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.appended).toBe(true);
    expect(mocks.appendFile).toHaveBeenCalledTimes(1);
  });
});

// -------------------------------------------------------------------------
describe("idempotence — one row per date", () => {
  it("skips the append when a row for the snapshot's date already exists (appended:false)", async () => {
    mocks.readFile.mockResolvedValueOnce(
      JSON.stringify({ date: "2026-08-07", totals: { sessions: 40 } }) + "\n",
    );
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.appended).toBe(false);
    expect(mocks.appendFile).not.toHaveBeenCalled();
  });

  it("still returns 200 { ok:true, date, sessions } on the idempotent no-op path", async () => {
    mocks.readFile.mockResolvedValueOnce(
      JSON.stringify({ date: "2026-08-07" }) + "\n",
    );
    const body = await jsonOf(await POST());
    expect(body.ok).toBe(true);
    expect(body.date).toBe("2026-08-07");
    expect(body.sessions).toBe(42);
  });

  it("appends when the file has rows for OTHER dates but not the snapshot date", async () => {
    const raw = [
      JSON.stringify({ date: "2026-08-05" }),
      JSON.stringify({ date: "2026-08-06" }),
      "",
    ].join("\n");
    mocks.readFile.mockResolvedValueOnce(raw);
    const body = await jsonOf(await POST());
    expect(body.appended).toBe(true);
    expect(mocks.appendFile).toHaveBeenCalledTimes(1);
  });

  it("ignores unparseable JSONL lines during the idempotence scan (torn writes must not force a duplicate)", async () => {
    const raw = [
      "{not valid",
      JSON.stringify({ date: "2026-08-07" }), // same date as snapshot
      "also broken",
    ].join("\n");
    mocks.readFile.mockResolvedValueOnce(raw);
    const body = await jsonOf(await POST());
    // The valid line's date matched → no append.
    expect(body.appended).toBe(false);
    expect(mocks.appendFile).not.toHaveBeenCalled();
  });

  it("does not fail when EVERY line in the file is unparseable (soft-treat as empty → append)", async () => {
    mocks.readFile.mockResolvedValueOnce("{broken\n[also broken\n\n");
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.appended).toBe(true);
    expect(mocks.appendFile).toHaveBeenCalledTimes(1);
  });

  it("filters trailing empty lines from the idempotence scan without triggering JSON.parse('')", async () => {
    // A leading valid row plus lots of blank lines from a rotation window.
    const raw = JSON.stringify({ date: "2026-08-07" }) + "\n\n\n\n";
    mocks.readFile.mockResolvedValueOnce(raw);
    const body = await jsonOf(await POST());
    expect(body.appended).toBe(false);
  });
});

// -------------------------------------------------------------------------
describe("write-failure surfacing", () => {
  it("returns 500 with { ok:false, error:'write failed: …' } when appendFile rejects", async () => {
    mocks.appendFile.mockRejectedValueOnce(new Error("EACCES: permission denied"));
    const res = await POST();
    expect(res.status).toBe(500);
    const body = await jsonOf(res);
    expect(body.ok).toBe(false);
    expect(body.error as string).toMatch(/^write failed: /);
    expect(body.error as string).toMatch(/EACCES/);
  });

  it("returns 500 when mkdir rejects (disk full, EROFS, etc.)", async () => {
    mocks.mkdir.mockRejectedValueOnce(new Error("EROFS: read-only file system"));
    const res = await POST();
    expect(res.status).toBe(500);
    const body = await jsonOf(res);
    expect(body.error as string).toMatch(/write failed: /);
    expect(body.error as string).toMatch(/EROFS/);
  });

  it("stringifies non-Error throwables in the write-failure branch (does not emit [object Object])", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mocks.appendFile.mockImplementationOnce(async () => {
      throw "raw string thrown"; // non-Error
    });
    const body = await jsonOf(await POST());
    expect(body.error).toBe("write failed: raw string thrown");
  });
});
