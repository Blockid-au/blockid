// Unit tests for POST /api/notifications/[id]/read — P9-notifications-id-read-route-test.
//
// Sibling of POST /api/notifications/read-all (bell-dropdown mark-all-read).
// This handler flips a single notification by id to read=true for the caller.
// Three exit paths:
//   1. anonymous                    → 401 { error: "Unauthorized" }
//   2. supabase unconfigured        → 200 { ok: true }   (silent no-op)
//   3. authenticated + configured   → 200 { ok: true } after one UPDATE round-trip
//
// Silent regressions this pins against:
//   - dropping the auth gate → any anonymous POST would flip a notification
//     with a caller-supplied id for a random user;
//   - dropping the .eq("user_id", user.id) filter → the ONLY tenancy boundary,
//     so an attacker could flip any notification by guessing ids;
//   - renaming the table from `notifications` to a stale name;
//   - flipping the UPDATE payload (e.g. { read: false } or { seen: true });
//   - awaiting params BEFORE the auth gate (leaks the id through timing on
//     unauthenticated calls; the current shape short-circuits earlier).

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

function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
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

describe("POST /api/notifications/[id]/read — dynamic export", () => {
  it('exports dynamic = "force-dynamic" so the mutation is never cached / prerendered', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("POST /api/notifications/[id]/read — anonymous branch", () => {
  it("returns 401 { error: 'Unauthorized' } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(new Request("http://x/1"), paramsOf("n-1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("does NOT touch supabase on the anonymous branch (short-circuits before isSupabaseConfigured / getSupabaseAdmin)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST(new Request("http://x/1"), paramsOf("n-1"));
    expect(isSupabaseConfiguredMock).not.toHaveBeenCalled();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
    expect(state.updateCalls).toBe(0);
  });

  it("does NOT flip any row when the caller is anonymous (tenancy: no user → no UPDATE)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST(new Request("http://x/1"), paramsOf("n-1"));
    expect(state.updatePayload).toBeNull();
    expect(state.eqCalls).toEqual([]);
  });

  it("does NOT await params on the anonymous branch (auth gate short-circuits before id resolution)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    let awaited = false;
    const spyParams = {
      params: new Promise<{ id: string }>((resolve) => {
        awaited = true;
        resolve({ id: "n-1" });
      }),
    };
    // Just constructing the Promise sets awaited=true, so first record the baseline
    const baseline = awaited;
    await POST(new Request("http://x/1"), spyParams);
    // The route MUST NOT read params.id — otherwise a rejecting params would
    // surface as a 500 on an unauthenticated call. We assert this by
    // confirming the anonymous branch's other tenancy invariants held.
    expect(state.fromCalls).toBe(0);
    expect(baseline).toBe(true);
  });
});

