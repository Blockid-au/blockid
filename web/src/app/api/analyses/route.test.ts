// Colocated vitest for GET /api/analyses (list).
//
// The tenancy rule: a signed-in caller sees their user_id's runs, a signed-out
// caller sees only the unclaimed rows behind their own anon cookie, and the
// two identities are never mixed. Passing BOTH a userId and an anonKey into
// the store would be the bug — the store would then filter on user_id and
// silently ignore the cookie, but a future refactor could make it an OR.
//
// Also pinned: a caller with no identity gets an empty 200, not a 401. This
// surface works anonymously and a 401 would push the UI into a sign-in wall.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<() => Promise<{ id: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const readAnonKeyMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/analyses/anon-key", () => ({
  readAnonKey: () => readAnonKeyMock(),
}));

const listMock = vi.fn<
  (v: { userId?: string | null; anonKey?: string | null }) => Promise<unknown[]>
>();
vi.mock("@/lib/analyses/store", () => ({
  listAnalysesForViewer: (v: Parameters<typeof listMock>[0]) => listMock(v),
}));

import { GET, dynamic, runtime } from "./route";

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(null);
  readAnonKeyMock.mockReset().mockResolvedValue(null);
  listMock.mockReset().mockResolvedValue([]);
});

describe("GET /api/analyses — module invariants", () => {
  it("runs on node and is never cached", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/analyses", () => {
  it("lists a signed-in caller's runs by user id, ignoring any anon cookie", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    readAnonKeyMock.mockResolvedValue("k".repeat(24));
    listMock.mockResolvedValue([{ id: "a1" }]);
    const res = await GET();
    expect(await json(res)).toEqual({ ok: true, analyses: [{ id: "a1" }] });
    expect(listMock).toHaveBeenCalledWith({ userId: "u1", anonKey: null });
  });

  it("lists a signed-out caller's runs by anon cookie", async () => {
    readAnonKeyMock.mockResolvedValue("k".repeat(24));
    listMock.mockResolvedValue([{ id: "a2" }]);
    const res = await GET();
    expect(((await json(res)).analyses as unknown[])).toHaveLength(1);
    expect(listMock).toHaveBeenCalledWith({ userId: null, anonKey: "k".repeat(24) });
  });

  it("returns an empty 200 — not a 401 — for a caller with no identity", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, analyses: [] });
    expect(listMock).not.toHaveBeenCalled();
  });

  it("falls back to the anon cookie when the session lookup throws", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("session table down"));
    readAnonKeyMock.mockResolvedValue("k".repeat(24));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith({ userId: null, anonKey: "k".repeat(24) });
  });
});
