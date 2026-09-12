// Colocated vitest for POST + GET /api/data-room/engage.
//
// POST is intentionally unauthenticated (r-03-exempt): the caller proves
// entitlement by holding a valid data_room_access_tokens row. GET is
// founder-facing and, since S21-A, authenticated + room-scoped.
//
// Silent regressions this pins:
//   - dropping the 503 branch when getSupabaseAdmin returns null;
//   - dropping the validation (`parseEngageEvent`): unknown event types,
//     over-long sections, out-of-range dwell must never reach the insert;
//   - dropping the .eq("token", ...) lookup / is_active / expires_at checks;
//   - dropping the 30 s dedupe so a looping client inflates the heatmap;
//   - hashing the FIRST x-forwarded-for hop (client-forgeable) instead of the
//     edge-observed one, or storing more than a 16-char salted prefix;
//   - dropping the eventType==="open" first_accessed stamp, the
//     .eq("id", accessToken.id) on the token update, or the rpc;
//   - GET without a session (the pre-S21-A IDOR), GET for a stranger's room,
//     dropping the .eq("data_room_id", roomId) on the events pull;
//   - the per-link × section heatmap disappearing from the GET envelope.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn<() => unknown | null>(),
  getCurrentUser: vi.fn<() => Promise<{ id: string; email: string } | null>>(),
  assertProjectScope: vi.fn<(...a: unknown[]) => Promise<{ role: string }>>(),
}));

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/projects", () => ({
  assertProjectScope: (...a: unknown[]) => mocks.assertProjectScope(...a),
  roleCanAdmin: (r: string) => r === "admin" || r === "owner",
  ProjectAccessError: class ProjectAccessError extends Error {
    code: string;
    constructor(msg: string, code: string) {
      super(msg);
      this.name = "ProjectAccessError";
      this.code = code;
    }
  },
}));

import { GET, POST } from "./route";

const TOKEN = "a".repeat(32);

interface Call {
  table: string;
  op: string;
  args: unknown[];
}

interface State {
  accessToken: Record<string, unknown> | null;
  lastEvent: { occurred_at: string | null } | null;
  events: Record<string, unknown>[] | null;
  room: Record<string, unknown> | null;
  links: Record<string, unknown>[];
  calls: Call[];
}

let state: State;

function fresh(): State {
  return { accessToken: null, lastEvent: null, events: null, room: null, links: [], calls: [] };
}

/** Chainable fake: every op is recorded; terminals resolve per-table state. */
function fakeSupabase() {
  function chain(table: string, ctx: { selecting?: boolean; write?: string }) {
    const proxy: Record<string, unknown> = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            const p = Promise.resolve(terminal(table, ctx, "list"));
            return p.then.bind(p);
          }
          if (prop === "maybeSingle" || prop === "single") {
            return () => {
              state.calls.push({ table, op: prop, args: [] });
              return Promise.resolve(terminal(table, ctx, "single"));
            };
          }
          return (...args: unknown[]) => {
            state.calls.push({ table, op: prop, args });
            if (prop === "insert" || prop === "update" || prop === "upsert") return chain(table, { ...ctx, write: prop });
            return proxy;
          };
        },
      },
    );
    return proxy;
  }
  function terminal(table: string, ctx: { write?: string }, mode: "list" | "single") {
    if (ctx.write) return { data: null, error: null };
    if (table === "data_room_access_tokens") {
      if (mode === "single") return { data: state.accessToken, error: null };
      return { data: state.links, error: null };
    }
    if (table === "data_room_engagement") {
      if (mode === "single") return { data: state.lastEvent, error: null };
      return { data: state.events, error: null };
    }
    if (table === "data_rooms") return { data: state.room, error: null };
    return { data: null, error: null };
  }
  return {
    from: (table: string) => chain(table, {}),
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.calls.push({ table: "rpc", op: fn, args: [args] });
      return Promise.resolve({ data: null, error: null });
    },
  };
}

const find = (table: string, op: string) => state.calls.filter((c) => c.table === table && c.op === op);
const hasEq = (table: string, col: string, val: unknown) =>
  state.calls.some((c) => c.table === table && c.op === "eq" && c.args[0] === col && c.args[1] === val);

function postReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new Request("http://localhost/api/data-room/engage", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

function getReq(roomId: string | null): NextRequest {
  const url = roomId
    ? `http://localhost/api/data-room/engage?roomId=${encodeURIComponent(roomId)}`
    : "http://localhost/api/data-room/engage";
  return new Request(url) as unknown as NextRequest;
}

const activeToken = () => ({ id: "tok-id", data_room_id: "room-1", is_active: true, expires_at: null });

beforeEach(() => {
  state = fresh();
  mocks.getSupabaseAdmin.mockReset();
  mocks.getSupabaseAdmin.mockReturnValue(fakeSupabase());
  mocks.getCurrentUser.mockReset();
  mocks.getCurrentUser.mockResolvedValue({ id: "user-owner", email: "owner@x.test" });
  mocks.assertProjectScope.mockReset();
  delete process.env.IP_HASH_SALT;
});

describe("POST /api/data-room/engage", () => {
  it("503s when getSupabaseAdmin returns null (db not configured)", async () => {
    mocks.getSupabaseAdmin.mockReturnValueOnce(null);
    const res = await POST(postReq({ token: TOKEN, eventType: "open" }));
    expect(res.status).toBe(503);
    expect(state.calls.length).toBe(0);
  });

  it("400s when token or eventType is missing, or the body is not JSON", async () => {
    expect((await POST(postReq({ eventType: "open" }))).status).toBe(400);
    expect((await POST(postReq({ token: TOKEN }))).status).toBe(400);
    expect((await POST(postReq("not json at all"))).status).toBe(400);
    expect(state.calls.length).toBe(0);
  });

  it("400s an unknown eventType and a section_view with no section (validation, S21-A)", async () => {
    const a = await POST(postReq({ token: TOKEN, eventType: "drop table" }));
    expect(a.status).toBe(400);
    expect((await a.json()).error).toContain("Unknown eventType");
    const b = await POST(postReq({ token: TOKEN, eventType: "section_view" }));
    expect(b.status).toBe(400);
    expect(state.calls.length).toBe(0);
  });

  it("403s when the token lookup returns no row / is revoked / is expired", async () => {
    state.accessToken = null;
    expect((await POST(postReq({ token: TOKEN, eventType: "open" }))).status).toBe(403);
    expect(hasEq("data_room_access_tokens", "token", TOKEN)).toBe(true);

    state.accessToken = { ...activeToken(), is_active: false };
    expect((await POST(postReq({ token: TOKEN, eventType: "open" }))).status).toBe(403);

    state.accessToken = { ...activeToken(), expires_at: new Date(Date.now() - 60_000).toISOString() };
    const res = await POST(postReq({ token: TOKEN, eventType: "open" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("expired");
    expect(find("data_room_engagement", "insert").length).toBe(0);
  });

  it("allows an active token with a null or future expires_at", async () => {
    state.accessToken = activeToken();
    expect((await POST(postReq({ token: TOKEN, eventType: "open" }))).status).toBe(200);
    state.accessToken = { ...activeToken(), expires_at: new Date(Date.now() + 60_000).toISOString() };
    expect((await POST(postReq({ token: TOKEN, eventType: "open" }))).status).toBe(200);
  });

  it("inserts a full engagement row with every optional field forwarded and clamped", async () => {
    state.accessToken = activeToken();
    await POST(
      postReq(
        {
          token: TOKEN,
          eventType: "section_view",
          section: "  3. Financial   Projections  ",
          documentName: "P&L",
          durationMs: 99_999_999, // clamped to an hour
          scrollPct: 140, // clamped to 100
        },
        { "user-agent": "Mozilla/5.0 Chrome/120" },
      ),
    );
    const ins = find("data_room_engagement", "insert")[0];
    expect(ins).toBeTruthy();
    expect(ins.args[0]).toMatchObject({
      data_room_id: "room-1",
      access_token_id: "tok-id",
      event_type: "section_view",
      section: "3. Financial Projections",
      document_name: "P&L",
      duration_ms: 60 * 60 * 1000,
      scroll_pct: 100,
      user_agent: "Mozilla/5.0 Chrome/120",
    });
  });

  it("nulls out optional insert fields when the body omits them", async () => {
    state.accessToken = activeToken();
    await POST(postReq({ token: TOKEN, eventType: "open" }));
    const ins = find("data_room_engagement", "insert")[0].args[0] as Record<string, unknown>;
    expect(ins.section).toBeNull();
    expect(ins.document_name).toBeNull();
    expect(ins.duration_ms).toBeNull();
    expect(ins.scroll_pct).toBeNull();
  });

  it("dedupes: a same (link, type, section, document) event inside 30 s is acknowledged, not inserted", async () => {
    state.accessToken = activeToken();
    state.lastEvent = { occurred_at: new Date(Date.now() - 5_000).toISOString() };
    const res = await POST(postReq({ token: TOKEN, eventType: "section_view", section: "Team" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deduped: true });
    expect(find("data_room_engagement", "insert").length).toBe(0);
    // The dedupe read was scoped to this link, type and section.
    expect(hasEq("data_room_engagement", "access_token_id", "tok-id")).toBe(true);
    expect(hasEq("data_room_engagement", "event_type", "section_view")).toBe(true);
    expect(hasEq("data_room_engagement", "section", "Team")).toBe(true);
  });

  it("does not dedupe once the window has passed, and never dedupes a download", async () => {
    state.accessToken = activeToken();
    state.lastEvent = { occurred_at: new Date(Date.now() - 31_000).toISOString() };
    await POST(postReq({ token: TOKEN, eventType: "section_view", section: "Team" }));
    expect(find("data_room_engagement", "insert").length).toBe(1);

    state.calls = [];
    state.lastEvent = { occurred_at: new Date().toISOString() };
    await POST(postReq({ token: TOKEN, eventType: "document_download", section: "Team", documentName: "Deck" }));
    expect(find("data_room_engagement", "insert").length).toBe(1);
  });

  it("hashes the EDGE-observed IP (cf-connecting-ip / last XFF hop) with the salt, 16 hex chars — never the forgeable first hop", async () => {
    process.env.IP_HASH_SALT = "unit-salt";
    state.accessToken = activeToken();
    await POST(postReq({ token: TOKEN, eventType: "open" }, { "x-forwarded-for": "6.6.6.6, 203.0.113.9" }));
    const ins = find("data_room_engagement", "insert")[0].args[0] as { ip_hash: string };
    expect(ins.ip_hash).toMatch(/^[0-9a-f]{16}$/);
    const { createHash } = await import("node:crypto");
    const expected = createHash("sha256").update("203.0.113.9|unit-salt").digest("hex").slice(0, 16);
    expect(ins.ip_hash).toBe(expected);
    const forged = createHash("sha256").update("6.6.6.6|unit-salt").digest("hex").slice(0, 16);
    expect(ins.ip_hash).not.toBe(forged);
  });

  it("still writes a hash when no IP header is present ('unknown' sentinel)", async () => {
    state.accessToken = activeToken();
    await POST(postReq({ token: TOKEN, eventType: "open" }));
    const ins = find("data_room_engagement", "insert")[0].args[0] as { ip_hash: string };
    expect(ins.ip_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("truncates user-agent to 200 chars so a hostile UA cannot bloat the row", async () => {
    state.accessToken = activeToken();
    await POST(postReq({ token: TOKEN, eventType: "open" }, { "user-agent": "x".repeat(500) }));
    const ins = find("data_room_engagement", "insert")[0].args[0] as { user_agent: string };
    expect(ins.user_agent.length).toBe(200);
  });

  it("stamps first_accessed only on open, last_accessed always, scoped to the token id, and fires the rpc", async () => {
    state.accessToken = activeToken();
    await POST(postReq({ token: TOKEN, eventType: "open" }));
    let upd = find("data_room_access_tokens", "update")[0].args[0] as Record<string, unknown>;
    expect(upd.first_accessed).toBeTruthy();
    expect(upd.last_accessed).toBeTruthy();
    expect(hasEq("data_room_access_tokens", "id", "tok-id")).toBe(true);
    expect(find("rpc", "increment_access_count")[0].args[0]).toEqual({ token_id: "tok-id" });

    state.calls = [];
    await POST(postReq({ token: TOKEN, eventType: "document_open", section: "Team" }));
    upd = find("data_room_access_tokens", "update")[0].args[0] as Record<string, unknown>;
    expect(upd.first_accessed).toBeUndefined();
    expect(upd.last_accessed).toBeTruthy();
  });
});

describe("GET /api/data-room/engage", () => {
  const EVENTS = [
    { access_token_id: "l1", event_type: "open", section: null, document_name: null, duration_ms: null, scroll_pct: null, occurred_at: "2026-09-10T00:00:00.000Z" },
    { access_token_id: "l1", event_type: "section_view", section: "Team", document_name: null, duration_ms: 40_000, scroll_pct: 80, occurred_at: "2026-09-10T00:01:00.000Z" },
    { access_token_id: "l1", event_type: "section_view", section: "Team", document_name: null, duration_ms: 20_000, scroll_pct: 100, occurred_at: "2026-09-10T00:02:00.000Z" },
    { access_token_id: "l2", event_type: "section_view", section: "Financials", document_name: null, duration_ms: 5_000, scroll_pct: 30, occurred_at: "2026-09-10T00:03:00.000Z" },
    { access_token_id: "l2", event_type: "document_open", section: null, document_name: "Deck", duration_ms: null, scroll_pct: null, occurred_at: "2026-09-10T00:04:00.000Z" },
  ];

  beforeEach(() => {
    state.room = { id: "room-1", user_id: "user-owner", project_id: "proj-1" };
    state.links = [
      { id: "l2", investor_name: null, investor_firm: "Blackbird", investor_email: null, created_at: "2026-09-02" },
      { id: "l1", investor_name: "Jane", investor_firm: null, investor_email: "j@x.vc", created_at: "2026-09-01" },
    ];
  });

  it("400s when roomId is missing — before auth and before the DB", async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(400);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("401s an anonymous caller — the pre-S21-A route served any room's engagement to anyone", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    const res = await GET(getReq("room-1"));
    expect(res.status).toBe(401);
    expect(find("data_room_engagement", "select").length).toBe(0);
  });

  it("503s when getSupabaseAdmin returns null", async () => {
    mocks.getSupabaseAdmin.mockReturnValueOnce(null);
    const res = await GET(getReq("room-1"));
    expect(res.status).toBe(503);
  });

  it("404s a stranger — a room id is not an oracle", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-stranger", email: "s@x.test" });
    mocks.assertProjectScope.mockRejectedValueOnce(
      Object.assign(new Error("not_found"), { name: "ProjectAccessError", code: "not_found" }),
    );
    const res = await GET(getReq("room-1"));
    expect(res.status).toBe(404);
    expect(find("data_room_engagement", "select").length).toBe(0);
  });

  it("lets an accepted project viewer read (member-aware), resolving the role via assertProjectScope", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-member", email: "m@x.test" });
    mocks.assertProjectScope.mockResolvedValueOnce({ role: "viewer" });
    state.events = EVENTS;
    const res = await GET(getReq("room-1"));
    expect(res.status).toBe(200);
    expect(mocks.assertProjectScope).toHaveBeenCalledWith(expect.objectContaining({ id: "user-member" }), "proj-1", "viewer");
  });

  it("scopes the events pull to the requested roomId, newest first, capped at 500", async () => {
    state.events = [];
    await GET(getReq("room-1"));
    expect(hasEq("data_room_engagement", "data_room_id", "room-1")).toBe(true);
    expect(find("data_room_engagement", "order")[0].args).toEqual(["occurred_at", { ascending: false }]);
    expect(find("data_room_engagement", "limit")[0].args).toEqual([500]);
    expect(hasEq("data_room_access_tokens", "data_room_id", "room-1")).toBe(true);
  });

  it("returns an empty envelope (legacy shape + empty heatmap) when the tenant has no events", async () => {
    state.events = null;
    state.links = [];
    const res = await GET(getReq("room-1"));
    const body = await res.json();
    expect(body.analytics.totalViews).toBe(0);
    expect(body.analytics.totalEvents).toBe(0);
    expect(body.analytics.sectionHeatmap).toEqual({});
    expect(body.analytics.recentEvents).toEqual([]);
    expect(body.analytics.heatmap).toEqual({ sections: [], rows: [], maxDwellMs: 0, maxViews: 0, totalEvents: 0 });
  });

  it("keeps the legacy per-section averages and counts totalViews from opens only", async () => {
    state.events = EVENTS;
    const body = await (await GET(getReq("room-1"))).json();
    expect(body.analytics.totalViews).toBe(1);
    expect(body.analytics.totalEvents).toBe(5);
    expect(body.analytics.sectionHeatmap.Team).toEqual({ views: 2, avgDuration: 30000, avgScroll: 90 });
    expect(body.analytics.sectionHeatmap.Financials).toEqual({ views: 1, avgDuration: 5000, avgScroll: 30 });
    expect(body.analytics.recentEvents.length).toBe(5);
  });

  it("builds the per-link × section heatmap with human labels and never the token", async () => {
    state.events = EVENTS;
    const body = await (await GET(getReq("room-1"))).json();
    const hm = body.analytics.heatmap;
    expect(hm.rows.map((r: { label: string }) => r.label)).toEqual(["Blackbird", "Jane"]);
    expect(hm.sections).toEqual(["Team", "Financials"]);
    const jane = hm.rows[1];
    expect(jane.opens).toBe(1);
    expect(jane.cells).toEqual([
      { linkId: "l1", section: "Team", views: 2, dwellMs: 60_000 },
      { linkId: "l1", section: "Financials", views: 0, dwellMs: 0 },
    ]);
    expect(hm.maxDwellMs).toBe(60_000);
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });
});
