// Colocated vitest for GET /api/track/open — P9-track-open-route-test.
//
// The route is the 1x1 tracking-pixel embedded in every SVI report email.
// Its whole job is: (1) hand every mail client the same tiny transparent
// GIF so it renders as a zero-visual-cost image, and (2) fire-and-forget
// two supabase UPDATEs so we know when a founder actually opened the email
// and when a specific SVI analysis was viewed.
//
// It is fetched by ~every email client on the internet, from IPs we do
// NOT control, with URLs we do NOT get to authenticate. Silent regressions
// here look like "opens stopped counting" a week later, or a broken image
// icon in Gmail/Outlook that ruins the report's first impression.
//
// Silent regressions this suite pins against:
//
//   - Regressing the response body away from a valid 1x1 GIF89a — Gmail /
//     Outlook / Apple Mail treat non-image bodies as a broken image icon,
//     which is the first thing a would-be investor sees.
//   - Regressing Content-Type: image/gif — same broken-image outcome.
//   - Regressing the cache headers (Cache-Control no-store + Pragma no-cache)
//     — a cached pixel means the second, third, Nth open never hits the
//     server and opened_at / viewed_at silently stop updating.
//   - Losing `export const dynamic = "force-dynamic"` — the route would be
//     picked up as a static export and the DB writes would never fire in
//     production.
//   - Skipping the (slug, email) guard — a bare /api/track/open request
//     (missing either query param) must still serve the pixel; touching
//     supabase without params would fan the UPDATE across every row.
//   - Regressing the table names ("svi_notifications" / "svi_analyses") or
//     the exact filters (notification_type, id=slug, IS NULL guards) — we
//     would either over-write already-recorded opens, or write to the
//     wrong table entirely.
//   - Any exception bubbling out of the handler — email clients see a
//     broken image and the founder's report screenshot is ruined.
//   - Losing the IS NULL guards — every subsequent GET would clobber the
//     original opened_at / viewed_at timestamps with a later ISO string,
//     turning "first opened at" analytics into "last opened at".

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── mocks (declared before the module-under-test import) ─────────────

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// Import AFTER the mocks so the route binds to the fakes.
import { GET, dynamic } from "./route";

interface UpdateCall {
  table: string;
  payload: Record<string, unknown>;
  eqCol?: string;
  eqVal?: unknown;
  isCol?: string;
  isVal?: unknown;
  thenCalled: boolean;
}

const state: { calls: UpdateCall[] } = { calls: [] };

