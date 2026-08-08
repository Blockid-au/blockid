// Colocated vitest for GET /api/admin/uptime-guardian — P9-admin-uptime-guardian-route-test.
//
// The route reads the uptime-guardian.jsonl history file (written every ~2 min
// by scripts/cron/uptime-guardian.sh) and returns the last ~120 snapshots plus
// the latest one, admin-gated. Regressions here would either (a) leak internal
// host health / disk / memory data to a logged-out visitor, (b) crash the
// /admin dashboard when the JSONL file is missing (the common case in fresh
// deploys or after log rotation), (c) drift the {ok, latest, history,
// generated_at} envelope the admin panel keys off, or (d) blow up the response
// with a partially-written (torn) JSONL line.
//
// Silent regressions this suite pins against:
//
//   - Dropping the requireAdmin() gate so a stranger sees uptime history.
//   - Dropping the getCurrentUser() null-user guard.
//   - Renaming the fixed uptime-guardian.jsonl path → the panel silently 200s
//     with an empty history forever.
//   - Losing the "unreadable file → empty history / null latest" soft-fail so
//     a missing JSONL 500s the admin dashboard.
//   - Losing the tail-120 cap so a huge history file blows the response body.
//   - Losing the JSON.parse per-line try/catch so one torn line 500s the whole
//     read (uptime-guardian writes append-only every 2min, torn lines are
//     inevitable in a rotation window).
//   - Losing `export const dynamic = "force-dynamic"` — the route reads
//     per-request auth state AND a mutable JSONL file; a build-time cache
//     would pin both.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// --- Mocks (hoisted so they exist before the route import) ----------------

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{ id: string; email: string; role?: string } | null>>(),
  readFile: vi.fn<(p: string, enc?: string) => Promise<string>>(),
}));

// Preserve ADMIN_EMAIL + AdminGateError so the real requireAdmin() runs.
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

// --- Helpers --------------------------------------------------------------

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const ADMIN_USER = { id: "u-admin-1", email: "admin@blockid.au" };
const NON_ADMIN_USER = { id: "u-42", email: "someone@example.com" };

const HISTORY_PATH = "/home/dovanlong/blockid.au/web/content/reports/uptime-guardian.jsonl";

