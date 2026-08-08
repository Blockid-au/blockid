// Colocated vitest for GET /api/admin/reseller-loop/status — P9-admin-reseller-loop-status-route-test.
//
// The route feeds the /admin/reseller-loop dashboard with a tri-fold view of
// the reseller-goal autonomous-loop state:
//
//   1. /tmp/blockid-reseller-monitor.txt      (human-readable one-minute snapshot)
//   2. web/content/reports/reseller-monitor.jsonl        (last 30 monitor rows)
//   3. web/content/reports/reseller-goal-history.jsonl   (last 40 loop-tick rows)
//   4. /tmp/blockid-reseller-goal-done                   (presence => complete)
//
// This suite pins the silent regressions that would break the dashboard:
//
//   - Dropping the requireAdmin() gate so any logged-in user (or a stranger)
//     sees internal loop state.
//   - Dropping the ENOENT soft-fail (safeRead) so a never-fired loop 500s the
//     admin page instead of surfacing `complete: false` with empty history.
//   - Regressing the 30 / 40 tail budgets — the UI renders those two arrays
//     inline; unbounded growth would blow the payload.
//   - Regressing the "unparseable line -> skipped, not null" contract that
//     keeps a torn JSONL write from crashing the whole endpoint.
//   - Regressing the fixed four source paths (/tmp/blockid-reseller-monitor.txt,
//     the two JSONL files under web/content/reports/, and the DONE marker).
//   - Losing `export const dynamic = "force-dynamic"` — this route reads
//     per-request auth AND filesystem state, so a build-time cache would
//     serve a frozen admin panel.
//   - Regressing the `{ ok, complete, completed_at, snapshot, monitor_history,
//     tick_history, generated_at }` envelope the admin bundle destructures.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// --- Mocks (hoisted so they exist before the route import) ----------------

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{ id: string; email: string; role?: string } | null>>(),
  readFile: vi.fn<(p: string, enc?: string) => Promise<string>>(),
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getCurrentUser: () => mocks.getCurrentUser(),
  };
});

vi.mock("node:fs/promises", () => ({
  readFile: (p: string, enc?: string) => mocks.readFile(p, enc),
}));

import { GET, dynamic } from "./route";

// --- Constants (must match route.ts exactly — that is the whole point) ----

const REPO_ROOT = "/home/dovanlong/blockid.au";
const MONITOR_TXT = "/tmp/blockid-reseller-monitor.txt";
const MONITOR_JSONL = `${REPO_ROOT}/web/content/reports/reseller-monitor.jsonl`;
const HISTORY_JSONL = `${REPO_ROOT}/web/content/reports/reseller-goal-history.jsonl`;
const DONE_MARKER = "/tmp/blockid-reseller-goal-done";

const ALL_PATHS = [MONITOR_TXT, MONITOR_JSONL, HISTORY_JSONL, DONE_MARKER];

const ADMIN_USER = { id: "u-admin-1", email: "admin@blockid.au" };
const NON_ADMIN_USER = { id: "u-42", email: "someone@example.com" };

// --- Helpers --------------------------------------------------------------

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Build a readFile mock that returns a specific string per path and throws
 * ENOENT for every other path. Simulates the real "some files exist, others
 * don't" world the route was written for.
 */
function readFileFrom(map: Record<string, string>) {
  return async (p: string) => {
    if (Object.prototype.hasOwnProperty.call(map, p)) return map[p];
    throw new Error(`ENOENT: ${p}`);
  };
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.readFile.mockReset();
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  // Default: every source is missing (ENOENT). Individual cases override.
  mocks.readFile.mockImplementation(async (p: string) => {
    throw new Error(`ENOENT: ${p}`);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// -------------------------------------------------------------------------
describe("dynamic export", () => {
  it("forces dynamic — reads per-request auth and filesystem, must never be prerendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// -------------------------------------------------------------------------
describe("auth gate", () => {
  it("returns 401 with reason 'no_user' when getCurrentUser() is null", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "no_user" });
  });

  it("returns 401 with reason 'not_admin' when the caller is authenticated but not admin", async () => {
    mocks.getCurrentUser.mockResolvedValue(NON_ADMIN_USER);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "not_admin" });
  });

  it("does not touch the filesystem when the caller is unauthenticated (no wasted I/O)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await GET();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("does not touch the filesystem when the caller is a non-admin (no state leak)", async () => {
    mocks.getCurrentUser.mockResolvedValue(NON_ADMIN_USER);
    await GET();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("treats a user with role='admin' as admin even when the email is not the primary admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-9", email: "other@x.com", role: "admin" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await jsonOf(res)).ok).toBe(true);
  });
});

// -------------------------------------------------------------------------
describe("file-read wiring", () => {
  it("reads exactly the four documented source paths (regression guard on renames)", async () => {
    await GET();
    const paths = mocks.readFile.mock.calls.map((c) => c[0]);
    expect(paths.sort()).toEqual([...ALL_PATHS].sort());
  });

  it("requests utf8 encoding on every read", async () => {
    await GET();
    for (const call of mocks.readFile.mock.calls) {
      expect(call[1]).toBe("utf8");
    }
  });

  it("issues all reads in parallel (Promise.all, not sequential await)", async () => {
    let concurrent = 0;
    let peak = 0;
    mocks.readFile.mockImplementation(async () => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      // Yield once so a truly sequential implementation would drop the peak to 1.
      await Promise.resolve();
      concurrent -= 1;
      throw new Error("ENOENT");
    });
    await GET();
    expect(peak).toBeGreaterThan(1);
  });
});

