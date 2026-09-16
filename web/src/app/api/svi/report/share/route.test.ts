// POST /api/svi/report/share — Wave 25A mint + G14-S33 `tbr_share_created`.
//
// Pins: 401 without a session, 404 without an account / snapshot, the
// idempotent branch (existing token returned, NO new mint, NO analytics
// event, NO notification), and a first mint (24-char token written, one
// notification, one server-side tbr_share_created with the project scope).

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  account: null as { id: string } | null,
  snapshot: null as { id: string; report_share_token: string | null } | null,
  updates: [] as Array<{ table: string; row: Record<string, unknown>; id: string }>,
  notifications: [] as unknown[],
  emits: [] as Array<{ name: string; params: Record<string, unknown>; userId?: string | null }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/audit/api-route", () => ({ apiRoute: (_m: unknown, fn: unknown) => fn }));
vi.mock("@/lib/notifications", () => ({ insertNotification: async (n: unknown) => { mocks.notifications.push(n); } }));
vi.mock("@/lib/analytics/server", () => ({ emitEventSafe: (i: { name: string; params: Record<string, unknown>; userId?: string | null }) => { mocks.emits.push(i); } }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {};
      let updateRow: Record<string, unknown> | null = null;
      const self = () => chain;
      chain.select = self;
      chain.eq = (col: string, v: string) => {
        if (updateRow && col === "id") {
          mocks.updates.push({ table, row: updateRow, id: v });
          return Promise.resolve({ error: null });
        }
        return chain;
      };
      chain.order = self;
      chain.limit = self;
      chain.update = (row: Record<string, unknown>) => {
        updateRow = row;
        return chain;
      };
      chain.maybeSingle = async () => {
        if (table === "svi_accounts") return { data: mocks.account, error: null };
        if (table === "svi_snapshots") return { data: mocks.snapshot, error: null };
        return { data: null, error: null };
      };
      return chain;
    },
  }),
}));

import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://x/api/svi/report/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  mocks.user = { id: "u-1", email: "f@example.com" };
  mocks.account = { id: "acc-1" };
  mocks.snapshot = { id: "snap-1", report_share_token: null };
  mocks.updates.length = 0;
  mocks.notifications.length = 0;
  mocks.emits.length = 0;
});

describe("POST /api/svi/report/share", () => {
  it("401 without a session; 400 without projectId; 404 without an account or snapshot", async () => {
    mocks.user = null;
    expect((await POST(req({ projectId: "p-1" }))).status).toBe(401);
    mocks.user = { id: "u-1", email: "f@example.com" };
    expect((await POST(req({}))).status).toBe(400);
    mocks.account = null;
    expect((await POST(req({ projectId: "p-1" }))).status).toBe(404);
    mocks.account = { id: "acc-1" };
    mocks.snapshot = null;
    expect((await POST(req({ projectId: "p-1" }))).status).toBe(404);
    expect(mocks.emits).toHaveLength(0);
  });

  it("first mint: writes a 24-char token, one notification, one tbr_share_created (scope=project)", async () => {
    const res = await POST(req({ projectId: "p-1" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; token: string; url: string; alreadyShared?: boolean };
    expect(body.ok).toBe(true);
    expect(body.token).toHaveLength(24);
    expect(body.url).toMatch(new RegExp(`/tbr/${body.token}$`));
    expect(body.alreadyShared).toBeUndefined();
    expect(mocks.updates).toEqual([{ table: "svi_snapshots", row: { report_share_token: body.token }, id: "snap-1" }]);
    expect(mocks.notifications).toHaveLength(1);
    expect(mocks.emits).toEqual([{ name: "tbr_share_created", params: { project_scope: "project", user_id: "u-1" }, userId: "u-1", source: "server", consentGranted: true }]);
  });

  it("default scope is carried on the event", async () => {
    await POST(req({ projectId: "default" }));
    expect(mocks.emits[0]?.params).toEqual({ project_scope: "default", user_id: "u-1" });
  });

  it("idempotent: an existing token is returned with alreadyShared and NO mint / notification / event", async () => {
    mocks.snapshot = { id: "snap-1", report_share_token: "existing-token-abc" };
    const res = await POST(req({ projectId: "p-1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, token: "existing-token-abc", alreadyShared: true });
    expect(mocks.updates).toHaveLength(0);
    expect(mocks.notifications).toHaveLength(0);
    expect(mocks.emits).toHaveLength(0);
  });
});
