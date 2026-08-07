// Colocated vitest for POST + GET /api/data-room/engage — P9-data-room-engage-route-test.
//
// The route is the investor-facing engagement telemetry endpoint cited under
// P1_dataroom_map in docs/plans/atlassian-standard-mapping-goal.md. POST is
// intentionally unauthenticated (r-03-exempt): the caller proves entitlement
// by holding a valid data_room_access_tokens row. GET is founder-facing and
// returns the per-section heatmap the /workspace surface renders.
//
// Silent regressions this pins:
//   - dropping the 503 branch when getSupabaseAdmin returns null so the route
//     NPEs the anonymous investor page load with a 500.
//   - dropping the token/eventType 400 branch so a malformed POST from a
//     misbehaving client silently writes a null-riddled engagement row.
//   - dropping the .eq("token", ...) lookup so an attacker can substitute any
//     token string and hit the insert path.
//   - dropping the is_active check so a revoked-but-not-expired share link
//     keeps recording events (breaks the "revoke instantly" contract).
//   - dropping the expires_at check so an expired link keeps recording events.
//   - flipping the ipHash to un-salted / full-length so the raw IP leaks into
//     data_room_engagement (Privacy Act breach; must remain a 16-char salted
//     SHA-256 prefix).
//   - dropping the eventType==="open" branch on first_accessed so the
//     "investor first opened your room at ..." tile never populates.
//   - dropping the .eq("id", accessToken.id) on the token update so the
//     last_accessed clock leaks across tenants.
//   - dropping the rpc("increment_access_count") call so the /workspace
//     "views" counter never advances.
//   - dropping the .eq("data_room_id", roomId) on GET so heatmaps cross-render
//     across tenants.
//   - flipping the GET section-average maths (sum→count→round) so the
//     heatmap displays cumulative durations instead of averages.
//   - flipping recentEvents cap off 20 so the /workspace client crashes on
//     large tenants (renders 500 rows in a tooltip).
//   - flipping the totalViews filter off `event_type === "open"` so the
//     "unique opens" number rolls in section_view / document_open events.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// Route import must come AFTER the mock is registered.
import { GET, POST } from "./route";

interface AccessTokenRow {
  id: string;
  data_room_id: string;
  is_active: boolean;
  expires_at: string | null;
}

interface EngagementRow {
  event_type: string;
  section: string | null;
  document_name: string | null;
  duration_ms: number | null;
  scroll_pct: number | null;
  occurred_at: string;
}

interface FakeState {
  accessToken: AccessTokenRow | null;
  engagementEvents: EngagementRow[] | null;
  calls: {
    from: string[];
    tokenSelect: string | null;
    tokenEq: { col: string; val: unknown } | null;
    engagementInsertPayload: Record<string, unknown> | null;
    tokenUpdatePayload: Record<string, unknown> | null;
    tokenUpdateEq: { col: string; val: unknown } | null;
    rpc: { fn: string; args: Record<string, unknown> } | null;
    engagementSelect: string | null;
    engagementSelectEq: { col: string; val: unknown } | null;
    engagementSelectOrder: { col: string; ascending?: boolean } | null;
    engagementSelectLimit: number | null;
  };
}

const state: FakeState = {
  accessToken: null,
  engagementEvents: null,
  calls: {
    from: [],
    tokenSelect: null,
    tokenEq: null,
    engagementInsertPayload: null,
    tokenUpdatePayload: null,
    tokenUpdateEq: null,
    rpc: null,
    engagementSelect: null,
    engagementSelectEq: null,
    engagementSelectOrder: null,
    engagementSelectLimit: null,
  },
};