function makeFakeSupabase(opts: { rejectOn?: string } = {}) {
  return {
    from(table: string) {
      const call: UpdateCall = {
        table,
        payload: {},
        thenCalled: false,
      };
      state.calls.push(call);
      const chain = {
        update(payload: Record<string, unknown>) {
          call.payload = payload;
          return chain;
        },
        eq(col: string, val: unknown) {
          call.eqCol = col;
          call.eqVal = val;
          return chain;
        },
        is(col: string, val: unknown) {
          call.isCol = col;
          call.isVal = val;
          // The route awaits the terminal .is() via .then() — mimic
          // supabase-js which returns a Thenable at every builder step.
          return chain;
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          call.thenCalled = true;
          if (opts.rejectOn === table && reject) {
            return Promise.reject(new Error(`fake supabase fail on ${table}`))
              .catch(reject);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return chain;
    },
  };
}

function callGET(qs = ""): Promise<Response> {
  return GET(new Request(`https://blockid.au/api/track/open${qs}`));
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.calls = [];
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// ─────────────────────────────────────────────────────────────────────
// Force-dynamic export
// ─────────────────────────────────────────────────────────────────────

describe("dynamic export", () => {
  it('declares dynamic = "force-dynamic" so the pixel is not build-time cached and the DB writes actually fire', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pixel body — must be a valid 1x1 GIF regardless of query params
// ─────────────────────────────────────────────────────────────────────

describe("pixel body", () => {
  it("returns HTTP 200 for a bare GET (no slug, no email)", async () => {
    const res = await callGET();
    expect(res.status).toBe(200);
  });

  it("serves Content-Type: image/gif so mail clients render the tracking pixel inline", async () => {
    const res = await callGET("?slug=s1&email=a@b.com");
    expect(res.headers.get("Content-Type")).toBe("image/gif");
  });

  it("serves body bytes that start with the GIF89a magic header (real, decodable image)", async () => {
    const res = await callGET();
    const body = Buffer.from(await res.arrayBuffer());
    // GIF magic = "GIF87a" or "GIF89a" — both begin "GIF"
    const magic = body.subarray(0, 6).toString("ascii");
    expect(magic.startsWith("GIF")).toBe(true);
    // must be one of the two standard headers
    expect(["GIF87a", "GIF89a"]).toContain(magic);
  });

  it("serves a tiny body (< 100 bytes) so the pixel does not bloat every email fetch", async () => {
    const res = await callGET();
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.byteLength).toBeGreaterThan(0);
    expect(body.byteLength).toBeLessThan(100);
  });

  it("serves the exact same bytes for every request (deterministic constant, not a per-request render)", async () => {
    const a = Buffer.from(await (await callGET()).arrayBuffer());
    const b = Buffer.from(await (await callGET("?slug=x&email=y@z.com")).arrayBuffer());
    expect(a.equals(b)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Cache headers — the pixel MUST NOT be cached, else opens stop counting
// ─────────────────────────────────────────────────────────────────────

describe("cache headers", () => {
  it("serves Cache-Control: no-store, no-cache, must-revalidate, max-age=0 so every open re-hits the tracker", async () => {
    const res = await callGET();
    expect(res.headers.get("Cache-Control")).toBe(
      "no-store, no-cache, must-revalidate, max-age=0",
    );
  });

  it("serves Pragma: no-cache for HTTP/1.0 proxies still in the wild (Outlook on-prem, corporate SEGs)", async () => {
    const res = await callGET();
    expect(res.headers.get("Pragma")).toBe("no-cache");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Query-param guard — no DB writes without BOTH slug and email
// ─────────────────────────────────────────────────────────────────────

describe("query-param guard", () => {
  it("does NOT call getSupabaseAdmin() when slug is missing (avoids UPDATE with undefined filter)", async () => {
    await callGET("?email=a@b.com");
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.calls).toEqual([]);
  });

  it("does NOT call getSupabaseAdmin() when email is missing (avoids UPDATE with undefined filter)", async () => {
    await callGET("?slug=abc");
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.calls).toEqual([]);
  });

  it("does NOT call getSupabaseAdmin() when both slug and email are missing", async () => {
    await callGET();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.calls).toEqual([]);
  });

  it("still returns the 200 pixel when one param is present but the other is missing (mail client must NEVER see a broken image)", async () => {
    const res = await callGET("?slug=abc");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/gif");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 3).toString("ascii")).toBe("GIF");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Happy path — supabase writes fire when BOTH slug and email present
// ─────────────────────────────────────────────────────────────────────

describe("supabase writes (happy path)", () => {
  it("calls getSupabaseAdmin() exactly once when slug + email are present", async () => {
    await callGET("?slug=analysis-42&email=founder@au.com");
    expect(getSupabaseAdminMock).toHaveBeenCalledTimes(1);
  });

  it('updates the svi_notifications table with an opened_at ISO timestamp, filtered by notification_type = "svi_report" AND opened_at IS NULL', async () => {
    await callGET("?slug=analysis-42&email=founder@au.com");
    const call = state.calls.find((c) => c.table === "svi_notifications");
    expect(call).toBeDefined();
    expect(call!.payload).toHaveProperty("opened_at");
    // ISO-8601 UTC form: 2026-08-08T16:31:53.259Z
    expect(String(call!.payload.opened_at)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(call!.eqCol).toBe("notification_type");
    expect(call!.eqVal).toBe("svi_report");
    expect(call!.isCol).toBe("opened_at");
    expect(call!.isVal).toBeNull();
  });

  it("updates the svi_analyses table with a viewed_at ISO timestamp, filtered by id = slug AND viewed_at IS NULL", async () => {
    await callGET("?slug=analysis-42&email=founder@au.com");
    const call = state.calls.find((c) => c.table === "svi_analyses");
    expect(call).toBeDefined();
    expect(call!.payload).toHaveProperty("viewed_at");
    expect(String(call!.payload.viewed_at)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(call!.eqCol).toBe("id");
    expect(call!.eqVal).toBe("analysis-42");
    expect(call!.isCol).toBe("viewed_at");
    expect(call!.isVal).toBeNull();
  });

  it("issues BOTH updates (notifications AND analyses) — one is not enough", async () => {
    await callGET("?slug=analysis-42&email=founder@au.com");
    const tables = state.calls.map((c) => c.table).sort();
    expect(tables).toEqual(["svi_analyses", "svi_notifications"]);
  });

  it("kicks the chain by awaiting .then() on the terminal builder (fire-and-forget, no rejected-promise noise)", async () => {
    await callGET("?slug=analysis-42&email=founder@au.com");
    // Both chains must be terminally awaited so the write actually reaches
    // supabase-js; if .then() is never invoked, the query never dispatches.
    expect(state.calls.every((c) => c.thenCalled)).toBe(true);
  });

  it("returns the 200 pixel even after firing the DB writes (never blocks the mail client on supabase latency)", async () => {
    const res = await callGET("?slug=analysis-42&email=founder@au.com");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/gif");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 3).toString("ascii")).toBe("GIF");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Graceful degradation — supabase unreachable / null client
// ─────────────────────────────────────────────────────────────────────

describe("graceful degradation", () => {
  it("returns the 200 pixel when getSupabaseAdmin() returns null (env not configured)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await callGET("?slug=analysis-42&email=founder@au.com");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/gif");
    expect(state.calls).toEqual([]);
  });

  it("still returns the 200 pixel with valid GIF bytes on null supabase", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await callGET("?slug=analysis-42&email=founder@au.com");
    const body = Buffer.from(await res.arrayBuffer());
    expect(["GIF87a", "GIF89a"]).toContain(body.subarray(0, 6).toString("ascii"));
  });
});
