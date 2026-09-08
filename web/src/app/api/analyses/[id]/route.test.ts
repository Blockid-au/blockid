// Colocated vitest for GET /api/analyses/[id].
//
// THE property under test: an unauthorised caller gets 404, never 403. A 403
// confirms the id exists, which is the one fact this endpoint withholds —
// analysis ids are the handle on a founder's private work and must not be
// probeable. A malformed id answers 404 too, so the route does not even leak
// which ids are shaped correctly.
//
// The authorisation decision itself lives in the store (and is tested there);
// this suite pins that the route passes BOTH identities through and maps a
// null result onto 404 rather than 200-with-null or 500.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<() => Promise<{ id: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const readAnonKeyMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/analyses/anon-key", () => ({
  readAnonKey: () => readAnonKeyMock(),
}));

const getMock = vi.fn<
  (id: string, v: { userId?: string | null; anonKey?: string | null }) => Promise<
    Record<string, unknown> | null
  >
>();
vi.mock("@/lib/analyses/store", () => ({
  getAnalysisForViewer: (id: string, v: Parameters<typeof getMock>[1]) => getMock(id, v),
}));

import { GET, dynamic, runtime } from "./route";

const ID = "aaaaaaaa-1111-1111-1111-111111111111";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(null);
  readAnonKeyMock.mockReset().mockResolvedValue(null);
  getMock.mockReset().mockResolvedValue(null);
});

describe("GET /api/analyses/[id] — module invariants", () => {
  it("runs on node and is never cached", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/analyses/[id]", () => {
  it("returns the analysis to the anon-cookie holder", async () => {
    readAnonKeyMock.mockResolvedValue("k".repeat(24));
    getMock.mockResolvedValue({ id: ID, svi: { totalSVI: 118 } });
    const res = await GET(new Request("http://x"), ctx(ID));
    expect(res.status).toBe(200);
    expect((await json(res)).analysis).toEqual({ id: ID, svi: { totalSVI: 118 } });
  });

  it("passes BOTH the session user and the anon cookie to the store", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    readAnonKeyMock.mockResolvedValue("k".repeat(24));
    await GET(new Request("http://x"), ctx(ID));
    expect(getMock).toHaveBeenCalledWith(ID, {
      userId: "u1",
      anonKey: "k".repeat(24),
    });
  });

  it("returns 404 — NOT 403 — when the caller is not authorised", async () => {
    getMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), ctx(ID));
    expect(res.status).toBe(404);
    expect((await json(res)).error).toBe("Not found");
  });

  it("returns the identical 404 body whether the row is missing or forbidden", async () => {
    getMock.mockResolvedValue(null);
    const missing = await json(await GET(new Request("http://x"), ctx(ID)));
    const forbidden = await json(
      await GET(new Request("http://x"), ctx("bbbbbbbb-2222-2222-2222-222222222222")),
    );
    expect(missing).toEqual(forbidden);
  });

  it("404s a malformed id without touching the database", async () => {
    const res = await GET(new Request("http://x"), ctx("not-a-uuid"));
    expect(res.status).toBe(404);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("404s an empty id", async () => {
    const res = await GET(new Request("http://x"), ctx(""));
    expect(res.status).toBe(404);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("still serves the anon-cookie holder when the session lookup throws", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("session table down"));
    readAnonKeyMock.mockResolvedValue("k".repeat(24));
    getMock.mockResolvedValue({ id: ID });
    const res = await GET(new Request("http://x"), ctx(ID));
    expect(res.status).toBe(200);
    expect(getMock).toHaveBeenCalledWith(ID, { userId: null, anonKey: "k".repeat(24) });
  });
});
