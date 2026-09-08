// Colocated vitest for /api/investor-data-room — the founder-side control
// plane for investor share links, rewritten 2026-09-08.
//
// WHY THIS FILE WAS REWRITTEN. The previous route inserted
// `account_id, email, token, title, is_active, view_count, expires_at` into
// `data_rooms`. Not one of those columns exists on that table (the real shape
// is id/user_id/project_id/name/.../access_token/is_public/...), so every
// "Share with investor" click was a guaranteed 500 and the feature had never
// worked. The old tests passed anyway because the fake supabase happily
// accepted any column name — so these tests now assert against the REAL
// column set of `data_room_access_tokens`.
//
// Silent regressions this pins against:
//   - writing a phantom column again (the insert payload is asserted key-by-key);
//   - dropping the auth gate on POST, letting anyone mint a link;
//   - dropping `.eq("user_id", user.id)` on the room lookup — the only thing
//     stopping a caller minting a share link over someone else's data room;
//   - dropping `.eq("account_id", user.id)` on DELETE — revoke-anyone;
//   - a short or predictable token (the token IS the credential — there is no
//     auth on /s/dr/[token]);
//   - handing back an /api/... URL again instead of the rendered page;
//   - a 404-vs-403 split on revoke that would turn the endpoint into a
//     token-existence oracle.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface AppUser {
  id: string;
  email: string;
  displayName: string | null;
}

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

import { DELETE, GET, POST, dynamic } from "./route";

// ---------------------------------------------------------------------------
// Fake supabase — records every from/eq/insert/update, answers from a queue.
// ---------------------------------------------------------------------------

type Reply = { data: unknown; error: unknown };

interface FakeState {
  from: string[];
  eq: Array<{ table: string; col: string; val: unknown }>;
  inserts: Array<{ table: string; payload: Record<string, unknown> }>;
  updates: Array<{ table: string; payload: Record<string, unknown> }>;
  order: Array<{ table: string; col: string; opts?: unknown }>;
  replies: Reply[];
}

let state: FakeState;

function fresh(): FakeState {
  return { from: [], eq: [], inserts: [], updates: [], order: [], replies: [] };
}
function nextReply(): Reply {
  return state.replies.shift() ?? { data: null, error: null };
}

function makeSupabase() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq(col: string, val: unknown) {
          state.eq.push({ table, col, val });
          return chain;
        },
        order(col: string, opts?: unknown) {
          state.order.push({ table, col, opts });
          return chain;
        },
        limit: () => chain,
        insert(payload: Record<string, unknown>) {
          state.inserts.push({ table, payload });
          return chain;
        },
        update(payload: Record<string, unknown>) {
          state.updates.push({ table, payload });
          return chain;
        },
        maybeSingle: () => Promise.resolve(nextReply()),
        then: (resolve: (v: Reply) => unknown) =>
          Promise.resolve(nextReply()).then(resolve),
      };
      state.from.push(table);
      return chain;
    },
  };
}

const USER: AppUser = { id: "u-1", email: "founder@x.co", displayName: "Ada" };
const ROOM = { id: "room-1", name: "Acme", startup_name: "Acme", completeness_score: 60 };

