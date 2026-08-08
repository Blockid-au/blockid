// Colocated vitest for GET /api/admin/goal-loop-status — P9-admin-goal-loop-status-route-test.
//
// The route reads three /tmp/blockid-*-loop.status snapshots written by the
// autonomous-loop cron and merges them into a single admin-only payload.
// Regressions here would either (a) leak internal loop state to a logged-out
// visitor, (b) crash the /admin dashboards when one of the three status files
// is missing (the common case for a loop that has never fired), or (c) drift
// the JSON envelope shape the admin bundle keys off (`{ ok, loops, generated_at }`).
//
// Silent regressions this suite pins against:
//
//   - Dropping the requireAdmin() gate so any authenticated user sees
//     internal loop status.
//   - Dropping the getCurrentUser() null-user guard so a stranger sees
//     internal loop status.
//   - Regressing the fixed three-key shape `{ reseller, atlassian, ux_ia }`
//     — an admin dashboard renders those keys explicitly.
//   - Regressing the fixed three /tmp/blockid-*-loop.status paths — a
//     rename would silently return `null` on the panel forever.
//   - Losing the "unreadable / unparseable → null" soft-fail so a missing
//     status file 500s the admin dashboard instead of surfacing null.
//   - Losing the JSON envelope contract — `ok: true`, `loops: {...}`,
//     `generated_at: <ISO string>`.
//   - Losing `export const dynamic = "force-dynamic"` — the route reads
//     per-request auth state and must NOT be pinned to a build-time cache.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// --- Mocks (hoisted so they exist before the route import) ----------------

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{ id: string; email: string; role?: string } | null>>(),
  readFile: vi.fn<(p: string, enc?: string) => Promise<string>>(),
}));

// Preserve ADMIN_EMAIL so the real requireAdmin() keeps working.
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

const PATH_RESELLER = "/tmp/blockid-reseller-loop.status";
const PATH_ATLASSIAN = "/tmp/blockid-atlassian-loop.status";
const PATH_UX_IA = "/tmp/blockid-ux-ia-loop.status";

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.readFile.mockReset();
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  // Default: every file is missing (ENOENT). Individual cases override.
  mocks.readFile.mockImplementation(async (p: string) => {
    throw new Error(`ENOENT: ${p}`);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// -------------------------------------------------------------------------
describe("dynamic export", () => {
  it("forces dynamic — this route reads per-user auth state and must not be prerendered", () => {
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

  it("does not read any /tmp status file when the caller is unauthenticated (no wasted disk I/O)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await GET();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("does not read any /tmp status file when the caller is a non-admin (no state leak)", async () => {
    mocks.getCurrentUser.mockResolvedValue(NON_ADMIN_USER);
    await GET();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("treats a user with role='admin' as admin even when the email is not the primary admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-9", email: "other@x.com", role: "admin" });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.ok).toBe(true);
  });
});

// -------------------------------------------------------------------------
describe("file-read wiring", () => {
  it("reads exactly the three documented /tmp paths (regression guard on renames)", async () => {
    await GET();
    const paths = mocks.readFile.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(
      expect.arrayContaining([PATH_RESELLER, PATH_ATLASSIAN, PATH_UX_IA]),
    );
    expect(paths).toHaveLength(3);
  });

  it("requests utf8 encoding on every read (JSON.parse needs a string, not a Buffer)", async () => {
    await GET();
    for (const call of mocks.readFile.mock.calls) {
      expect(call[1]).toBe("utf8");
    }
  });
});

// -------------------------------------------------------------------------
describe("payload shape", () => {
  it("returns { ok: true, loops: {...}, generated_at } on the happy path", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("loops");
    expect(body).toHaveProperty("generated_at");
  });

  it("exposes exactly the three loop keys the admin dashboard renders", async () => {
    const res = await GET();
    const body = await jsonOf(res);
    const loops = body.loops as Record<string, unknown>;
    expect(Object.keys(loops).sort()).toEqual(["atlassian", "reseller", "ux_ia"]);
  });

  it("emits generated_at as a parseable ISO-8601 string (admin UI timestamps key off this)", async () => {
    const res = await GET();
    const body = await jsonOf(res);
    const gen = body.generated_at as string;
    expect(typeof gen).toBe("string");
    const parsed = Date.parse(gen);
    expect(Number.isNaN(parsed)).toBe(false);
  });
});

// -------------------------------------------------------------------------
describe("soft-fail on unreadable / unparseable files", () => {
  it("maps every ENOENT to null so a never-fired loop surfaces as `null` (not a 500)", async () => {
    // Default beforeEach mock already throws ENOENT on every path.
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.loops).toEqual({ reseller: null, atlassian: null, ux_ia: null });
  });

  it("maps JSON.parse failures to null (a partial/torn write must not 500 the admin dashboard)", async () => {
    mocks.readFile.mockImplementation(async (p: string) => {
      if (p === PATH_RESELLER) return "{not valid json";
      throw new Error(`ENOENT: ${p}`);
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const loops = (await jsonOf(res)).loops as Record<string, unknown>;
    expect(loops.reseller).toBeNull();
    expect(loops.atlassian).toBeNull();
    expect(loops.ux_ia).toBeNull();
  });

  it("threads a parsed JSON snapshot through unchanged when a file is readable", async () => {
    const snapshot = {
      tick_id: "2026-08-08T06-47-01-674Z",
      stage: "tick_end",
      phase: "P9_ship",
    };
    mocks.readFile.mockImplementation(async (p: string) => {
      if (p === PATH_ATLASSIAN) return JSON.stringify(snapshot);
      throw new Error(`ENOENT: ${p}`);
    });
    const res = await GET();
    const loops = (await jsonOf(res)).loops as Record<string, unknown>;
    expect(loops.atlassian).toEqual(snapshot);
    expect(loops.reseller).toBeNull();
    expect(loops.ux_ia).toBeNull();
  });

  it("mixes readable + missing files independently — one unreadable file does not blank the others", async () => {
    mocks.readFile.mockImplementation(async (p: string) => {
      if (p === PATH_RESELLER) return JSON.stringify({ label: "reseller-live" });
      if (p === PATH_UX_IA) return JSON.stringify({ label: "ux-live" });
      throw new Error(`ENOENT: ${p}`);
    });
    const res = await GET();
    const loops = (await jsonOf(res)).loops as Record<string, unknown>;
    expect(loops.reseller).toEqual({ label: "reseller-live" });
    expect(loops.atlassian).toBeNull();
    expect(loops.ux_ia).toEqual({ label: "ux-live" });
  });
});
