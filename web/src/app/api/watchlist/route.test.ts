// Unit tests for GET + POST + OPTIONS /api/watchlist — P9-watchlist-route-test.
//
// The route is the join point for the investor-side bookmark surface
// (T_SVI_EXC_0001):
//   1. GET  — signed-in user pulls the list of watchlist rows for their
//             account, verbatim from listWatchlist(user.id).
//   2. POST — signed-in user toggles a ticker on/off; the route validates the
//             ticker shape (^[A-Z]{1,8}-[A-Z0-9]{1,8}$) and truncates the
//             slug / notes bodies before handing off to toggleWatchlist.
//   3. OPTIONS — CORS preflight for the cross-origin caller at
//             https://startupvalueindex.com (the SVI ticker-page mounts the
//             route as a same-user credentialed fetch from another origin).
//
// Silent regressions this pins against:
//   - Dropping the 401 on GET and leaking one founder's watchlist to any
//     anonymous caller (or worse, to a different signed-in caller once the
//     route memo-caches the response by mistake).
//   - Dropping the 401 on POST and letting anyone toggle rows on any
//     account_id — the toggle helper takes accountId at face value, so this
//     is a raw IDOR footgun.
//   - Regressing the ticker regex — e.g. loosening to allow lowercase, empty
//     halves, or 20-character garbage that pollutes the (account_id, ticker)
//     index and lands in the /investor/ticker/<ticker> URL space.
//   - Dropping the `.trim().toUpperCase()` normalisation and letting
//     "  abc-def  " and "ABC-DEF" both live on the same account (two rows
//     for what the user sees as the same ticker).
//   - Dropping the JSON-parse try/catch on POST and letting a text/plain body
//     surface a 500 to the SVI widget instead of a clean 400.
//   - Dropping the slug/notes .slice() truncation and letting an attacker
//     store multi-megabyte notes columns per toggle (payload bloat DoS).
//   - Dropping the CORS Access-Control-Allow-Credentials header and breaking
//     the cross-origin signed-in fetch from startupvalueindex.com
//     (browser drops the cookie → route 401s → widget looks broken).
//   - Regressing OPTIONS from 204 to 200 (some CDNs cache 200 preflights but
//     not 204s, and the wrong caching moves the origin off startupvalueindex).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const listWatchlistMock = vi.fn<(accountId: string) => Promise<unknown[]>>();
const toggleWatchlistMock = vi.fn<
  (args: {
    accountId: string;
    ticker: string;
    slug?: string;
    notes?: string;
  }) => Promise<{ added: boolean; removed: boolean; row?: unknown }>
>();
vi.mock("@/lib/watchlist", () => ({
  listWatchlist: (accountId: string) => listWatchlistMock(accountId),
  toggleWatchlist: (args: {
    accountId: string;
    ticker: string;
    slug?: string;
    notes?: string;
  }) => toggleWatchlistMock(args),
}));

import { GET, POST, OPTIONS, dynamic } from "./route";

const SVI_ORIGIN = "https://startupvalueindex.com";

function jsonReq(body: unknown, method = "POST"): NextRequest {
  return new Request("http://localhost/api/watchlist", {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  listWatchlistMock.mockReset();
  toggleWatchlistMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "a@x.com" });
  listWatchlistMock.mockResolvedValue([]);
  toggleWatchlistMock.mockResolvedValue({ added: true, removed: false });
});

describe("/api/watchlist — module contract", () => {
  it('exports dynamic = "force-dynamic" so signed-in GETs are never prerendered', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET — auth guard", () => {
  it("returns 401 with a sign-in error string when the caller is anonymous", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Sign in to view your watchlist.",
    });
  });

  it("does NOT call listWatchlist on the 401 branch (no DB touch for anon)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(listWatchlistMock).not.toHaveBeenCalled();
  });
});

describe("GET — happy path", () => {
  it("returns 200 { ok:true, rows } when the caller is signed in", async () => {
    const rows = [
      { id: "w1", ticker: "AAA-BBB", slug: null, notes: null, created_at: "t" },
    ];
    listWatchlistMock.mockResolvedValue(rows);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rows });
  });

  it("passes the caller's user.id (never email) into listWatchlist", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-abc", email: "e@x.com" });
    await GET();
    expect(listWatchlistMock).toHaveBeenCalledWith("u-abc");
  });

  it("returns { rows: [] } verbatim when listWatchlist resolves empty", async () => {
    listWatchlistMock.mockResolvedValue([]);
    const res = await GET();
    expect(await res.json()).toEqual({ ok: true, rows: [] });
  });
});