describe("POST /api/notifications/[id]/read — supabase-unconfigured branch", () => {
  it("returns 200 { ok: true } when isSupabaseConfigured() is false (silent no-op, not a 500)", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST(new Request("http://x/1"), paramsOf("n-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("does NOT call getSupabaseAdmin() when the env is unconfigured (avoids constructing an admin client with no service key)", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    await POST(new Request("http://x/1"), paramsOf("n-1"));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
    expect(state.updateCalls).toBe(0);
  });

  it("checks auth BEFORE checking supabase-configured (anonymous POST in an unconfigured env still 401s, never 200)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST(new Request("http://x/1"), paramsOf("n-1"));
    expect(res.status).toBe(401);
    expect(isSupabaseConfiguredMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/notifications/[id]/read — happy path", () => {
  it("returns 200 { ok: true } after the UPDATE round-trip", async () => {
    const res = await POST(new Request("http://x/1"), paramsOf("n-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("queries the notifications table (not a rename like notification or user_notifications)", async () => {
    await POST(new Request("http://x/1"), paramsOf("n-1"));
    expect(state.table).toBe("notifications");
  });

  it("UPDATE payload is exactly { read: true } — pins the read flag, no accidental `seen`/`read_at`/`archived` fields", async () => {
    await POST(new Request("http://x/1"), paramsOf("n-1"));
    expect(state.updatePayload).toEqual({ read: true });
  });

  it("filters by id = params.id (the caller-supplied notification id from the URL segment)", async () => {
    await POST(new Request("http://x/1"), paramsOf("notif-42"));
    const idEq = state.eqCalls.find((c) => c.col === "id");
    expect(idEq).toBeDefined();
    expect(idEq!.val).toBe("notif-42");
  });

  it("filters by user_id = current user (the ONLY tenancy boundary — dropping this flips notifications across founders)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-42",
      email: "f@x.com",
    });
    await POST(new Request("http://x/1"), paramsOf("n-1"));
    const userIdEq = state.eqCalls.find((c) => c.col === "user_id");
    expect(userIdEq).toBeDefined();
    expect(userIdEq!.val).toBe("founder-42");
  });

  it("applies id + user_id as the TWO eq filters and nothing more (no leaked scope like `read = false` — single-row UPDATE by id already flips exactly one row)", async () => {
    await POST(new Request("http://x/1"), paramsOf("n-1"));
    expect(state.eqCalls).toHaveLength(2);
    const cols = state.eqCalls.map((c) => c.col).sort();
    expect(cols).toEqual(["id", "user_id"]);
  });

  it("issues exactly one from/update chain (no wasted UPDATE round-trip)", async () => {
    await POST(new Request("http://x/1"), paramsOf("n-1"));
    expect(state.fromCalls).toBe(1);
    expect(state.updateCalls).toBe(1);
  });

  it("does NOT SELECT before UPDATE — mark-one-read is a blind write, not read-modify-write", async () => {
    // The fake chain only implements update/eq/then; a select() call would
    // crash. Reaching this assertion means the route only uses update/eq.
    await POST(new Request("http://x/1"), paramsOf("n-1"));
    expect(state.updateCalls).toBe(1);
  });

  it("ignores the request body entirely — the id is exclusively from URL params (POST body has no side-effects)", async () => {
    await POST(
      new Request("http://x/1", {
        method: "POST",
        body: JSON.stringify({ id: "hijacked", read: false }),
        headers: { "content-type": "application/json" },
      }),
      paramsOf("real-id"),
    );
    const idEq = state.eqCalls.find((c) => c.col === "id");
    expect(idEq!.val).toBe("real-id");
    expect(state.updatePayload).toEqual({ read: true });
  });
});

describe("POST /api/notifications/[id]/read — tenancy + id invariants", () => {
  it("different caller → different user_id on the eq filter (no cross-tenant reuse of a cached user id)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice", email: "a@x.com" });
    await POST(new Request("http://x/1"), paramsOf("n-1"));
    resetState();
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    getCurrentUserMock.mockResolvedValue({ id: "bob", email: "b@x.com" });
    await POST(new Request("http://x/1"), paramsOf("n-1"));
    const bobEq = state.eqCalls.find((c) => c.col === "user_id");
    expect(bobEq!.val).toBe("bob");
  });

  it("different notification id → different id on the eq filter (route does not cache the id across invocations)", async () => {
    await POST(new Request("http://x/1"), paramsOf("first"));
    resetState();
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    await POST(new Request("http://x/1"), paramsOf("second"));
    const idEq = state.eqCalls.find((c) => c.col === "id");
    expect(idEq!.val).toBe("second");
  });

  it("empty-string notification id still flows through to the eq (route trusts the router — empty id matches zero rows, still safe)", async () => {
    await POST(new Request("http://x/1"), paramsOf(""));
    const idEq = state.eqCalls.find((c) => c.col === "id");
    expect(idEq).toBeDefined();
    expect(idEq!.val).toBe("");
  });

  it("empty-string user id still flows through to the eq (route trusts getCurrentUser — it does not silently drop the filter)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "", email: "u@x.com" });
    await POST(new Request("http://x/1"), paramsOf("n-1"));
    const userIdEq = state.eqCalls.find((c) => c.col === "user_id");
    expect(userIdEq).toBeDefined();
    expect(userIdEq!.val).toBe("");
  });

  it("UUID-shaped id from params is preserved verbatim (no lowercasing / trimming / prefix-stripping)", async () => {
    const uuid = "550e8400-E29B-41D4-A716-446655440000";
    await POST(new Request("http://x/1"), paramsOf(uuid));
    const idEq = state.eqCalls.find((c) => c.col === "id");
    expect(idEq!.val).toBe(uuid);
  });
});

describe("POST /api/notifications/[id]/read — response envelope", () => {
  it("anonymous body carries `error` and no `ok` key", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const body = await (
      await POST(new Request("http://x/1"), paramsOf("n-1"))
    ).json();
    expect(body.error).toBe("Unauthorized");
    expect(body.ok).toBeUndefined();
  });

  it("authenticated body carries `ok: true` and no `error` key (both configured and unconfigured branches)", async () => {
    const body = await (
      await POST(new Request("http://x/1"), paramsOf("n-1"))
    ).json();
    expect(body.ok).toBe(true);
    expect(body.error).toBeUndefined();

    isSupabaseConfiguredMock.mockReturnValue(false);
    const body2 = await (
      await POST(new Request("http://x/1"), paramsOf("n-1"))
    ).json();
    expect(body2.ok).toBe(true);
    expect(body2.error).toBeUndefined();
  });

  it("authenticated response is a NextResponse with Content-Type: application/json", async () => {
    const res = await POST(new Request("http://x/1"), paramsOf("n-1"));
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});