function resetState() {
  state.accessToken = null;
  state.engagementEvents = null;
  state.calls = {
    from: [],
    tokenSelect: null,
    tokenEq: null,
    engagementInsertPayload: null,
    tokenUpdatePayload: null,
    tokenUpdateEq: null,
    rpc: null,
    engagementSelect: null,
    engagementSelectEq: null,
    engagementSelectOrder: null,
    engagementSelectLimit: null,
  };
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.calls.from.push(table);

      if (table === "data_room_access_tokens") {
        return {
          select(cols: string) {
            state.calls.tokenSelect = cols;
            return {
              eq(col: string, val: unknown) {
                state.calls.tokenEq = { col, val };
                return {
                  single: () =>
                    Promise.resolve({ data: state.accessToken }),
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            state.calls.tokenUpdatePayload = payload;
            return {
              eq(col: string, val: unknown) {
                state.calls.tokenUpdateEq = { col, val };
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      }

      if (table === "data_room_engagement") {
        return {
          insert(payload: Record<string, unknown>) {
            state.calls.engagementInsertPayload = payload;
            return Promise.resolve({ data: null, error: null });
          },
          select(cols: string) {
            state.calls.engagementSelect = cols;
            return {
              eq(col: string, val: unknown) {
                state.calls.engagementSelectEq = { col, val };
                return {
                  order(col2: string, opts?: { ascending?: boolean }) {
                    state.calls.engagementSelectOrder = {
                      col: col2,
                      ...opts,
                    };
                    return {
                      limit(n: number) {
                        state.calls.engagementSelectLimit = n;
                        return Promise.resolve({
                          data: state.engagementEvents,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
    rpc(fn: string, args: Record<string, unknown>) {
      state.calls.rpc = { fn, args };
      return Promise.resolve({ data: null, error: null });
    },
  };
}

function postReq(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
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

beforeEach(() => {
  resetState();
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
  delete process.env.IP_HASH_SALT;
});

describe("POST /api/data-room/engage", () => {
  it("503s when getSupabaseAdmin returns null (db not configured)", async () => {
    getSupabaseAdminMock.mockReturnValueOnce(null);
    const res = await POST(postReq({ token: "t", eventType: "open" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    // No table touched.
    expect(state.calls.from.length).toBe(0);
  });

  it("400s when token is missing", async () => {
    const res = await POST(postReq({ eventType: "open" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Missing token");
    expect(state.calls.from.length).toBe(0);
  });

  it("400s when eventType is missing", async () => {
    const res = await POST(postReq({ token: "t" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing token or eventType");
  });

  it("400s when the body is not valid JSON (parse falls back to {})", async () => {
    const req = new Request("http://localhost/api/data-room/engage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json at all",
    }) as unknown as NextRequest;
    const res = await POST(req);
    // Empty body → both token and eventType missing → 400.
    expect(res.status).toBe(400);
  });

  it("403s when the token lookup returns no row", async () => {
    state.accessToken = null;
    const res = await POST(postReq({ token: "bogus", eventType: "open" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Invalid or expired token");
    // Token was looked up.
    expect(state.calls.tokenEq).toEqual({ col: "token", val: "bogus" });
    // No insert / update / rpc side effects.
    expect(state.calls.engagementInsertPayload).toBeNull();
    expect(state.calls.tokenUpdatePayload).toBeNull();
    expect(state.calls.rpc).toBeNull();
  });

  it("403s when the token is inactive (revoked)", async () => {
    state.accessToken = {
      id: "tok-id",
      data_room_id: "room-1",
      is_active: false,
      expires_at: null,
    };
    const res = await POST(postReq({ token: "t", eventType: "open" }));
    expect(res.status).toBe(403);
    expect(state.calls.engagementInsertPayload).toBeNull();
  });

  it("403s when the token is expired (expires_at in the past)", async () => {
    state.accessToken = {
      id: "tok-id",
      data_room_id: "room-1",
      is_active: true,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    };
    const res = await POST(postReq({ token: "t", eventType: "open" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("expired");
    expect(state.calls.engagementInsertPayload).toBeNull();
  });

  it("allows an active token with null expires_at (perpetual link)", async () => {
    state.accessToken = {
      id: "tok-id",
      data_room_id: "room-1",
      is_active: true,
      expires_at: null,
    };
    const res = await POST(postReq({ token: "t", eventType: "open" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("allows an active token with a future expires_at", async () => {
    state.accessToken = {
      id: "tok-id",
      data_room_id: "room-1",
      is_active: true,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const res = await POST(postReq({ token: "t", eventType: "open" }));
    expect(res.status).toBe(200);
  });

  it("inserts a full engagement row with every optional field forwarded", async () => {
    state.accessToken = {
      id: "tok-id",
      data_room_id: "room-1",
      is_active: true,
      expires_at: null,
    };
    await POST(
      postReq(
        {
          token: "t",
          eventType: "document_open",
          section: "financials",
          documentName: "P&L.pdf",
          durationMs: 12345,
          scrollPct: 87,
        },
        { "user-agent": "Chrome/1.0" },
      ),
    );
    const payload = state.calls.engagementInsertPayload!;
    expect(payload.data_room_id).toBe("room-1");
    expect(payload.access_token_id).toBe("tok-id");
    expect(payload.event_type).toBe("document_open");
    expect(payload.section).toBe("financials");
    expect(payload.document_name).toBe("P&L.pdf");
    expect(payload.duration_ms).toBe(12345);
    expect(payload.scroll_pct).toBe(87);
    expect(payload.user_agent).toBe("Chrome/1.0");
  });

  it("nulls out optional insert fields when the body omits them", async () => {
    state.accessToken = {
      id: "tok-id",
      data_room_id: "room-1",
      is_active: true,
      expires_at: null,
    };
    await POST(postReq({ token: "t", eventType: "open" }));
    const payload = state.calls.engagementInsertPayload!;
    expect(payload.section).toBeNull();
    expect(payload.document_name).toBeNull();
    expect(payload.duration_ms).toBeNull();
    expect(payload.scroll_pct).toBeNull();
    expect(payload.user_agent).toBeNull();
  });

  it("hashes the IP with IP_HASH_SALT and truncates to 16 hex chars", async () => {
    process.env.IP_HASH_SALT = "pepper";
    state.accessToken = {
      id: "tok-id",
      data_room_id: "room-1",
      is_active: true,
      expires_at: null,
    };
    await POST(
      postReq(
        { token: "t", eventType: "open" },
        { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
      ),
    );
    const payload = state.calls.engagementInsertPayload!;
    // sha256("203.0.113.5" + "pepper") → first 16 hex chars
    const { createHash } = await import("crypto");
    const expected = createHash("sha256")
      .update("203.0.113.5" + "pepper")
      .digest("hex")
      .slice(0, 16);
    expect(payload.ip_hash).toBe(expected);
    expect(String(payload.ip_hash)).toHaveLength(16);
    // Raw IP must NEVER be persisted.
    expect(payload.ip_hash).not.toContain("203.0.113.5");
  });

  it("falls back to 'unknown' when x-forwarded-for is absent", async () => {
    state.accessToken = {
      id: "tok-id",
      data_room_id: "room-1",
      is_active: true,
      expires_at: null,
    };
    await POST(postReq({ token: "t", eventType: "open" }));
    const payload = state.calls.engagementInsertPayload!;
    const { createHash } = await import("crypto");
    const expected = createHash("sha256")
      .update("unknown")
      .digest("hex")
      .slice(0, 16);
    expect(payload.ip_hash).toBe(expected);
  });

  it("truncates user-agent to 200 chars so a hostile UA cannot bloat the row", async () => {
    state.accessToken = {
      id: "tok-id",
      data_room_id: "room-1",
      is_active: true,
      expires_at: null,
    };
    const huge = "A".repeat(500);
    await POST(
      postReq(
        { token: "t", eventType: "open" },
        { "user-agent": huge },
      ),
    );
    const payload = state.calls.engagementInsertPayload!;
    expect(String(payload.user_agent)).toHaveLength(200);
  });

  it("stamps both first_accessed and last_accessed on eventType=open", async () => {
    state.accessToken = {
      id: "tok-id",
      data_room_id: "room-1",
      is_active: true,
      expires_at: null,
    };
    await POST(postReq({ token: "t", eventType: "open" }));
    const upd = state.calls.tokenUpdatePayload!;
    expect(typeof upd.last_accessed).toBe("string");
    expect(typeof upd.first_accessed).toBe("string");
    expect(state.calls.tokenUpdateEq).toEqual({ col: "id", val: "tok-id" });
  });

  it("only stamps last_accessed on non-open events (first_accessed untouched)", async () => {
    state.accessToken = {
      id: "tok-id",
      data_room_id: "room-1",
      is_active: true,
      expires_at: null,
    };
    await POST(postReq({ token: "t", eventType: "section_view" }));
    const upd = state.calls.tokenUpdatePayload!;
    expect(typeof upd.last_accessed).toBe("string");
    expect(upd.first_accessed).toBeUndefined();
  });

  it("fires the increment_access_count rpc with token_id=accessToken.id", async () => {
    state.accessToken = {
      id: "tok-id-xyz",
      data_room_id: "room-1",
      is_active: true,
      expires_at: null,
    };
    await POST(postReq({ token: "t", eventType: "open" }));
    expect(state.calls.rpc).toEqual({
      fn: "increment_access_count",
      args: { token_id: "tok-id-xyz" },
    });
  });

  it("selects the access-token columns the handler branches on", async () => {
    state.accessToken = {
      id: "tok-id",
      data_room_id: "room-1",
      is_active: true,
      expires_at: null,
    };
    await POST(postReq({ token: "t", eventType: "open" }));
    const cols = state.calls.tokenSelect ?? "";
    expect(cols).toContain("id");
    expect(cols).toContain("data_room_id");
    expect(cols).toContain("is_active");
    expect(cols).toContain("expires_at");
  });

  it("returns {ok:true} on the happy path", async () => {
    state.accessToken = {
      id: "tok-id",
      data_room_id: "room-1",
      is_active: true,
      expires_at: null,
    };
    const res = await POST(postReq({ token: "t", eventType: "open" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});

describe("GET /api/data-room/engage", () => {
  it("400s when roomId is missing", async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("roomId required");
    // No DB touched when the query-string guard fires.
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("503s when getSupabaseAdmin returns null", async () => {
    getSupabaseAdminMock.mockReturnValueOnce(null);
    const res = await GET(getReq("room-1"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Database not configured");
  });

  it("scopes the engagement lookup to the requested roomId", async () => {
    state.engagementEvents = [];
    await GET(getReq("room-abc"));
    expect(state.calls.engagementSelectEq).toEqual({
      col: "data_room_id",
      val: "room-abc",
    });
  });

  it("orders newest-first and caps the pull at 500 rows", async () => {
    state.engagementEvents = [];
    await GET(getReq("room-1"));
    expect(state.calls.engagementSelectOrder).toEqual({
      col: "occurred_at",
      ascending: false,
    });
    expect(state.calls.engagementSelectLimit).toBe(500);
  });

  it("returns empty analytics envelope when the tenant has no events", async () => {
    state.engagementEvents = null;
    const res = await GET(getReq("room-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.analytics.totalViews).toBe(0);
    expect(body.analytics.totalEvents).toBe(0);
    expect(body.analytics.sectionHeatmap).toEqual({});
    expect(body.analytics.recentEvents).toEqual([]);
  });

  it("counts totalViews from event_type=open only (not section_view etc.)", async () => {
    state.engagementEvents = [
      {
        event_type: "open",
        section: null,
        document_name: null,
        duration_ms: null,
        scroll_pct: null,
        occurred_at: "2026-08-01T00:00:00.000Z",
      },
      {
        event_type: "open",
        section: null,
        document_name: null,
        duration_ms: null,
        scroll_pct: null,
        occurred_at: "2026-08-02T00:00:00.000Z",
      },
      {
        event_type: "section_view",
        section: "financials",
        document_name: null,
        duration_ms: 1000,
        scroll_pct: 40,
        occurred_at: "2026-08-03T00:00:00.000Z",
      },
      {
        event_type: "document_open",
        section: "financials",
        document_name: "P&L.pdf",
        duration_ms: 3000,
        scroll_pct: null,
        occurred_at: "2026-08-04T00:00:00.000Z",
      },
    ];
    const res = await GET(getReq("room-1"));
    const body = await res.json();
    expect(body.analytics.totalViews).toBe(2);
    expect(body.analytics.totalEvents).toBe(4);
  });

  it("builds the per-section heatmap with averaged duration + scroll", async () => {
    state.engagementEvents = [
      {
        event_type: "section_view",
        section: "financials",
        document_name: null,
        duration_ms: 1000,
        scroll_pct: 40,
        occurred_at: "2026-08-01T00:00:00.000Z",
      },
      {
        event_type: "section_view",
        section: "financials",
        document_name: null,
        duration_ms: 3000,
        scroll_pct: 60,
        occurred_at: "2026-08-02T00:00:00.000Z",
      },
      {
        event_type: "section_view",
        section: "cap_table",
        document_name: null,
        duration_ms: 2000,
        scroll_pct: 80,
        occurred_at: "2026-08-03T00:00:00.000Z",
      },
    ];
    const res = await GET(getReq("room-1"));
    const body = await res.json();
    // (1000 + 3000) / 2 = 2000; (40 + 60) / 2 = 50
    expect(body.analytics.sectionHeatmap.financials).toEqual({
      views: 2,
      avgDuration: 2000,
      avgScroll: 50,
    });
    expect(body.analytics.sectionHeatmap.cap_table).toEqual({
      views: 1,
      avgDuration: 2000,
      avgScroll: 80,
    });
  });

  it("skips events with null section (no phantom '' bucket in the heatmap)", async () => {
    state.engagementEvents = [
      {
        event_type: "open",
        section: null,
        document_name: null,
        duration_ms: null,
        scroll_pct: null,
        occurred_at: "2026-08-01T00:00:00.000Z",
      },
    ];
    const res = await GET(getReq("room-1"));
    const body = await res.json();
    expect(body.analytics.sectionHeatmap).toEqual({});
    // But it still counts toward totalEvents and totalViews.
    expect(body.analytics.totalEvents).toBe(1);
    expect(body.analytics.totalViews).toBe(1);
  });

  it("caps recentEvents at 20 rows (widget renders a compact tail)", async () => {
    state.engagementEvents = Array.from({ length: 50 }, (_, i) => ({
      event_type: "section_view",
      section: "financials",
      document_name: null,
      duration_ms: 100,
      scroll_pct: 50,
      occurred_at: `2026-08-01T00:00:${String(i).padStart(2, "0")}.000Z`,
    }));
    const res = await GET(getReq("room-1"));
    const body = await res.json();
    expect(body.analytics.recentEvents.length).toBe(20);
    // The first 20 rows of the pre-sorted (newest-first) list.
    expect(body.analytics.recentEvents[0].occurred_at).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("rounds averaged duration + scroll to integers", async () => {
    state.engagementEvents = [
      {
        event_type: "section_view",
        section: "team",
        document_name: null,
        duration_ms: 1000,
        scroll_pct: 33,
        occurred_at: "2026-08-01T00:00:00.000Z",
      },
      {
        event_type: "section_view",
        section: "team",
        document_name: null,
        duration_ms: 1001,
        scroll_pct: 34,
        occurred_at: "2026-08-02T00:00:00.000Z",
      },
      {
        event_type: "section_view",
        section: "team",
        document_name: null,
        duration_ms: 1002,
        scroll_pct: 34,
        occurred_at: "2026-08-03T00:00:00.000Z",
      },
    ];
    const res = await GET(getReq("room-1"));
    const body = await res.json();
    const heat = body.analytics.sectionHeatmap.team;
    expect(Number.isInteger(heat.avgDuration)).toBe(true);
    expect(Number.isInteger(heat.avgScroll)).toBe(true);
    // (1000 + 1001 + 1002) / 3 = 1001; (33 + 34 + 34) / 3 = 33.66… → 34
    expect(heat.avgDuration).toBe(1001);
    expect(heat.avgScroll).toBe(34);
  });

  it("skips duration/scroll accumulation when the source field is nullish", async () => {
    state.engagementEvents = [
      {
        event_type: "section_view",
        section: "risks",
        document_name: null,
        duration_ms: null,
        scroll_pct: null,
        occurred_at: "2026-08-01T00:00:00.000Z",
      },
      {
        event_type: "section_view",
        section: "risks",
        document_name: null,
        duration_ms: 400,
        scroll_pct: 20,
        occurred_at: "2026-08-02T00:00:00.000Z",
      },
    ];
    const res = await GET(getReq("room-1"));
    const body = await res.json();
    const heat = body.analytics.sectionHeatmap.risks;
    // The single non-null sample carries the whole average (400 / 2 = 200,
    // 20 / 2 = 10) because the average uses `views`, not the count of
    // non-null contributors — pin the current shape so the /workspace
    // widget wording stays consistent with the numbers.
    expect(heat.views).toBe(2);
    expect(heat.avgDuration).toBe(200);
    expect(heat.avgScroll).toBe(10);
  });

  it("returns the newest-first event tail verbatim in recentEvents", async () => {
    const rows: EngagementRow[] = [
      {
        event_type: "open",
        section: null,
        document_name: null,
        duration_ms: null,
        scroll_pct: null,
        occurred_at: "2026-08-05T00:00:00.000Z",
      },
      {
        event_type: "section_view",
        section: "team",
        document_name: null,
        duration_ms: 500,
        scroll_pct: 25,
        occurred_at: "2026-08-04T00:00:00.000Z",
      },
    ];
    state.engagementEvents = rows;
    const res = await GET(getReq("room-1"));
    const body = await res.json();
    expect(body.analytics.recentEvents).toEqual(rows);
  });

  it("selects only the engagement columns the heatmap depends on", async () => {
    state.engagementEvents = [];
    await GET(getReq("room-1"));
    const cols = state.calls.engagementSelect ?? "";
    expect(cols).toContain("event_type");
    expect(cols).toContain("section");
    expect(cols).toContain("document_name");
    expect(cols).toContain("duration_ms");
    expect(cols).toContain("scroll_pct");
    expect(cols).toContain("occurred_at");
  });
});
