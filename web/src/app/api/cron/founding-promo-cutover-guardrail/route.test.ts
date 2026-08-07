// Unit tests for /api/cron/founding-promo-cutover-guardrail.
//
// This cron is the LAST line of defence for the Founding 100 A$5 promo
// cutover (2026-09-01T00:00:00Z). The other three guards (checkout API 410,
// /api/lead promo-active check, webhook + stripe-reconcile session.created
// check) should catch every rogue grant BEFORE it lands in app_users. This
// cron scans the last hour of writes and Telegram-alerts if any founding50
// grant slipped through. Regressions here are silent revenue leaks that only
// surface when a founder complains their access is wrong.
//
// Pinned contracts:
//   - auth gate (401 without CRON_SECRET)
//   - pre-cutover: no-op (never scans, never alerts)
//   - post-cutover + zero rogue grants: no telegram (avoid alert fatigue)
//   - post-cutover + >=1 rogue grant: telegram fires + row_ids returned
//   - telegram delivery failure surfaces alerted:false but ok:true

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AppUserRow {
  id: string;
  email: string | null;
  plan_started_at: string;
}

interface SupabaseSelectResult {
  data: AppUserRow[] | null;
  error: { message: string } | null;
}

// --- Supabase fake -----------------------------------------------------------
// The route chains `.from("app_users").select(...).eq(...).gte(...).limit(...)`.
// Each modifier is a thenable that resolves to { data, error }. We record the
// filter args so tests can pin `plan="founding50"` and the sinceIso window.

interface RecordedQuery {
  table?: string;
  select?: string;
  eqs: Array<{ col: string; val: unknown }>;
  gtes: Array<{ col: string; val: unknown }>;
  limit?: number;
}

let recordedQueries: RecordedQuery[] = [];
let nextSelectResult: SupabaseSelectResult = { data: [], error: null };

function makeFakeSupabase() {
  return {
    from(table: string) {
      const q: RecordedQuery = { table, eqs: [], gtes: [] };
      recordedQueries.push(q);
      const chain = {
        select(cols: string) {
          q.select = cols;
          return chain;
        },
        eq(col: string, val: unknown) {
          q.eqs.push({ col, val });
          return chain;
        },
        gte(col: string, val: unknown) {
          q.gtes.push({ col, val });
          return chain;
        },
        limit(n: number) {
          q.limit = n;
          return Promise.resolve(nextSelectResult);
        },
      };
      return chain;
    },
  };
}

const isSupabaseConfiguredMock = vi.fn<() => boolean>();
const getSupabaseAdminMock = vi.fn<() => ReturnType<typeof makeFakeSupabase> | null>();

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const sendTelegramMock = vi.fn<(msg: string) => Promise<void>>();
vi.mock("@/lib/telegram", () => ({
  sendTelegram: (msg: string) => sendTelegramMock(msg),
}));

const isFoundingPromoActiveMock = vi.fn<() => boolean>();
vi.mock("@/lib/founding-promo", () => ({
  isFoundingPromoActive: () => isFoundingPromoActiveMock(),
  FOUNDING_PROMO_END: new Date("2026-09-01T00:00:00Z"),
}));

// Route import comes AFTER mocks are registered.
import { GET, POST, dynamic, runtime } from "./route";

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://x/api/cron/founding-promo-cutover-guardrail", {
    method: "GET",
    headers,
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  recordedQueries = [];
  nextSelectResult = { data: [], error: null };
  isSupabaseConfiguredMock.mockReset().mockReturnValue(true);
  getSupabaseAdminMock.mockReset().mockReturnValue(makeFakeSupabase());
  sendTelegramMock.mockReset().mockResolvedValue(undefined);
  isFoundingPromoActiveMock.mockReset().mockReturnValue(false); // post-cutover default
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.CRON_SECRET = "test_cron_secret";
});

afterEach(() => {
  errorSpy.mockRestore();
  delete process.env.CRON_SECRET;
});

// ---------------------------------------------------------------------------
// Route module invariants
// ---------------------------------------------------------------------------

