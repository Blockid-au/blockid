// Colocated vitest for POST + GET /api/data-room/access — P9-data-room-access-route-test.
//
// This route is the founder-facing "share the data room with an investor"
// entry point cited by the P1_dataroom_map + P4_walkthrough_wiring surfaces
// in docs/plans/atlassian-standard-mapping-goal.md. It mints an access token
// row against a founder's most-recently-created data_rooms row, returns the
// shareable link, and lists all previously-issued tokens on GET.
//
// Silent regressions this pins:
//   - dropping the `share_management` feature gate on POST so an anonymous /
//     free-tier caller could mint investor share links against another
//     founder's data room.
//   - dropping the .eq("account_id", user.id) filter on the data_rooms lookup
//     so a founder gets scored / linked into the wrong tenant's room.
//   - dropping the .order("created_at", { ascending: false }).limit(1).single()
//     on the data_rooms fetch so a founder with two rooms shares off the
//     wrong (older) one.
//   - dropping the 404 branch when no data room exists so the insert runs
//     with data_room_id=null and violates the not-null FK.
//   - dropping the 503 branch when getSupabaseAdmin returns null so the
//     handler NPEs the caller with a 500 instead of a graceful "database not
//     configured" message.
//   - dropping the defaults on investorType/accessLevel/sectionsAllowed/
//     ndaRequired/expiresInDays so a founder posting a minimal body gets a
//     null-riddled row that fails downstream RLS checks.
//   - flipping the expiresInDays default off 30 so every new link silently
//     changes its TTL.
//   - flipping the shareUrl prefix off `/data-room/investor/` so the copy
//     button on the /workspace surface hands out a 404.
//   - dropping the 500 branch on insert error so the founder sees a 200 with
//     accessToken=null (fires a broken share flow).
//   - dropping the auth check on GET so an anonymous caller lists every
//     tenant's tokens.
//   - dropping the .eq("account_id", user.id) filter on GET so tokens
//     cross-render across founders.
//   - dropping the order("created_at", desc) on GET so the /workspace
//     "recent shares" widget renders in random order.
//   - flipping the GET null-guard so `tokens ?? []` regresses to `.tokens`
//     and returns `undefined` for an empty tenant (breaks the widget's
//     `.map`).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// --- Mocks ------------------------------------------------------------------

const gateMock = vi.fn<(feature: string) => Promise<unknown>>();
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => gateMock(feature),
}));

const getCurrentUserMock =
  vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// Route import must come AFTER the mocks are registered.
import { GET, POST } from "./route";

// --- Fake Supabase ---------------------------------------------------------
//
// POST hits two tables in sequence:
//   data_rooms                → .select().eq().order().limit(1).single() → {data}
//   data_room_access_tokens   → .insert().select().single()              → {data,error}
//
// GET hits one:
//   data_room_access_tokens   → .select().eq().order()                    → {data}
//
// The fake dispatches on table name so each branch has its own thenable
// shape. State carries per-call captures so the assertions can pin the
// exact filter / order / insert payload.

interface AccessTokenRow {
  id: string;
  token: string;
  investor_name?: string | null;
  investor_email?: string | null;
  investor_firm?: string | null;
  expires_at?: string | null;
  [k: string]: unknown;
}

interface FakeState {
  room: { id: string } | null;
  insertResult: { data: AccessTokenRow | null; error: { message: string } | null };
  listResult: AccessTokenRow[] | null;
  calls: {
    from: string[];
    dataRoomsEq: { col: string; val: unknown } | null;
    dataRoomsOrder: { col: string; ascending?: boolean } | null;
    dataRoomsLimit: number | null;
    dataRoomsSelect: string | null;
    insertPayload: Record<string, unknown> | null;
    insertSelect: string | null;
    listEq: { col: string; val: unknown } | null;
    listOrder: { col: string; ascending?: boolean } | null;
    listSelect: string | null;
  };
}

const state: FakeState = {
  room: null,
  insertResult: { data: null, error: null },
  listResult: null,
  calls: {
    from: [],
    dataRoomsEq: null,
    dataRoomsOrder: null,
    dataRoomsLimit: null,
    dataRoomsSelect: null,
    insertPayload: null,
    insertSelect: null,
    listEq: null,
    listOrder: null,
    listSelect: null,
  },
};