describe("GET — CORS headers (cross-origin credentialed fetch from SVI)", () => {
  it("sets Access-Control-Allow-Origin to the startupvalueindex origin on 200", async () => {
    const res = await GET();
    expect(res.headers.get("access-control-allow-origin")).toBe(SVI_ORIGIN);
  });

  it('sets Access-Control-Allow-Credentials to "true" so the browser forwards cookies', async () => {
    const res = await GET();
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });
});

describe("POST — auth guard", () => {
  it("returns 401 with a use-your-watchlist error string when anonymous", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(jsonReq({ ticker: "AAA-BBB" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Sign in to use your watchlist.",
    });
  });

  it("does NOT call toggleWatchlist on the 401 branch (no side-effect for anon)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST(jsonReq({ ticker: "AAA-BBB" }));
    expect(toggleWatchlistMock).not.toHaveBeenCalled();
  });
});

describe("POST — body parse guard", () => {
  it("returns 400 with an Invalid JSON error when the body is not JSON", async () => {
    const bad = new Request("http://localhost/api/watchlist", {
      method: "POST",
      body: "{not-json",
    }) as unknown as NextRequest;
    const res = await POST(bad);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid JSON" });
    expect(toggleWatchlistMock).not.toHaveBeenCalled();
  });
});

describe("POST — ticker validation", () => {
  it("returns 400 for a missing ticker (empty string after trim)", async () => {
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Invalid ticker format",
    });
    expect(toggleWatchlistMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a ticker missing the dash separator", async () => {
    const res = await POST(jsonReq({ ticker: "ABCDEF" }));
    expect(res.status).toBe(400);
    expect(toggleWatchlistMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a ticker whose left half is empty (-BBB)", async () => {
    const res = await POST(jsonReq({ ticker: "-BBB" }));
    expect(res.status).toBe(400);
    expect(toggleWatchlistMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a ticker whose right half is empty (AAA-)", async () => {
    const res = await POST(jsonReq({ ticker: "AAA-" }));
    expect(res.status).toBe(400);
    expect(toggleWatchlistMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a left half over 8 chars (ABCDEFGHI-XYZ)", async () => {
    const res = await POST(jsonReq({ ticker: "ABCDEFGHI-XYZ" }));
    expect(res.status).toBe(400);
    expect(toggleWatchlistMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a right half over 8 chars (ABC-ABCDEFGHI)", async () => {
    const res = await POST(jsonReq({ ticker: "ABC-ABCDEFGHI" }));
    expect(res.status).toBe(400);
    expect(toggleWatchlistMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the left half contains a digit (AB1-CDE)", async () => {
    const res = await POST(jsonReq({ ticker: "AB1-CDE" }));
    expect(res.status).toBe(400);
    expect(toggleWatchlistMock).not.toHaveBeenCalled();
  });

  it("accepts digits in the right half only (ABC-1234)", async () => {
    const res = await POST(jsonReq({ ticker: "ABC-1234" }));
    expect(res.status).toBe(200);
    expect(toggleWatchlistMock).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: "ABC-1234" }),
    );
  });

  it("accepts an underscore-free lowercase ticker by uppercasing it before validation", async () => {
    const res = await POST(jsonReq({ ticker: "abc-def" }));
    expect(res.status).toBe(200);
    expect(toggleWatchlistMock).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: "ABC-DEF" }),
    );
  });

  it("returns 400 for a ticker with an underscore instead of a dash (AB_CD)", async () => {
    const res = await POST(jsonReq({ ticker: "AB_CD" }));
    expect(res.status).toBe(400);
    expect(toggleWatchlistMock).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace before applying the regex ('  AAA-BBB  ' → AAA-BBB)", async () => {
    const res = await POST(jsonReq({ ticker: "  AAA-BBB  " }));
    expect(res.status).toBe(200);
    expect(toggleWatchlistMock).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: "AAA-BBB" }),
    );
  });

  it("returns 400 when ticker is a non-string primitive (number defaults to empty via ?? '')", async () => {
    // ticker not supplied → treated as "" → invalid
    const res = await POST(jsonReq({ ticker: undefined }));
    expect(res.status).toBe(400);
  });
});