function post(body?: unknown): NextRequest {
  return new NextRequest("https://blockid.au/api/investor-data-room", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
function get(qs = ""): NextRequest {
  return new NextRequest(`https://blockid.au/api/investor-data-room${qs}`);
}
function del(qs = ""): NextRequest {
  return new NextRequest(`https://blockid.au/api/investor-data-room${qs}`, {
    method: "DELETE",
  });
}

beforeEach(() => {
  state = fresh();
  mocks.getCurrentUserMock.mockReset();
  mocks.getSupabaseAdminMock.mockReset();
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
});

describe("route config", () => {
  it("is force-dynamic — a cached share response would serve one founder's room to another", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe("POST — guards", () => {
  it("401s an anonymous caller and never touches the database", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(post({}));
    expect(res.status).toBe(401);
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("503s when supabase is unconfigured", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(USER);
    mocks.getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(post({}));
    expect(res.status).toBe(503);
  });

  it("409 no_data_room when the founder has nothing assembled yet — never mints a link to an empty room", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(USER);
    mocks.getSupabaseAdminMock.mockReturnValue(makeSupabase());
    state.replies = [{ data: null, error: null }];
    const res = await POST(post({}));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("no_data_room");
    expect(state.inserts).toHaveLength(0);
  });

  it("tolerates an empty body — every field is optional", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(USER);
    mocks.getSupabaseAdminMock.mockReturnValue(makeSupabase());
    state.replies = [{ data: ROOM, error: null }, { data: { id: "s-1", created_at: "t" }, error: null }];
    const res = await POST(post());
    expect(res.status).toBe(200);
  });

  it("500s (and does not claim success) when the share insert fails", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(USER);
    mocks.getSupabaseAdminMock.mockReturnValue(makeSupabase());
    state.replies = [
      { data: ROOM, error: null },
      { data: null, error: { message: "column does not exist" } },
    ];
    const res = await POST(post({}));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});

describe("POST — tenancy", () => {
  it("scopes the room lookup on user_id — cannot mint a link over another founder's room", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(USER);
    mocks.getSupabaseAdminMock.mockReturnValue(makeSupabase());
    state.replies = [{ data: ROOM, error: null }, { data: { id: "s-1" }, error: null }];
    await POST(post({}));
    expect(state.eq).toContainEqual({ table: "data_rooms", col: "user_id", val: "u-1" });
  });

  it("an explicit dataRoomId is filtered ALONGSIDE user_id, never instead of it", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(USER);
    mocks.getSupabaseAdminMock.mockReturnValue(makeSupabase());
    state.replies = [{ data: ROOM, error: null }, { data: { id: "s-1" }, error: null }];
    await POST(post({ dataRoomId: "someone-elses-room" }));
    const roomEqs = state.eq.filter((e) => e.table === "data_rooms");
    expect(roomEqs).toContainEqual({ table: "data_rooms", col: "user_id", val: "u-1" });
    expect(roomEqs).toContainEqual({ table: "data_rooms", col: "id", val: "someone-elses-room" });
  });
});

describe("POST — the insert writes columns that actually exist", () => {
  async function mint(body: Record<string, unknown> = {}) {
    mocks.getCurrentUserMock.mockResolvedValue(USER);
    mocks.getSupabaseAdminMock.mockReturnValue(makeSupabase());
    state.replies = [
      { data: ROOM, error: null },
      { data: { id: "share-1", created_at: "2026-09-08T00:00:00Z" }, error: null },
      { data: [{ id: "share-1" }], error: null },
      { data: null, error: null },
    ];
    const res = await POST(post(body));
    return { res, body: await res.json() };
  }

  const REAL_COLUMNS = new Set([
    "data_room_id",
    "account_id",
    "token",
    "investor_name",
    "investor_email",
    "investor_firm",
    "investor_type",
    "access_level",
    "sections_allowed",
    "nda_required",
    "password_hash",
    "is_active",
    "expires_at",
    "revoked_at",
  ]);

  it("writes only real data_room_access_tokens columns — the phantom-column 500 regression", async () => {
    await mint();
    const ins = state.inserts.find((i) => i.table === "data_room_access_tokens");
    expect(ins, "no share row inserted").toBeTruthy();
    for (const key of Object.keys(ins!.payload)) {
      expect(REAL_COLUMNS.has(key), `phantom column "${key}"`).toBe(true);
    }
  });

  it("never writes to data_rooms columns that do not exist (title/email/token/view_count)", async () => {
    await mint();
    const roomWrites = [
      ...state.inserts.filter((i) => i.table === "data_rooms"),
      ...state.updates.filter((u) => u.table === "data_rooms"),
    ];
    for (const w of roomWrites) {
      for (const key of Object.keys(w.payload)) {
        expect(["investor_count", "updated_at"]).toContain(key);
      }
    }
  });

  it("binds the link to the caller's account and the resolved room", async () => {
    await mint();
    const ins = state.inserts.find((i) => i.table === "data_room_access_tokens")!;
    expect(ins.payload.account_id).toBe("u-1");
    expect(ins.payload.data_room_id).toBe("room-1");
    expect(ins.payload.is_active).toBe(true);
    expect(ins.payload.access_level).toBe("view");
  });

  it("mints a 32-char base64url token, different every call", async () => {
    const a = await mint();
    const first = state.inserts.find((i) => i.table === "data_room_access_tokens")!.payload.token;
    state = fresh();
    const b = await mint();
    const second = state.inserts.find((i) => i.table === "data_room_access_tokens")!.payload.token;
    expect(String(first)).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(second).not.toBe(first);
    expect(a.body.token).toBe(first);
    expect(b.body.token).toBe(second);
  });

  it("defaults to a 30-day expiry, and honours an explicit null for a non-expiring link", async () => {
    await mint();
    const withDefault = state.inserts.find((i) => i.table === "data_room_access_tokens")!.payload.expires_at;
    expect(typeof withDefault).toBe("string");
    state = fresh();
    await mint({ expiresInDays: null });
    expect(
      state.inserts.find((i) => i.table === "data_room_access_tokens")!.payload.expires_at,
    ).toBeNull();
  });

  it("trims and stores investor identity so the founder knows who has the link", async () => {
    await mint({ investorName: "  Jane Chen  ", investorEmail: "jane@vc.com", investorFirm: "Blackbird" });
    const p = state.inserts.find((i) => i.table === "data_room_access_tokens")!.payload;
    expect(p.investor_name).toBe("Jane Chen");
    expect(p.investor_email).toBe("jane@vc.com");
    expect(p.investor_firm).toBe("Blackbird");
  });

  it("blank investor fields become null, not empty strings", async () => {
    await mint({ investorName: "   " });
    const p = state.inserts.find((i) => i.table === "data_room_access_tokens")!.payload;
    expect(p.investor_name).toBeNull();
  });

  it("returns a rendered page URL, not the JSON endpoint — the old link handed investors raw JSON", async () => {
    const { body } = await mint();
    expect(body.url).toBe(`https://blockid.au/s/dr/${body.token}`);
    expect(body.url).not.toContain("/api/");
  });

  it("strips a trailing slash from NEXT_PUBLIC_SITE_URL so the share URL is not doubled", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au/";
    const { body } = await mint();
    expect(body.url).toBe(`https://blockid.au/s/dr/${body.token}`);
  });

  it("still succeeds when the investor_count bump fails — the link already exists", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(USER);
    mocks.getSupabaseAdminMock.mockReturnValue(makeSupabase());
    state.replies = [
      { data: ROOM, error: null },
      { data: { id: "share-1", created_at: "t" }, error: null },
      { data: null, error: { message: "boom" } },
      { data: null, error: { message: "boom" } },
    ];
    const res = await POST(post({}));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET", () => {
  it("307s a legacy ?token= link straight to the rendered page — before auth and before any DB read, so it is not an oracle", async () => {
    const res = await GET(get("?token=abc123"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://blockid.au/s/dr/abc123");
    expect(mocks.getCurrentUserMock).not.toHaveBeenCalled();
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("401s an anonymous listing request", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(get());
    expect(res.status).toBe(401);
  });

  it("lists the caller's links scoped on account_id, with state and view counts", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(USER);
    mocks.getSupabaseAdminMock.mockReturnValue(makeSupabase());
    state.replies = [
      {
        data: [
          {
            id: "s-1",
            token: "tok-active",
            data_room_id: "room-1",
            investor_name: "Jane",
            access_count: 4,
            is_active: true,
            revoked_at: null,
            expires_at: "2099-01-01T00:00:00Z",
            last_accessed: "2026-09-07T00:00:00Z",
          },
          {
            id: "s-2",
            token: "tok-revoked",
            data_room_id: "room-1",
            access_count: 0,
            is_active: false,
            revoked_at: "2026-09-01T00:00:00Z",
          },
          {
            id: "s-3",
            token: "tok-expired",
            data_room_id: "room-1",
            access_count: 9,
            is_active: true,
            expires_at: "2020-01-01T00:00:00Z",
          },
        ],
        error: null,
      },
    ];
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(state.eq).toContainEqual({
      table: "data_room_access_tokens",
      col: "account_id",
      val: "u-1",
    });
    expect(body.links.map((l: { state: string }) => l.state)).toEqual([
      "active",
      "revoked",
      "expired",
    ]);
    expect(body.links[0].views).toBe(4);
    expect(body.links[0].url).toBe("https://blockid.au/s/dr/tok-active");
  });

  it("returns an empty list rather than 500ing when the founder has never shared", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(USER);
    mocks.getSupabaseAdminMock.mockReturnValue(makeSupabase());
    state.replies = [{ data: null, error: null }];
    const body = await (await GET(get())).json();
    expect(body).toEqual({ ok: true, links: [] });
  });
});

// ---------------------------------------------------------------------------
// DELETE — revocation
// ---------------------------------------------------------------------------

describe("DELETE — revoke", () => {
  it("400s without a token", async () => {
    const res = await DELETE(del());
    expect(res.status).toBe(400);
  });

  it("401s an anonymous caller", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await DELETE(del("?token=abc"));
    expect(res.status).toBe(401);
  });

  it("sets is_active=false AND revoked_at, scoped to the caller's account", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(USER);
    mocks.getSupabaseAdminMock.mockReturnValue(makeSupabase());
    state.replies = [{ data: { id: "s-1" }, error: null }];
    const res = await DELETE(del("?token=tok-1"));
    expect(res.status).toBe(200);
    const upd = state.updates.find((u) => u.table === "data_room_access_tokens")!;
    expect(upd.payload.is_active).toBe(false);
    expect(typeof upd.payload.revoked_at).toBe("string");
    expect(state.eq).toContainEqual({
      table: "data_room_access_tokens",
      col: "account_id",
      val: "u-1",
    });
    expect(state.eq).toContainEqual({
      table: "data_room_access_tokens",
      col: "token",
      val: "tok-1",
    });
  });

  it("404s for another founder's token exactly like a token that does not exist — no existence oracle", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(USER);
    mocks.getSupabaseAdminMock.mockReturnValue(makeSupabase());
    state.replies = [{ data: null, error: null }];
    const res = await DELETE(del("?token=not-mine"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  it("500s on a database error rather than reporting a revoke that did not happen", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(USER);
    mocks.getSupabaseAdminMock.mockReturnValue(makeSupabase());
    state.replies = [{ data: null, error: { message: "boom" } }];
    const res = await DELETE(del("?token=tok-1"));
    expect(res.status).toBe(500);
  });
});