function resetState() {
  state.room = null;
  state.insertResult = { data: null, error: null };
  state.listResult = null;
  state.calls = {
    from: [],
    dataRoomsEq: null,
    dataRoomsOrder: null,
    dataRoomsLimit: null,
    dataRoomsSelect: null,
    insertPayload: null,
    insertSelect: null,
    listEq: null,
    listOrder: null,
    listSelect: null,
  };
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.calls.from.push(table);

      if (table === "data_rooms") {
        return {
          select(cols: string) {
            state.calls.dataRoomsSelect = cols;
            return {
              eq(col: string, val: unknown) {
                state.calls.dataRoomsEq = { col, val };
                return {
                  order(col2: string, opts?: { ascending?: boolean }) {
                    state.calls.dataRoomsOrder = { col: col2, ...opts };
                    return {
                      limit(n: number) {
                        state.calls.dataRoomsLimit = n;
                        return {
                          single: () =>
                            Promise.resolve({ data: state.room }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "data_room_access_tokens") {
        return {
          insert(payload: Record<string, unknown>) {
            state.calls.insertPayload = payload;
            return {
              select(cols: string) {
                state.calls.insertSelect = cols;
                return {
                  single: () => Promise.resolve(state.insertResult),
                };
              },
            };
          },
          select(cols: string) {
            state.calls.listSelect = cols;
            return {
              eq(col: string, val: unknown) {
                state.calls.listEq = { col, val };
                return {
                  order(col2: string, opts?: { ascending?: boolean }) {
                    state.calls.listOrder = { col: col2, ...opts };
                    return Promise.resolve({ data: state.listResult });
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
  };
}

// --- Request helpers -------------------------------------------------------

function jsonReq(body: unknown): NextRequest {
  return new Request("http://localhost/api/data-room/access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const USER = { id: "user-1", email: "founder@example.com" };

function gateOk(user: { id: string; email: string }) {
  return {
    ok: true,
    user,
    uwp: { id: user.id, plan: "free", segment: "founder" },
  };
}

function gateFail(status: number, error: string) {
  return {
    ok: false,
    response: NextResponse.json({ ok: false, error }, { status }),
  };
}

// --- Setup -----------------------------------------------------------------

beforeEach(() => {
  resetState();
  gateMock.mockReset();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
});

// --- POST ------------------------------------------------------------------

describe("POST /api/data-room/access", () => {
  it("401s when the feature gate rejects (unauthenticated caller)", async () => {
    gateMock.mockResolvedValue(gateFail(401, "Authentication required"));
    const res = await POST(jsonReq({ investorName: "Blackbird" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
    // Gate short-circuits before touching the database.
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.calls.from.length).toBe(0);
  });

  it("402 feature_locked short-circuits identically", async () => {
    gateMock.mockResolvedValue(gateFail(402, "feature_locked"));
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("feature_locked");
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("passes the feature key 'share_management' to the gate", async () => {
    gateMock.mockResolvedValue(gateFail(401, "Authentication required"));
    await POST(jsonReq({}));
    expect(gateMock).toHaveBeenCalledWith("share_management");
  });

  it("503s when getSupabaseAdmin returns null (db not configured)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValueOnce(null);
    const res = await POST(jsonReq({ investorName: "Blackbird" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Database not configured");
  });

  it("404s when the founder has no data room to share", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.room = null;
    const res = await POST(jsonReq({ investorName: "Blackbird" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("No data room found");
    // No insert attempted when the room lookup fails.
    expect(state.calls.insertPayload).toBeNull();
  });

  it("scopes the data_rooms lookup to the caller via account_id + picks most recent", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.room = { id: "room-abc" };
    state.insertResult = {
      data: {
        id: "tok-id",
        token: "tok-value",
        investor_name: "Blackbird",
        investor_email: null,
        investor_firm: null,
        expires_at: "2026-08-01T00:00:00.000Z",
      },
      error: null,
    };
    await POST(jsonReq({ investorName: "Blackbird" }));
    expect(state.calls.dataRoomsSelect).toBe("id");
    expect(state.calls.dataRoomsEq).toEqual({ col: "account_id", val: "user-1" });
    expect(state.calls.dataRoomsOrder).toEqual({
      col: "created_at",
      ascending: false,
    });
    expect(state.calls.dataRoomsLimit).toBe(1);
  });

  it("happy path 200 forwards every field into the insert payload", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.room = { id: "room-abc" };
    state.insertResult = {
      data: {
        id: "tok-id",
        token: "tok-value",
        investor_name: "Blackbird",
        investor_email: "gp@blackbird.vc",
        investor_firm: "Blackbird Ventures",
        expires_at: "2026-08-31T00:00:00.000Z",
      },
      error: null,
    };
    const res = await POST(
      jsonReq({
        investorName: "Blackbird",
        investorEmail: "gp@blackbird.vc",
        investorFirm: "Blackbird Ventures",
        investorType: "angel",
        accessLevel: "download",
        sectionsAllowed: ["financials", "cap_table"],
        ndaRequired: true,
        expiresInDays: 14,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const payload = state.calls.insertPayload!;
    expect(payload.data_room_id).toBe("room-abc");
    expect(payload.account_id).toBe("user-1");
    expect(payload.investor_name).toBe("Blackbird");
    expect(payload.investor_email).toBe("gp@blackbird.vc");
    expect(payload.investor_firm).toBe("Blackbird Ventures");
    expect(payload.investor_type).toBe("angel");
    expect(payload.access_level).toBe("download");
    expect(payload.sections_allowed).toEqual(["financials", "cap_table"]);
    expect(payload.nda_required).toBe(true);
    expect(payload.is_active).toBe(true);
    expect(typeof payload.expires_at).toBe("string");
  });

  it("applies documented defaults when the body omits every optional field", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.room = { id: "room-abc" };
    state.insertResult = {
      data: {
        id: "tok-id",
        token: "tok-value",
        investor_name: undefined,
        investor_email: "gp@blackbird.vc",
        investor_firm: null,
        expires_at: "2026-08-31T00:00:00.000Z",
      },
      error: null,
    };
    await POST(jsonReq({ investorEmail: "gp@blackbird.vc" }));
    const payload = state.calls.insertPayload!;
    expect(payload.investor_type).toBe("vc");
    expect(payload.access_level).toBe("view");
    expect(payload.sections_allowed).toBeNull();
    expect(payload.nda_required).toBe(false);
    // The default 30-day TTL: expires_at is roughly 30 days in the future.
    const expiresAt = new Date(payload.expires_at as string).getTime();
    const now = Date.now();
    const diffDays = (expiresAt - now) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(29.5);
    expect(diffDays).toBeLessThan(30.5);
  });

  it("respects a caller-supplied expiresInDays override (e.g. 7)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.room = { id: "room-abc" };
    state.insertResult = {
      data: { id: "tok-id", token: "tok-value" },
      error: null,
    };
    await POST(jsonReq({ expiresInDays: 7 }));
    const payload = state.calls.insertPayload!;
    const expiresAt = new Date(payload.expires_at as string).getTime();
    const now = Date.now();
    const diffDays = (expiresAt - now) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(6.5);
    expect(diffDays).toBeLessThan(7.5);
  });

  it("returns the shareUrl on the /data-room/investor/{token} path", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.room = { id: "room-abc" };
    state.insertResult = {
      data: {
        id: "tok-id",
        token: "raw-token-value",
        investor_name: "Blackbird",
      },
      error: null,
    };
    const res = await POST(jsonReq({ investorName: "Blackbird" }));
    const body = await res.json();
    expect(body.shareUrl).toBe("/data-room/investor/raw-token-value");
  });

  it("message prefers investorName when both name + email are set", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.room = { id: "room-abc" };
    state.insertResult = {
      data: { id: "tok-id", token: "t", investor_name: "Blackbird" },
      error: null,
    };
    const res = await POST(
      jsonReq({ investorName: "Blackbird", investorEmail: "gp@blackbird.vc" }),
    );
    const body = await res.json();
    expect(body.message).toBe("Investor link created for Blackbird");
  });

  it("message falls back to investorEmail when investorName is absent", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.room = { id: "room-abc" };
    state.insertResult = {
      data: {
        id: "tok-id",
        token: "t",
        investor_name: null,
        investor_email: "gp@blackbird.vc",
      },
      error: null,
    };
    const res = await POST(jsonReq({ investorEmail: "gp@blackbird.vc" }));
    const body = await res.json();
    expect(body.message).toBe("Investor link created for gp@blackbird.vc");
  });

  it("500s and surfaces the underlying error.message when the insert fails", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.room = { id: "room-abc" };
    state.insertResult = {
      data: null,
      error: { message: "duplicate key value violates unique constraint" },
    };
    const res = await POST(jsonReq({ investorName: "Blackbird" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("duplicate key value violates unique constraint");
  });

  it("500s when the insert returns null data even without an error object", async () => {
    // Defensive branch — the `error || !accessToken` guard ensures a null row
    // never renders a broken shareUrl of `/data-room/investor/undefined`.
    gateMock.mockResolvedValue(gateOk(USER));
    state.room = { id: "room-abc" };
    state.insertResult = { data: null, error: null };
    const res = await POST(jsonReq({ investorName: "Blackbird" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    // error message is `error?.message` → undefined when the error object is
    // absent; the JSON shape should still not carry the key or should carry
    // undefined. Either way, the .ok flag is the source of truth.
  });

  it("insert-select column list pins the shape the shareUrl helper depends on", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.room = { id: "room-abc" };
    state.insertResult = {
      data: { id: "tok-id", token: "t", investor_name: "n" },
      error: null,
    };
    await POST(jsonReq({ investorName: "n" }));
    // At minimum the returned columns must include token (for shareUrl) and
    // the investor_* fields for the caller-facing echo.
    const cols = state.calls.insertSelect ?? "";
    expect(cols).toContain("token");
    expect(cols).toContain("investor_name");
    expect(cols).toContain("investor_email");
    expect(cols).toContain("expires_at");
  });

  it("gracefully treats a non-JSON body as an empty object (defaults apply)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.room = { id: "room-abc" };
    state.insertResult = {
      data: { id: "tok-id", token: "t" },
      error: null,
    };
    const req = new Request("http://localhost/api/data-room/access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json at all",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(200);
    // Defaults applied since body parsed to {} on catch.
    const payload = state.calls.insertPayload!;
    expect(payload.investor_type).toBe("vc");
    expect(payload.access_level).toBe("view");
  });

  it("echoes the exact accessToken row returned by the insert", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.room = { id: "room-abc" };
    const row: AccessTokenRow = {
      id: "tok-id",
      token: "tok-value",
      investor_name: "Blackbird",
      investor_email: "gp@blackbird.vc",
      investor_firm: "Blackbird Ventures",
      expires_at: "2026-08-31T00:00:00.000Z",
    };
    state.insertResult = { data: row, error: null };
    const res = await POST(jsonReq({ investorName: "Blackbird" }));
    const body = await res.json();
    expect(body.accessToken).toEqual(row);
  });

  it("inserts is_active=true on every new token (no soft-disabled shares on mint)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    state.room = { id: "room-abc" };
    state.insertResult = {
      data: { id: "tok-id", token: "t" },
      error: null,
    };
    await POST(jsonReq({ investorName: "n" }));
    expect(state.calls.insertPayload?.is_active).toBe(true);
  });
});

// --- GET -------------------------------------------------------------------

describe("GET /api/data-room/access", () => {
  it("401s when no user is signed in", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Authentication required");
    // No DB call when unauthenticated.
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("503s when supabase is not configured", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Database not configured");
  });

  it("returns tokens: [] when the tenant has none (null-safe)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    state.listResult = null;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.tokens).toEqual([]);
  });

  it("returns the full token list ordered newest-first", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const rows: AccessTokenRow[] = [
      { id: "t2", token: "tok-2", investor_name: "Airtree" },
      { id: "t1", token: "tok-1", investor_name: "Blackbird" },
    ];
    state.listResult = rows;
    const res = await GET();
    const body = await res.json();
    expect(body.tokens).toEqual(rows);
    expect(state.calls.listOrder).toEqual({
      col: "created_at",
      ascending: false,
    });
  });

  it("scopes the list to the caller via account_id", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    state.listResult = [];
    await GET();
    expect(state.calls.listEq).toEqual({ col: "account_id", val: "user-1" });
  });

  it("selects the investor-facing columns the /workspace widget renders", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    state.listResult = [];
    await GET();
    const cols = state.calls.listSelect ?? "";
    // Non-exhaustive pin — surfaces a silent drop of any of these visible
    // fields in the /workspace "recent shares" table.
    expect(cols).toContain("token");
    expect(cols).toContain("investor_name");
    expect(cols).toContain("investor_email");
    expect(cols).toContain("investor_firm");
    expect(cols).toContain("access_count");
    expect(cols).toContain("expires_at");
    expect(cols).toContain("is_active");
  });

  it("uses only the data_room_access_tokens table on the list path", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    state.listResult = [];
    await GET();
    expect(state.calls.from).toEqual(["data_room_access_tokens"]);
  });
});