describe("cutover-guardrail — module invariants", () => {
  it('exports dynamic = "force-dynamic" so the cron is never cached', () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it('runs on node runtime (needs @/lib/telegram + service-role supabase)', () => {
    expect(runtime).toBe("nodejs");
  });

  it("POST is aliased to GET so cron-runner.sh POSTs work too", () => {
    expect(POST).toBe(GET);
  });
});

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

describe("cutover-guardrail — auth gate", () => {
  it("returns 401 without any auth header", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(recordedQueries.length).toBe(0);
    expect(sendTelegramMock).not.toHaveBeenCalled();
  });

  it("accepts x-cron-secret header", async () => {
    const res = await GET(req({ "x-cron-secret": "test_cron_secret" }));
    expect(res.status).toBe(200);
  });

  it("accepts Authorization: Bearer <secret>", async () => {
    const res = await GET(req({ authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(200);
  });

  it("rejects a wrong x-cron-secret", async () => {
    const res = await GET(req({ "x-cron-secret": "wrong" }));
    expect(res.status).toBe(401);
  });

  it("rejects when CRON_SECRET is unset (fail-closed)", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req({ "x-cron-secret": "anything" }));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Pre-cutover no-op
// ---------------------------------------------------------------------------

describe("cutover-guardrail — pre-cutover no-op", () => {
  it("returns active:true and does NOT scan when promo is active", async () => {
    isFoundingPromoActiveMock.mockReturnValue(true);
    const res = await GET(req({ "x-cron-secret": "test_cron_secret" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.active).toBe(true);
    expect(body.rogue_grants).toBe(0);
    expect(body.alerted).toBe(false);
    // No DB touch, no alert.
    expect(recordedQueries.length).toBe(0);
    expect(sendTelegramMock).not.toHaveBeenCalled();
  });

  it("carries the cutover_iso timestamp in every response (visible on health dashboards)", async () => {
    isFoundingPromoActiveMock.mockReturnValue(true);
    const res = await GET(req({ "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    expect(body.cutover_iso).toBe("2026-09-01T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Config gate (503 when Supabase is unconfigured)
// ---------------------------------------------------------------------------

describe("cutover-guardrail — config gate", () => {
  it("returns 503 with error='not_configured' when Supabase is unconfigured", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET(req({ "x-cron-secret": "test_cron_secret" }));
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.error).toBe("not_configured");
  });
});

// ---------------------------------------------------------------------------
// Post-cutover — happy path (zero rogue grants)
// ---------------------------------------------------------------------------

describe("cutover-guardrail — post-cutover happy path", () => {
  it("returns rogue_grants:0 + alerted:false when no rows found (no alert fatigue)", async () => {
    nextSelectResult = { data: [], error: null };
    const res = await GET(req({ "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    expect(body.rogue_grants).toBe(0);
    expect(body.alerted).toBe(false);
    expect(body.row_ids).toEqual([]);
    expect(sendTelegramMock).not.toHaveBeenCalled();
  });

  it("scans exactly app_users WHERE plan='founding50' AND plan_started_at >= sinceIso", async () => {
    await GET(req({ "x-cron-secret": "test_cron_secret" }));
    expect(recordedQueries).toHaveLength(1);
    const q = recordedQueries[0];
    expect(q.table).toBe("app_users");
    expect(q.eqs).toEqual([{ col: "plan", val: "founding50" }]);
    expect(q.gtes).toHaveLength(1);
    expect(q.gtes[0].col).toBe("plan_started_at");
    // sinceIso should be roughly 60m ago (loose bound — ±5s for CI clock).
    const sinceMs = new Date(String(q.gtes[0].val)).getTime();
    const expected = Date.now() - 60 * 60 * 1000;
    expect(Math.abs(sinceMs - expected)).toBeLessThan(5_000);
    expect(q.limit).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Post-cutover — rogue grant detected
// ---------------------------------------------------------------------------

describe("cutover-guardrail — rogue grant detected", () => {
  it("fires a telegram alert containing the row IDs when >=1 rogue grant found", async () => {
    nextSelectResult = {
      data: [
        { id: "u-1", email: "rogue1@example.com", plan_started_at: "2026-09-01T00:03:00Z" },
        { id: "u-2", email: "rogue2@example.com", plan_started_at: "2026-09-01T00:12:00Z" },
      ],
      error: null,
    };
    const res = await GET(req({ "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    expect(body.rogue_grants).toBe(2);
    expect(body.row_ids).toEqual(["u-1", "u-2"]);
    expect(body.alerted).toBe(true);
    expect(sendTelegramMock).toHaveBeenCalledTimes(1);
    const msg = String(sendTelegramMock.mock.calls[0][0]);
    expect(msg).toMatch(/CRITICAL/);
    expect(msg).toMatch(/Founding 100/);
    expect(msg).toMatch(/u-1/);
    expect(msg).toMatch(/u-2/);
    expect(msg).toMatch(/2026-09-01T00:00:00\.000Z/); // cutover_iso in payload
  });

  it("surfaces alerted:false but ok:true when telegram delivery throws", async () => {
    nextSelectResult = {
      data: [{ id: "u-x", email: null, plan_started_at: "2026-09-01T00:05:00Z" }],
      error: null,
    };
    sendTelegramMock.mockRejectedValueOnce(new Error("telegram down"));
    const res = await GET(req({ "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.rogue_grants).toBe(1);
    expect(body.alerted).toBe(false);
    // The JSON response is the paper trail so ops can pick it up from the
    // cron-runner JSONL log even when telegram is offline.
    expect(body.row_ids).toEqual(["u-x"]);
  });

  it("caps the summary at 10 rows so a mass-grant incident doesn't blow the telegram message limit", async () => {
    const rows: AppUserRow[] = Array.from({ length: 25 }).map((_, i) => ({
      id: `u-${i}`,
      email: `r${i}@example.com`,
      plan_started_at: "2026-09-01T00:05:00Z",
    }));
    nextSelectResult = { data: rows, error: null };
    await GET(req({ "x-cron-secret": "test_cron_secret" }));
    const msg = String(sendTelegramMock.mock.calls[0][0]);
    // First 10 rows appear in the human-readable summary.
    expect(msg).toMatch(/r0@example\.com/);
    expect(msg).toMatch(/r9@example\.com/);
    // 11th onward does NOT appear (summary cap).
    expect(msg).not.toMatch(/r10@example\.com/);
    // ...but all row IDs are in the machine-readable Row IDs list.
    expect(msg).toMatch(/u-10/);
    expect(msg).toMatch(/u-24/);
  });
});

// ---------------------------------------------------------------------------
// DB error path
// ---------------------------------------------------------------------------

describe("cutover-guardrail — supabase error", () => {
  it("returns 500 + error message when the select throws a Supabase error", async () => {
    nextSelectResult = { data: null, error: { message: "policy_denied" } };
    const res = await GET(req({ "x-cron-secret": "test_cron_secret" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("policy_denied");
    expect(sendTelegramMock).not.toHaveBeenCalled();
  });
});