// -------------------------------------------------------------------------
describe("payload shape", () => {
  it("returns 200 with the full envelope on the happy path (all files missing)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body).toMatchObject({
      ok: true,
      complete: false,
      completed_at: null,
      snapshot: "",
      monitor_history: [],
      tick_history: [],
    });
    expect(body).toHaveProperty("generated_at");
  });

  it("emits generated_at as a parseable ISO-8601 string (admin UI timestamps key off this)", async () => {
    const res = await GET();
    const gen = (await jsonOf(res)).generated_at as string;
    expect(typeof gen).toBe("string");
    expect(Number.isNaN(Date.parse(gen))).toBe(false);
  });
});

// -------------------------------------------------------------------------
describe("snapshot passthrough", () => {
  it("threads the raw /tmp snapshot text through unchanged (no normalisation)", async () => {
    const raw = "reseller-monitor:\n  phase: P4\n  ok: 42\n";
    mocks.readFile.mockImplementation(readFileFrom({ [MONITOR_TXT]: raw }));
    const body = await jsonOf(await GET());
    expect(body.snapshot).toBe(raw);
  });

  it("returns snapshot='' when the /tmp file is missing (safeRead soft-fail)", async () => {
    const body = await jsonOf(await GET());
    expect(body.snapshot).toBe("");
  });
});

// -------------------------------------------------------------------------
describe("done-marker semantics", () => {
  it("marks complete=true and copies the marker's trimmed contents to completed_at", async () => {
    const iso = "2026-08-08T06:53:03.404Z";
    mocks.readFile.mockImplementation(readFileFrom({ [DONE_MARKER]: `  ${iso}  \n` }));
    const body = await jsonOf(await GET());
    expect(body.complete).toBe(true);
    expect(body.completed_at).toBe(iso);
  });

  it("treats a whitespace-only marker as incomplete (not a false 'done' signal)", async () => {
    mocks.readFile.mockImplementation(readFileFrom({ [DONE_MARKER]: "   \n\t  " }));
    const body = await jsonOf(await GET());
    expect(body.complete).toBe(false);
    expect(body.completed_at).toBeNull();
  });

  it("treats a missing marker as incomplete (never-fired-completion path)", async () => {
    const body = await jsonOf(await GET());
    expect(body.complete).toBe(false);
    expect(body.completed_at).toBeNull();
  });
});

// -------------------------------------------------------------------------
describe("monitor_history parsing + tail", () => {
  it("parses every line of a valid JSONL body in order", async () => {
    const rows = [
      { t: 1, phase: "P1" },
      { t: 2, phase: "P2" },
      { t: 3, phase: "P3" },
    ];
    const body = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
    mocks.readFile.mockImplementation(readFileFrom({ [MONITOR_JSONL]: body }));
    const out = await jsonOf(await GET());
    expect(out.monitor_history).toEqual(rows);
  });

  it("keeps only the last 30 monitor rows (bounded payload)", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ n: i }));
    const body = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
    mocks.readFile.mockImplementation(readFileFrom({ [MONITOR_JSONL]: body }));
    const out = await jsonOf(await GET());
    const kept = out.monitor_history as Array<{ n: number }>;
    expect(kept).toHaveLength(30);
    expect(kept[0].n).toBe(20);
    expect(kept[kept.length - 1].n).toBe(49);
  });

  it("skips unparseable JSONL lines instead of surfacing nulls (torn write survival)", async () => {
    const body = [
      JSON.stringify({ ok: true, n: 1 }),
      "{not valid json",
      JSON.stringify({ ok: true, n: 2 }),
      "",
      JSON.stringify({ ok: true, n: 3 }),
    ].join("\n");
    mocks.readFile.mockImplementation(readFileFrom({ [MONITOR_JSONL]: body }));
    const out = (await jsonOf(await GET())).monitor_history as Array<{ n: number }>;
    // The bad line is dropped; empty lines are filtered by tailLines' `l.length > 0` guard.
    expect(out.map((r) => r.n)).toEqual([1, 2, 3]);
    expect(out.every((r) => r !== null)).toBe(true);
  });

  it("returns [] when the monitor JSONL is missing (ENOENT soft-fail)", async () => {
    const out = await jsonOf(await GET());
    expect(out.monitor_history).toEqual([]);
  });
});

// -------------------------------------------------------------------------
describe("tick_history parsing + tail", () => {
  it("keeps only the last 40 tick rows (bounded payload)", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ tick: i }));
    const body = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
    mocks.readFile.mockImplementation(readFileFrom({ [HISTORY_JSONL]: body }));
    const out = (await jsonOf(await GET())).tick_history as Array<{ tick: number }>;
    expect(out).toHaveLength(40);
    expect(out[0].tick).toBe(20);
    expect(out[out.length - 1].tick).toBe(59);
  });

  it("returns [] when the tick JSONL is missing (ENOENT soft-fail)", async () => {
    const out = await jsonOf(await GET());
    expect(out.tick_history).toEqual([]);
  });

  it("keeps monitor_history and tick_history independent — one missing does not blank the other", async () => {
    const monitorRow = { source: "monitor", n: 7 };
    mocks.readFile.mockImplementation(
      readFileFrom({ [MONITOR_JSONL]: JSON.stringify(monitorRow) + "\n" }),
    );
    const body = await jsonOf(await GET());
    expect(body.monitor_history).toEqual([monitorRow]);
    expect(body.tick_history).toEqual([]);
  });
});
