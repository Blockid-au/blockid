// Unit tests for POST /api/notifications/read-all — P9-notifications-read-all-route-test.
//
// Sibling of GET /api/notifications (bell dropdown). This handler is what
// fires when a founder clicks "Mark all as read" — it flips every unread
// notification for the caller to read=true in a single UPDATE. Three exit
// paths:
//   1. anonymous                    → 401 { error: "Unauthorized" }
//   2. supabase unconfigured        → 200 { ok: true }   (silent no-op)
//   3. authenticated + configured   → 200 { ok: true } after one UPDATE round-trip
//
// Silent regressions this pins against:
//   - dropping the auth gate → any anonymous POST would flip rows for a
//     random user_id (the .eq("user_id", user.id) filter is the ONLY tenancy
//     boundary here);
//   - dropping the .eq("read", false) filter → UPDATE fans out over every row
//     (already-read notifications too), thrashing indexes and rewriting rows
//     the founder never actually saw;
//   - renaming the table from `notifications` to a stale name;
//   - flipping the UPDATE payload (e.g. { read: false } or { seen: true })
//     which would silently break the bell dropdown's unreadCount.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
const isSupabaseConfiguredMock = vi.fn<() => boolean>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
}));

import { POST, dynamic } from "./route";

interface FakeState {
  table: string | null;
  updatePayload: Record<string, unknown> | null;
  eqCalls: Array<{ col: string; val: unknown }>;
  fromCalls: number;
  updateCalls: number;
}

const state: FakeState = {
  table: null,
  updatePayload: null,
  eqCalls: [],
  fromCalls: 0,
  updateCalls: 0,
};

function makeFakeSupabase() {
  const chain = {
    update(payload: Record<string, unknown>) {
      state.updateCalls += 1;
      state.updatePayload = payload;
      return chain;
    },
    eq(col: string, val: unknown) {
      state.eqCalls.push({ col, val });
      // The second .eq resolves the awaited chain — mimic supabase-js which
      // returns a Thenable at every builder step. Both eq calls must be safe
      // to `await`, but only the terminal one is awaited by the route.
      return chain;
    },
    then(resolve: (v: { data: null; error: null }) => unknown) {
      return Promise.resolve({ data: null, error: null }).then(resolve);
    },
  };
  return {
    from(table: string) {
      state.fromCalls += 1;
      state.table = table;
      return chain;
    },
  };
}

function resetState() {
  state.table = null;
  state.updatePayload = null;
  state.eqCalls = [];
  state.fromCalls = 0;
  state.updateCalls = 0;
}

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  isSupabaseConfiguredMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.com" });
  isSupabaseConfiguredMock.mockReturnValue(true);
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
});

describe("POST /api/notifications/read-all — dynamic export", () => {
  it('exports dynamic = "force-dynamic" so the mutation is never cached / prerendered', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("POST /api/notifications/read-all — anonymous branch", () => {
  it("returns 401 { error: 'Unauthorized' } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("does NOT touch supabase on the anonymous branch (guard short-circuits before isSupabaseConfigured / getSupabaseAdmin)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST();
    expect(isSupabaseConfiguredMock).not.toHaveBeenCalled();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
    expect(state.updateCalls).toBe(0);
  });

  it("does NOT flip any rows when the caller is anonymous (tenancy: no user → no UPDATE)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST();
    expect(state.updatePayload).toBeNull();
    expect(state.eqCalls).toEqual([]);
  });
});

describe("POST /api/notifications/read-all — supabase-unconfigured branch", () => {
  it("returns 200 { ok: true } when isSupabaseConfigured() is false (silent no-op, not a 500)", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("does NOT call getSupabaseAdmin() when the env is unconfigured (avoids constructing an admin client with no service key)", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    await POST();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
    expect(state.updateCalls).toBe(0);
  });

  it("checks auth BEFORE checking supabase-configured (an anonymous POST in an unconfigured env still 401s, never 200)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(isSupabaseConfiguredMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/notifications/read-all — happy path", () => {
  it("returns 200 { ok: true } after the UPDATE round-trip", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("queries the notifications table (not a rename like notification or user_notifications)", async () => {
    await POST();
    expect(state.table).toBe("notifications");
  });

  it("UPDATE payload is exactly { read: true } — pins the read flag, no accidental `seen`/`read_at`/`archived` fields", async () => {
    await POST();
    expect(state.updatePayload).toEqual({ read: true });
  });

  it("filters by user_id = current user (the ONLY tenancy boundary — dropping this flips notifications across founders)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-42",
      email: "f@x.com",
    });
    await POST();
    const userIdEq = state.eqCalls.find((c) => c.col === "user_id");
    expect(userIdEq).toBeDefined();
    expect(userIdEq!.val).toBe("founder-42");
  });

  it("filters by read = false so already-read rows are NOT re-written (index-thrash guard)", async () => {
    await POST();
    const readEq = state.eqCalls.find((c) => c.col === "read");
    expect(readEq).toBeDefined();
    expect(readEq!.val).toBe(false);
  });

  it("applies user_id + read as the TWO eq filters and nothing more (no leaked scope like `type = X`)", async () => {
    await POST();
    expect(state.eqCalls).toHaveLength(2);
    const cols = state.eqCalls.map((c) => c.col).sort();
    expect(cols).toEqual(["read", "user_id"]);
  });

  it("issues exactly one from/update chain (no wasted UPDATE round-trip)", async () => {
    await POST();
    expect(state.fromCalls).toBe(1);
    expect(state.updateCalls).toBe(1);
  });

  it("does NOT SELECT before UPDATE — mark-all-read is a blind write, not read-modify-write", async () => {
    // If someone refactors this to fetch-then-update we'd see two round-trips
    // and the pattern below (no select() on the chain) would need updating.
    await POST();
    // The fake chain only implements update/eq/then; a select() call would
    // crash. Reaching this assertion means the route only uses update/eq.
    expect(state.updateCalls).toBe(1);
  });
});

describe("POST /api/notifications/read-all — tenancy invariants", () => {
  it("different caller → different user_id on the eq filter (no cross-tenant reuse of a cached user id)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice", email: "a@x.com" });
    await POST();
    resetState();
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getCurrentUserMock.mockResolvedValue({ id: "bob", email: "b@x.com" });
    await POST();
    const bobEq = state.eqCalls.find((c) => c.col === "user_id");
    expect(bobEq!.val).toBe("bob");
  });

  it("empty-string user id still flows through to the eq (route trusts getCurrentUser — it does not silently drop the filter)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "", email: "u@x.com" });
    await POST();
    // The route treats empty-string as "authed" (only null/undefined bail).
    // What matters is the filter is still applied — an empty user_id
    // filter matches zero rows, which is safe. Dropping the filter would be
    // catastrophic.
    const userIdEq = state.eqCalls.find((c) => c.col === "user_id");
    expect(userIdEq).toBeDefined();
    expect(userIdEq!.val).toBe("");
  });
});

describe("POST /api/notifications/read-all — response envelope", () => {
  it("anonymous body carries `error` and no `ok` key", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const body = await (await POST()).json();
    expect(body.error).toBe("Unauthorized");
    expect(body.ok).toBeUndefined();
  });

  it("authenticated body carries `ok: true` and no `error` key (both the configured and unconfigured branches)", async () => {
    const body = await (await POST()).json();
    expect(body.ok).toBe(true);
    expect(body.error).toBeUndefined();

    isSupabaseConfiguredMock.mockReturnValue(false);
    const body2 = await (await POST()).json();
    expect(body2.ok).toBe(true);
    expect(body2.error).toBeUndefined();
  });
});
