// Colocated vitest for GET /api/founder-notifications.
// Pins (T0245): the `?kind=` allow-list covers EVERY registered
// NotificationKind — a kind a writer can insert must be filterable — and
// the count_only / unread_only shapes the nav bell + feed rely on.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOTIFICATION_KINDS } from "@/lib/notification-kinds";

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  calls: [] as Array<{ table: string; ops: string[] }>,
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      const call = { table, ops: [] as string[] };
      state.calls.push(call);
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "eq", "is", "order", "limit"]) {
        chain[op] = (...args: unknown[]) => {
          call.ops.push(`${op}(${args.map((a) => JSON.stringify(a)).join(",")})`);
          return chain;
        };
      }
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 7 });
      return chain;
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/founder-notifications", () => {
  beforeEach(() => {
    state.user = { id: "u1" };
    state.calls = [];
  });

  it("401 when signed out", async () => {
    state.user = null;
    expect((await GET(new Request("http://x/api/founder-notifications"))).status).toBe(401);
  });

  it("count_only returns the unread count scoped to the user", async () => {
    const r = await GET(new Request("http://x/api/founder-notifications?count_only=1"));
    expect(await r.json()).toEqual({ ok: true, unread_count: 7 });
    expect(state.calls[0].ops).toEqual(expect.arrayContaining(['eq("user_id","u1")', 'is("read_at",null)']));
  });

  it("KNOWN_KINDS ⊇ NOTIFICATION_KINDS — every registered kind is an accepted ?kind= filter", async () => {
    for (const kind of NOTIFICATION_KINDS) {
      state.calls = [];
      await GET(new Request(`http://x/api/founder-notifications?count_only=1&kind=${kind}`));
      expect(state.calls[0].ops, kind).toContain(`eq("kind",${JSON.stringify(kind)})`);
    }
  });

  it("an unknown kind is ignored rather than filtered", async () => {
    await GET(new Request("http://x/api/founder-notifications?count_only=1&kind=bogus"));
    expect(state.calls[0].ops.some((o) => o.startsWith('eq("kind"'))).toBe(false);
  });

  it("list mode returns rows + unread_count and honours unread_only", async () => {
    const r = await GET(new Request("http://x/api/founder-notifications?unread_only=1&limit=5"));
    const body = await r.json();
    expect(body).toEqual({ ok: true, notifications: [], unread_count: 7 });
    expect(state.calls[0].ops).toEqual(expect.arrayContaining(['is("read_at",null)', "limit(5)"]));
  });
});