function snapshot(ts: string, healthy = 1, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ts,
    healthy,
    http_local: "200",
    disk_pct: 29,
    mem_pct: 16,
    swap_mb: 0,
    load_1min: 1.08,
    nproc: 8,
    uptime_s: 420803,
    blockid_procs: 0,
    fail_count: 0,
    disk_action: "none",
    mem_action: "none",
    rollback_action: "none",
    ...extra,
  });
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.readFile.mockReset();
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  // Default: file is missing (ENOENT). Individual cases override.
  mocks.readFile.mockImplementation(async (p: string) => {
    throw new Error(`ENOENT: ${p}`);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// -------------------------------------------------------------------------
describe("dynamic export", () => {
  it("forces dynamic — this route reads per-user auth state AND a mutable JSONL file and must not be prerendered", () => {
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

  it("does not read the JSONL file when the caller is unauthenticated (no wasted disk I/O on strangers)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await GET();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("does not read the JSONL file when the caller is a non-admin (no state leak on 401 path)", async () => {
    mocks.getCurrentUser.mockResolvedValue(NON_ADMIN_USER);
    await GET();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("treats a user with role='admin' as admin even when the email is not the primary admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-9", email: "other@x.com", role: "admin" });
    mocks.readFile.mockResolvedValueOnce(snapshot("2026-08-08T00:00:00Z"));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.ok).toBe(true);
  });

  it("treats admin@blockid.au as admin regardless of role", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1", email: "admin@blockid.au", role: "user" });
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

// -------------------------------------------------------------------------
describe("file-read wiring", () => {
  it("reads the fixed uptime-guardian.jsonl absolute path (regression guard on renames / relocations)", async () => {
    await GET();
    expect(mocks.readFile).toHaveBeenCalledTimes(1);
    expect(mocks.readFile.mock.calls[0][0]).toBe(HISTORY_PATH);
  });

  it("requests utf8 encoding on the read (JSON.parse needs a string, not a Buffer)", async () => {
    await GET();
    expect(mocks.readFile.mock.calls[0][1]).toBe("utf8");
  });

  it("reads the JSONL file exactly once per request (no re-reads or fan-out)", async () => {
    mocks.readFile.mockResolvedValueOnce(snapshot("2026-08-08T00:00:00Z"));
    await GET();
    expect(mocks.readFile).toHaveBeenCalledTimes(1);
  });
});

// -------------------------------------------------------------------------
describe("payload shape", () => {
  it("returns { ok: true, latest, history, generated_at } on the happy path", async () => {
    mocks.readFile.mockResolvedValueOnce(snapshot("2026-08-08T00:00:00Z"));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("latest");
    expect(body).toHaveProperty("history");
    expect(body).toHaveProperty("generated_at");
  });

  it("emits generated_at as a parseable ISO-8601 string (admin UI timestamps key off this)", async () => {
    const res = await GET();
    const body = await jsonOf(res);
    const gen = body.generated_at as string;
    expect(typeof gen).toBe("string");
    expect(Number.isNaN(Date.parse(gen))).toBe(false);
  });

  it("returns history as an array on every path (admin UI does history.map())", async () => {
    const res = await GET();
    const body = await jsonOf(res);
    expect(Array.isArray(body.history)).toBe(true);
  });
});

// -------------------------------------------------------------------------
describe("history parsing", () => {
  it("threads each JSONL line through JSON.parse and preserves order", async () => {
    const rows = [
      snapshot("2026-08-08T00:00:00Z"),
      snapshot("2026-08-08T00:02:00Z"),
      snapshot("2026-08-08T00:04:00Z"),
    ];
    mocks.readFile.mockResolvedValueOnce(rows.join("\n"));
    const body = await jsonOf(await GET());
    const history = body.history as Array<{ ts: string }>;
    expect(history).toHaveLength(3);
    expect(history.map((r) => r.ts)).toEqual([
      "2026-08-08T00:00:00Z",
      "2026-08-08T00:02:00Z",
      "2026-08-08T00:04:00Z",
    ]);
  });

  it("exposes latest as the last row in the file (chronologically latest snapshot)", async () => {
    const rows = [
      snapshot("2026-08-08T00:00:00Z", 1),
      snapshot("2026-08-08T00:02:00Z", 0, { fail_count: 3 }),
    ];
    mocks.readFile.mockResolvedValueOnce(rows.join("\n"));
    const body = await jsonOf(await GET());
    const latest = body.latest as { ts: string; healthy: number; fail_count: number };
    expect(latest.ts).toBe("2026-08-08T00:02:00Z");
    expect(latest.healthy).toBe(0);
    expect(latest.fail_count).toBe(3);
  });

  it("filters empty lines (append-only writers land a trailing newline every tick)", async () => {
    const raw = [snapshot("2026-08-08T00:00:00Z"), "", "", snapshot("2026-08-08T00:02:00Z"), ""].join("\n");
    mocks.readFile.mockResolvedValueOnce(raw);
    const body = await jsonOf(await GET());
    const history = body.history as unknown[];
    expect(history).toHaveLength(2);
  });

  it("filters unparseable JSON lines (torn write in a rotation window must not 500)", async () => {
    const raw = [
      snapshot("2026-08-08T00:00:00Z"),
      "{not valid json",
      snapshot("2026-08-08T00:02:00Z"),
    ].join("\n");
    mocks.readFile.mockResolvedValueOnce(raw);
    const res = await GET();
    expect(res.status).toBe(200);
    const history = (await jsonOf(res)).history as Array<{ ts: string }>;
    expect(history).toHaveLength(2);
    expect(history.map((r) => r.ts)).toEqual([
      "2026-08-08T00:00:00Z",
      "2026-08-08T00:02:00Z",
    ]);
  });

  it("caps history at the last 120 rows (~4 hours at 2-min ticks — prevents unbounded response growth)", async () => {
    const rows: string[] = [];
    for (let i = 0; i < 300; i++) {
      rows.push(snapshot(`2026-08-08T${String(i).padStart(4, "0")}:00Z`, 1, { seq: i }));
    }
    mocks.readFile.mockResolvedValueOnce(rows.join("\n"));
    const body = await jsonOf(await GET());
    const history = body.history as Array<{ seq: number }>;
    expect(history).toHaveLength(120);
    // The cap must slice the TAIL (newest), not the head.
    expect(history[0].seq).toBe(300 - 120);
    expect(history[history.length - 1].seq).toBe(299);
  });

  it("exposes latest as the newest row even when the tail cap fires (latest is not stale from the pre-slice head)", async () => {
    const rows: string[] = [];
    for (let i = 0; i < 200; i++) {
      rows.push(snapshot(`2026-08-08T${String(i).padStart(4, "0")}:00Z`, 1, { seq: i }));
    }
    mocks.readFile.mockResolvedValueOnce(rows.join("\n"));
    const body = await jsonOf(await GET());
    const latest = body.latest as { seq: number };
    expect(latest.seq).toBe(199);
  });
});

// -------------------------------------------------------------------------
describe("soft-fail on unreadable / empty files", () => {
  it("maps ENOENT to history=[] and latest=null so a never-fired guardian surfaces cleanly (not a 500)", async () => {
    // Default beforeEach mock already throws ENOENT.
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.history).toEqual([]);
    expect(body.latest).toBeNull();
  });

  it("maps EACCES / any readFile rejection to the same empty state (soft-fail is not ENOENT-specific)", async () => {
    mocks.readFile.mockImplementation(async () => {
      throw new Error("EACCES: permission denied");
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.history).toEqual([]);
    expect(body.latest).toBeNull();
  });

  it("returns latest=null when the file exists but every line is empty or unparseable (no valid snapshots)", async () => {
    mocks.readFile.mockResolvedValueOnce("\n\n{broken\n\n");
    const body = await jsonOf(await GET());
    expect(body.history).toEqual([]);
    expect(body.latest).toBeNull();
  });

  it("returns latest=null when the file is completely empty (fresh log rotation)", async () => {
    mocks.readFile.mockResolvedValueOnce("");
    const body = await jsonOf(await GET());
    expect(body.history).toEqual([]);
    expect(body.latest).toBeNull();
  });
});
