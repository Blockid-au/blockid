// Unit tests for GET /api/notifications — P9-notifications-route-test.
//
// Route serves the workspace notification bell dropdown. Four exit paths:
//   1. anonymous → 401 { error: "Unauthorized" }
//   2. supabase unconfigured → 200 { notifications: [], unreadCount: 0 }
//   3. db returns null data → 200 { notifications: [], unreadCount: 0 }
//   4. happy path → 200 { notifications: rows, unreadCount: <filter !read> }
//
// Silent regressions this pins against:
//   - dropping the auth gate and leaking notifications across users (the
//     .eq("user_id", user.id) filter is the ONLY tenancy boundary here);
//   - swapping .order(desc) for asc and rendering the oldest notifications
//     first in the bell dropdown;
//   - dropping .limit(20) and streaming an unbounded payload back;
//   - counting all notifications as "unread" (drops the !n.read filter);
//   - narrowing the SELECT and breaking the bell UI's title/body render.

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

import { GET, dynamic } from "./route";

interface FakeRow {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

interface FakeState {
  data: FakeRow[] | null;
  table: string | null;
  selectCols: string | null;
  eqCol: string | null;
  eqVal: unknown;
  orderCol: string | null;
  orderOpts: { ascending?: boolean } | null;
  limitN: number | null;
  fromCalls: number;
  selectCalls: number;
  eqCalls: number;
  orderCalls: number;
  limitCalls: number;
}

const state: FakeState = {
  data: [],
  table: null,
  selectCols: null,
  eqCol: null,
  eqVal: null,
  orderCol: null,
  orderOpts: null,
  limitN: null,
  fromCalls: 0,
  selectCalls: 0,
  eqCalls: 0,
  orderCalls: 0,
  limitCalls: 0,
};

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls += 1;
      state.table = table;
      return {
        select(cols: string) {
          state.selectCalls += 1;
          state.selectCols = cols;
          return {
            eq(col: string, val: unknown) {
              state.eqCalls += 1;
              state.eqCol = col;
              state.eqVal = val;
              return {
                order(col2: string, opts?: { ascending?: boolean }) {
                  state.orderCalls += 1;
                  state.orderCol = col2;
                  state.orderOpts = opts ?? null;
                  return {
                    limit(n: number) {
                      state.limitCalls += 1;
                      state.limitN = n;
                      return Promise.resolve({ data: state.data });
                    },
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

function resetState() {
  state.data = [];
  state.table = null;
  state.selectCols = null;
  state.eqCol = null;
  state.eqVal = null;
  state.orderCol = null;
  state.orderOpts = null;
  state.limitN = null;
  state.fromCalls = 0;
  state.selectCalls = 0;
  state.eqCalls = 0;
  state.orderCalls = 0;
  state.limitCalls = 0;
}

function row(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    id: "n1",
    type: "system",
    title: "Hello",
    body: "Body copy",
    read: false,
    created_at: "2026-08-07T00:00:00Z",
    ...overrides,
  };
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

describe("GET /api/notifications — dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-user results never prerender', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/notifications — anonymous branch", () => {
  it("returns 401 { error: 'Unauthorized' } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("does NOT touch supabase on the anonymous branch (guard short-circuits before isSupabaseConfigured / getSupabaseAdmin)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(isSupabaseConfiguredMock).not.toHaveBeenCalled();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
  });
});

describe("GET /api/notifications — supabase-unconfigured branch", () => {
  it("returns 200 { notifications: [], unreadCount: 0 } when isSupabaseConfigured() is false", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ notifications: [], unreadCount: 0 });
  });

  it("does NOT call getSupabaseAdmin() when the env is unconfigured (avoids constructing an admin client with no service key)", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    await GET();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
  });

  it("does NOT throw or 500 on the unconfigured branch (bell UI silently degrades to empty)", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("GET /api/notifications — happy path", () => {
  it("returns 200 { notifications, unreadCount } on a clean fetch", async () => {
    state.data = [
      row({ id: "n1", read: false }),
      row({ id: "n2", read: true }),
      row({ id: "n3", read: false }),
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications).toHaveLength(3);
    expect(body.unreadCount).toBe(2);
  });

  it("queries the notifications table (not a rename like notification or user_notifications)", async () => {
    await GET();
    expect(state.table).toBe("notifications");
  });

  it("selects exactly the 6 bell-dropdown columns (widening bloats the payload; narrowing breaks title/body render)", async () => {
    await GET();
    expect(state.selectCols).toBe("id, type, title, body, read, created_at");
  });

  it("filters by user_id = current user (the ONLY tenancy boundary — dropping this leaks notifications across founders)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-42",
      email: "f@x.com",
    });
    await GET();
    expect(state.eqCol).toBe("user_id");
    expect(state.eqVal).toBe("founder-42");
  });

  it("orders by created_at descending so the newest notification is first in the bell dropdown", async () => {
    await GET();
    expect(state.orderCol).toBe("created_at");
    expect(state.orderOpts).toEqual({ ascending: false });
  });

  it("caps the result at 20 rows (page-size contract for the bell dropdown)", async () => {
    await GET();
    expect(state.limitN).toBe(20);
  });

  it("makes exactly one from/select/eq/order/limit chain (no wasted round-trip)", async () => {
    await GET();
    expect(state.fromCalls).toBe(1);
    expect(state.selectCalls).toBe(1);
    expect(state.eqCalls).toBe(1);
    expect(state.orderCalls).toBe(1);
    expect(state.limitCalls).toBe(1);
  });

  it("returns rows verbatim (no server-side transform or field renaming)", async () => {
    state.data = [
      row({
        id: "n9",
        type: "billing",
        title: "Invoice #42",
        body: "A$149 charged",
        read: false,
        created_at: "2026-08-06T12:34:56Z",
      }),
    ];
    const body = await (await GET()).json();
    expect(body.notifications[0]).toEqual(state.data[0]);
  });

  it("computes unreadCount as the count of !read rows (not all rows — that would falsely show every read notification as unseen)", async () => {
    state.data = [
      row({ id: "n1", read: false }),
      row({ id: "n2", read: false }),
      row({ id: "n3", read: false }),
      row({ id: "n4", read: true }),
      row({ id: "n5", read: true }),
    ];
    const body = await (await GET()).json();
    expect(body.notifications).toHaveLength(5);
    expect(body.unreadCount).toBe(3);
  });

  it("unreadCount is 0 when every notification is read", async () => {
    state.data = [
      row({ id: "n1", read: true }),
      row({ id: "n2", read: true }),
    ];
    const body = await (await GET()).json();
    expect(body.unreadCount).toBe(0);
  });

  it("unreadCount equals notifications.length when every notification is unread", async () => {
    state.data = [
      row({ id: "n1", read: false }),
      row({ id: "n2", read: false }),
      row({ id: "n3", read: false }),
    ];
    const body = await (await GET()).json();
    expect(body.unreadCount).toBe(body.notifications.length);
    expect(body.unreadCount).toBe(3);
  });

  it("returns { notifications: [], unreadCount: 0 } when supabase yields no rows for the caller", async () => {
    state.data = [];
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ notifications: [], unreadCount: 0 });
  });

  it("coerces a null data payload to [] and unreadCount 0 (bell UI expects an array + number)", async () => {
    state.data = null;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ notifications: [], unreadCount: 0 });
  });

  it("treats falsy `read` values (undefined) as unread — matches the !n.read semantics in the route", async () => {
    // A row shipped without the read column entirely (pre-migration row) still
    // counts as unread so the founder sees it. Pins the `!` guard vs a strict
    // `n.read === false`.
    state.data = [
      { ...row({ id: "n1", read: false }), read: undefined as unknown as boolean },
      row({ id: "n2", read: true }),
    ];
    const body = await (await GET()).json();
    expect(body.unreadCount).toBe(1);
  });
});

describe("GET /api/notifications — response envelope", () => {
  it("anonymous body carries `error` and no `notifications` key", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const body = await (await GET()).json();
    expect(body.error).toBe("Unauthorized");
    expect(body.notifications).toBeUndefined();
    expect(body.unreadCount).toBeUndefined();
  });

  it("authenticated body carries `notifications` + `unreadCount` and no `error` key", async () => {
    state.data = [row({ id: "n1", read: false })];
    const body = await (await GET()).json();
    expect(body.notifications).toBeDefined();
    expect(body.unreadCount).toBeDefined();
    expect(body.error).toBeUndefined();
  });
});