describe("POST — happy path payload", () => {
  it("returns 200 with { ok:true, added, removed } on toggle add", async () => {
    toggleWatchlistMock.mockResolvedValue({ added: true, removed: false });
    const res = await POST(jsonReq({ ticker: "AAA-BBB" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      added: true,
      removed: false,
    });
  });

  it("returns 200 with { ok:true, added:false, removed:true } on toggle remove", async () => {
    toggleWatchlistMock.mockResolvedValue({ added: false, removed: true });
    const res = await POST(jsonReq({ ticker: "AAA-BBB" }));
    expect(await res.json()).toEqual({
      ok: true,
      added: false,
      removed: true,
    });
  });

  it("passes the caller's user.id as accountId (never email) to toggleWatchlist", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-42", email: "z@x.com" });
    await POST(jsonReq({ ticker: "AAA-BBB" }));
    expect(toggleWatchlistMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "u-42" }),
    );
  });

  it("forwards slug and notes verbatim within limits", async () => {
    await POST(
      jsonReq({ ticker: "AAA-BBB", slug: "atlassian", notes: "watching" }),
    );
    expect(toggleWatchlistMock).toHaveBeenCalledWith({
      accountId: "u-1",
      ticker: "AAA-BBB",
      slug: "atlassian",
      notes: "watching",
    });
  });

  it("truncates slug to 100 chars before hand-off (payload-bloat DoS guard)", async () => {
    const longSlug = "s".repeat(500);
    await POST(jsonReq({ ticker: "AAA-BBB", slug: longSlug }));
    const call = toggleWatchlistMock.mock.calls[0]?.[0];
    expect(call?.slug?.length).toBe(100);
  });

  it("truncates notes to 500 chars before hand-off (payload-bloat DoS guard)", async () => {
    const longNotes = "n".repeat(2000);
    await POST(jsonReq({ ticker: "AAA-BBB", notes: longNotes }));
    const call = toggleWatchlistMock.mock.calls[0]?.[0];
    expect(call?.notes?.length).toBe(500);
  });

  it("passes slug=undefined when omitted (no empty string leaking as the slug)", async () => {
    await POST(jsonReq({ ticker: "AAA-BBB" }));
    const call = toggleWatchlistMock.mock.calls[0]?.[0];
    expect(call?.slug).toBeUndefined();
    expect(call?.notes).toBeUndefined();
  });
});

describe("POST — CORS headers on the success response", () => {
  it("sets Access-Control-Allow-Origin to the startupvalueindex origin", async () => {
    const res = await POST(jsonReq({ ticker: "AAA-BBB" }));
    expect(res.headers.get("access-control-allow-origin")).toBe(SVI_ORIGIN);
  });

  it('sets Access-Control-Allow-Credentials to "true"', async () => {
    const res = await POST(jsonReq({ ticker: "AAA-BBB" }));
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });
});

describe("OPTIONS — CORS preflight", () => {
  it("returns 204 (No Content) so the preflight is not cached as a full 200 response", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
  });

  it("sets Access-Control-Allow-Origin to the startupvalueindex origin", async () => {
    const res = await OPTIONS();
    expect(res.headers.get("access-control-allow-origin")).toBe(SVI_ORIGIN);
  });

  it('sets Access-Control-Allow-Credentials to "true" (mirrors GET/POST)', async () => {
    const res = await OPTIONS();
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("advertises the three methods the route actually implements (GET, POST, OPTIONS)", async () => {
    const res = await OPTIONS();
    const methods = res.headers.get("access-control-allow-methods") ?? "";
    expect(methods).toContain("GET");
    expect(methods).toContain("POST");
    expect(methods).toContain("OPTIONS");
  });

  it("allows the Content-Type request header so POSTs with a JSON body clear preflight", async () => {
    const res = await OPTIONS();
    expect(res.headers.get("access-control-allow-headers")).toContain(
      "Content-Type",
    );
  });
});
