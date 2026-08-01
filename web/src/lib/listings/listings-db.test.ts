import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for `web/src/lib/listings/listings-db.ts` — the
// server-only data access layer behind the public AU Startup Index. Silent
// regressions here are load-bearing:
//   * losing the limit clamp `Math.max(1, Math.min(opts.limit ?? 50, 200))`
//     lets a caller request 10_000 rows and page-render OOM the SEO surface
//   * losing the sort-by branch fallthrough to "recent" would surface a
//     non-deterministic order on the /startups index page
//   * losing the relation-not-exist silencer would flood the loop's stderr
//     with legacy-install noise on every 10-min cron tick
//   * losing the ticker regex `^[A-Z0-9]{3,8}(-[0-9]+)?$` would let a URL
//     path segment slip into an .eq() and short-circuit as a Supabase error
//   * losing the trim+uppercase normalisation would 404 `/startups/acme`
//     for a startup whose ticker was ACME
//   * losing the empty-name guard in submitStartupListing would insert a
//     blank row and violate the NOT NULL constraint at DB-side, wasting a
//     `generate_ticker` RPC call in the process
//   * losing the ticker RPC error handling would 500 the founder-facing
//     "publish my listing" flow on a legacy install
//   * losing the `is_public ?? false` fallback would surface every draft
//     listing on the public index the moment a founder creates one
//   * losing the fire-and-forget audit-event try/catch would flip a
//     successful listing into an error banner if the events table hiccups
//
// Mocks:
//   - `@/lib/supabase` (getSupabaseAdmin only) — a chain builder tracks
//     every from/select/eq/order/limit/rpc/insert call so assertions can
//     inspect the actual wire shape.

type ChainCall = { method: string; args: unknown[] };

interface State {
  admin: ReturnType<typeof buildAdmin> | null;
  calls: ChainCall[];
  // Per-chain terminal result (set before each test).
  result: { data: unknown; error: { message: string } | null };
  rpcResult: { data: unknown; error: { message: string } | null };
  insertResult: { error: { message: string } | null };
  // Second insert (audit event) — separately controllable.
  eventInsertResult: { error: { message: string } | null } | Error;
}

const state: State = {
  admin: null,
  calls: [],
  result: { data: null, error: null },
  rpcResult: { data: null, error: null },
  insertResult: { error: null },
  eventInsertResult: { error: null },
};

function record(method: string, args: unknown[]) {
  state.calls.push({ method, args });
}

function buildChain() {
  const chainable: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(state.result);
        }
        if (prop === "maybeSingle") {
          return () => {
            record("maybeSingle", []);
            return Promise.resolve(state.result);
          };
        }
        return (...args: unknown[]) => {
          record(prop, args);
          return chainable;
        };
      },
    },
  );
  return chainable;
}

function buildAdmin() {
  let insertCallCount = 0;
  return {
    from(table: string) {
      record("from", [table]);
      // Reset the insert counter per `from()` — matches real Supabase where
      // each chain is standalone.
      const localCounter = { n: insertCallCount };
      const chain = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") {
              return (resolve: (v: unknown) => void) => resolve(state.result);
            }
            if (prop === "maybeSingle") {
              return () => {
                record("maybeSingle", []);
                return Promise.resolve(state.result);
              };
            }
            if (prop === "insert") {
              return (...args: unknown[]) => {
                record("insert", args);
                localCounter.n += 1;
                insertCallCount += 1;
                // Audit event is the 2nd insert call across all `from()`
                // invocations within submitStartupListing — but for
                // simplicity: use table name to decide.
                const tbl = (state.calls.find((c) => c.method === "from" && c.args[0] === "startup_listing_events")
                  ? "event"
                  : "primary");
                if (tbl === "event") {
                  if (state.eventInsertResult instanceof Error) {
                    return Promise.reject(state.eventInsertResult);
                  }
                  return Promise.resolve(state.eventInsertResult);
                }
                return Promise.resolve(state.insertResult);
              };
            }
            return (...args: unknown[]) => {
              record(prop, args);
              return chain;
            };
          },
        },
      );
      return chain;
    },
    rpc(fn: string, params: Record<string, unknown>) {
      record("rpc", [fn, params]);
      return Promise.resolve(state.rpcResult);
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => state.admin,
}));

// Import AFTER the mock.
import {
  getListingByTicker,
  getPublicListings,
  submitStartupListing,
} from "./listings-db";

function findCall(method: string): ChainCall | undefined {
  return state.calls.find((c) => c.method === method);
}

function findAllCalls(method: string): ChainCall[] {
  return state.calls.filter((c) => c.method === method);
}

beforeEach(() => {
  state.admin = buildAdmin();
  state.calls = [];
  state.result = { data: null, error: null };
  state.rpcResult = { data: null, error: null };
  state.insertResult = { error: null };
  state.eventInsertResult = { error: null };
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ────────────────────────────────────────────────────────────────────────
// getPublicListings
// ────────────────────────────────────────────────────────────────────────

describe("getPublicListings", () => {
  it("returns [] when getSupabaseAdmin() is null", async () => {
    state.admin = null;
    const out = await getPublicListings();
    expect(out).toEqual([]);
    expect(state.calls).toEqual([]);
  });

  it("queries the public view (not the base table)", async () => {
    state.result = { data: [], error: null };
    await getPublicListings();
    expect(findCall("from")?.args[0]).toBe("v_startup_listing_public");
  });

  it("selects the 12-column public projection (comma-joined)", async () => {
    state.result = { data: [], error: null };
    await getPublicListings();
    const cols = String(findCall("select")?.args[0] ?? "").split(",");
    expect(cols).toEqual([
      "ticker",
      "name",
      "sector",
      "stage",
      "hq_state",
      "website_url",
      "one_liner",
      "svi_grade",
      "svi_score",
      "latest_raise_aud_cents",
      "listed_at",
      "updated_at",
    ]);
  });

  it("defaults limit to 50 when caller omits it", async () => {
    state.result = { data: [], error: null };
    await getPublicListings();
    expect(findCall("limit")?.args[0]).toBe(50);
  });

  it("clamps limit above 200 down to 200", async () => {
    state.result = { data: [], error: null };
    await getPublicListings({ limit: 10_000 });
    expect(findCall("limit")?.args[0]).toBe(200);
  });

  it("clamps limit below 1 up to 1", async () => {
    state.result = { data: [], error: null };
    await getPublicListings({ limit: 0 });
    expect(findCall("limit")?.args[0]).toBe(1);
  });

  it("clamps negative limit up to 1", async () => {
    state.result = { data: [], error: null };
    await getPublicListings({ limit: -5 });
    expect(findCall("limit")?.args[0]).toBe(1);
  });

  it("respects a valid limit within [1, 200]", async () => {
    state.result = { data: [], error: null };
    await getPublicListings({ limit: 75 });
    expect(findCall("limit")?.args[0]).toBe(75);
  });

  it("applies sector filter when supplied", async () => {
    state.result = { data: [], error: null };
    await getPublicListings({ sector: "fintech" });
    const eq = findCall("eq");
    expect(eq?.args[0]).toBe("sector");
    expect(eq?.args[1]).toBe("fintech");
  });

  it("skips sector filter when omitted", async () => {
    state.result = { data: [], error: null };
    await getPublicListings();
    expect(findCall("eq")).toBeUndefined();
  });

  it('sortBy "recent" (default) orders by listed_at desc only', async () => {
    state.result = { data: [], error: null };
    await getPublicListings();
    const orders = findAllCalls("order");
    expect(orders).toHaveLength(1);
    expect(orders[0].args).toEqual(["listed_at", { ascending: false }]);
  });

  it('sortBy "svi_score" orders by svi_score desc nullsFirst=false, then listed_at desc', async () => {
    state.result = { data: [], error: null };
    await getPublicListings({ sortBy: "svi_score" });
    const orders = findAllCalls("order");
    expect(orders).toHaveLength(2);
    expect(orders[0].args).toEqual([
      "svi_score",
      { ascending: false, nullsFirst: false },
    ]);
    expect(orders[1].args).toEqual(["listed_at", { ascending: false }]);
  });

  it('sortBy "raise" orders by latest_raise_aud_cents desc nullsFirst=false, then listed_at desc', async () => {
    state.result = { data: [], error: null };
    await getPublicListings({ sortBy: "raise" });
    const orders = findAllCalls("order");
    expect(orders).toHaveLength(2);
    expect(orders[0].args).toEqual([
      "latest_raise_aud_cents",
      { ascending: false, nullsFirst: false },
    ]);
    expect(orders[1].args).toEqual(["listed_at", { ascending: false }]);
  });

  it("returns the rows verbatim on happy path", async () => {
    const rows = [{ ticker: "ACME", name: "Acme" }];
    state.result = { data: rows, error: null };
    const out = await getPublicListings();
    expect(out).toBe(rows as never);
  });

  it("returns [] when data is null with no error (defensive)", async () => {
    state.result = { data: null, error: null };
    const out = await getPublicListings();
    expect(out).toEqual([]);
  });

  it("returns [] and does NOT log on relation-does-not-exist error (legacy install)", async () => {
    state.result = {
      data: null,
      error: { message: 'relation "v_startup_listing_public" does not exist' },
    };
    const errSpy = vi.spyOn(console, "error");
    const out = await getPublicListings();
    expect(out).toEqual([]);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("returns [] and logs on any OTHER error", async () => {
    state.result = { data: null, error: { message: "permission denied" } };
    const errSpy = vi.spyOn(console, "error");
    const out = await getPublicListings();
    expect(out).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
    expect(String(errSpy.mock.calls[0][0])).toMatch(/getPublicListings failed/);
  });

  it("also silences relation-does-not-exist on the base startup_listings table", async () => {
    state.result = {
      data: null,
      error: { message: 'relation "startup_listings" does not exist' },
    };
    const errSpy = vi.spyOn(console, "error");
    const out = await getPublicListings();
    expect(out).toEqual([]);
    expect(errSpy).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────
// getListingByTicker
// ────────────────────────────────────────────────────────────────────────

describe("getListingByTicker", () => {
  it("returns null when getSupabaseAdmin() is null", async () => {
    state.admin = null;
    const out = await getListingByTicker("ACME");
    expect(out).toBeNull();
    expect(state.calls).toEqual([]);
  });

  it("trims + uppercases the ticker before validating", async () => {
    state.result = { data: null, error: null };
    await getListingByTicker("  acme  ");
    const eq = findCall("eq");
    expect(eq?.args).toEqual(["ticker", "ACME"]);
  });

  it("returns null WITHOUT a DB round-trip when ticker fails the regex", async () => {
    const out = await getListingByTicker("AB"); // 2 chars < 3
    expect(out).toBeNull();
    expect(state.calls).toEqual([]);
  });

  it("returns null WITHOUT a DB round-trip on empty ticker", async () => {
    const out = await getListingByTicker("");
    expect(out).toBeNull();
    expect(state.calls).toEqual([]);
  });

  it("rejects tickers with lowercase after normalisation? impossible — but rejects punctuation like ACME!", async () => {
    const out = await getListingByTicker("ACME!");
    expect(out).toBeNull();
    expect(state.calls).toEqual([]);
  });

  it("accepts the 3-char lower bound", async () => {
    state.result = { data: null, error: null };
    await getListingByTicker("ABC");
    expect(findCall("eq")?.args[1]).toBe("ABC");
  });

  it("accepts the 8-char upper bound", async () => {
    state.result = { data: null, error: null };
    await getListingByTicker("ABCDEFGH");
    expect(findCall("eq")?.args[1]).toBe("ABCDEFGH");
  });

  it("rejects a 9-char ticker (over the upper bound)", async () => {
    const out = await getListingByTicker("ABCDEFGHI");
    expect(out).toBeNull();
    expect(state.calls).toEqual([]);
  });

  it("accepts the collision suffix form ACME-2", async () => {
    state.result = { data: null, error: null };
    await getListingByTicker("ACME-2");
    expect(findCall("eq")?.args[1]).toBe("ACME-2");
  });

  it("uses the public view + calls maybeSingle (not single)", async () => {
    state.result = { data: null, error: null };
    await getListingByTicker("ACME");
    expect(findCall("from")?.args[0]).toBe("v_startup_listing_public");
    expect(findCall("maybeSingle")).toBeDefined();
  });

  it("returns the row verbatim on happy path", async () => {
    const row = { ticker: "ACME", name: "Acme" };
    state.result = { data: row, error: null };
    const out = await getListingByTicker("ACME");
    expect(out).toBe(row as never);
  });

  it("returns null when data is null with no error", async () => {
    state.result = { data: null, error: null };
    const out = await getListingByTicker("ACME");
    expect(out).toBeNull();
  });

  it("returns null and does NOT log on relation-does-not-exist error", async () => {
    state.result = {
      data: null,
      error: { message: 'relation "v_startup_listing_public" does not exist' },
    };
    const errSpy = vi.spyOn(console, "error");
    const out = await getListingByTicker("ACME");
    expect(out).toBeNull();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("returns null and logs on any OTHER error", async () => {
    state.result = { data: null, error: { message: "boom" } };
    const errSpy = vi.spyOn(console, "error");
    const out = await getListingByTicker("ACME");
    expect(out).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    expect(String(errSpy.mock.calls[0][0])).toMatch(/getListingByTicker failed/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// submitStartupListing
// ────────────────────────────────────────────────────────────────────────

describe("submitStartupListing", () => {
  it("returns not_configured when getSupabaseAdmin() is null", async () => {
    state.admin = null;
    const out = await submitStartupListing("user-1", { name: "Acme" });
    expect(out).toEqual({ ok: false, reason: "not_configured" });
    expect(state.calls).toEqual([]);
  });

  it("returns name_required on blank name", async () => {
    const out = await submitStartupListing("user-1", { name: "" });
    expect(out).toEqual({ ok: false, reason: "name_required" });
    expect(state.calls).toEqual([]);
  });

  it("returns name_required on whitespace-only name (trims first)", async () => {
    const out = await submitStartupListing("user-1", { name: "   " });
    expect(out).toEqual({ ok: false, reason: "name_required" });
    expect(state.calls).toEqual([]);
  });

  it("returns ticker_generation_failed when the RPC errors", async () => {
    state.rpcResult = { data: null, error: { message: "rpc down" } };
    const errSpy = vi.spyOn(console, "error");
    const out = await submitStartupListing("user-1", { name: "Acme" });
    expect(out).toEqual({ ok: false, reason: "ticker_generation_failed" });
    expect(errSpy).toHaveBeenCalled();
  });

  it("returns ticker_generation_failed when the RPC returns null/blank", async () => {
    state.rpcResult = { data: "   ", error: null };
    const out = await submitStartupListing("user-1", { name: "Acme" });
    expect(out).toEqual({ ok: false, reason: "ticker_generation_failed" });
  });

  it("calls generate_ticker RPC with the trimmed name", async () => {
    state.rpcResult = { data: "ACME", error: null };
    state.insertResult = { error: null };
    await submitStartupListing("user-1", { name: "  Acme  " });
    const rpc = findCall("rpc");
    expect(rpc?.args[0]).toBe("generate_ticker");
    expect(rpc?.args[1]).toEqual({ p_name: "Acme" });
  });

  it("returns db_error when the primary insert fails", async () => {
    state.rpcResult = { data: "ACME", error: null };
    state.insertResult = { error: { message: "duplicate ticker" } };
    const errSpy = vi.spyOn(console, "error");
    const out = await submitStartupListing("user-1", { name: "Acme" });
    expect(out).toEqual({ ok: false, reason: "db_error" });
    expect(errSpy).toHaveBeenCalled();
  });

  it("inserts into startup_listings (not the view) with startup_id = userId", async () => {
    state.rpcResult = { data: "ACME", error: null };
    state.insertResult = { error: null };
    await submitStartupListing("user-42", { name: "Acme" });
    const froms = findAllCalls("from").map((c) => c.args[0]);
    expect(froms).toContain("startup_listings");
    const primaryInsert = findAllCalls("insert")[0];
    const payload = primaryInsert.args[0] as Record<string, unknown>;
    expect(payload.ticker).toBe("ACME");
    expect(payload.startup_id).toBe("user-42");
    expect(payload.name).toBe("Acme");
  });

  it("defaults every optional field to null and is_public to false", async () => {
    state.rpcResult = { data: "ACME", error: null };
    state.insertResult = { error: null };
    await submitStartupListing("user-1", { name: "Acme" });
    const payload = findAllCalls("insert")[0].args[0] as Record<string, unknown>;
    expect(payload.sector).toBeNull();
    expect(payload.stage).toBeNull();
    expect(payload.hq_state).toBeNull();
    expect(payload.website_url).toBeNull();
    expect(payload.one_liner).toBeNull();
    expect(payload.svi_grade).toBeNull();
    expect(payload.svi_score).toBeNull();
    expect(payload.latest_raise_aud_cents).toBeNull();
    expect(payload.is_public).toBe(false);
  });

  it("propagates caller-supplied optional fields verbatim", async () => {
    state.rpcResult = { data: "ACME", error: null };
    state.insertResult = { error: null };
    await submitStartupListing("user-1", {
      name: "Acme",
      sector: "fintech",
      stage: "seed",
      hq_state: "NSW",
      website_url: "https://acme.com",
      one_liner: "AI for finance",
      svi_grade: "A",
      svi_score: 82,
      latest_raise_aud_cents: 500_000_00,
      is_public: true,
    });
    const payload = findAllCalls("insert")[0].args[0] as Record<string, unknown>;
    expect(payload.sector).toBe("fintech");
    expect(payload.stage).toBe("seed");
    expect(payload.hq_state).toBe("NSW");
    expect(payload.website_url).toBe("https://acme.com");
    expect(payload.one_liner).toBe("AI for finance");
    expect(payload.svi_grade).toBe("A");
    expect(payload.svi_score).toBe(82);
    expect(payload.latest_raise_aud_cents).toBe(500_000_00);
    expect(payload.is_public).toBe(true);
  });

  it("fires an audit event row into startup_listing_events on happy path", async () => {
    state.rpcResult = { data: "ACME", error: null };
    state.insertResult = { error: null };
    state.eventInsertResult = { error: null };
    await submitStartupListing("user-1", { name: "Acme" });
    const froms = findAllCalls("from").map((c) => c.args[0]);
    expect(froms).toContain("startup_listing_events");
    const eventInsert = findAllCalls("insert")[1];
    const eventPayload = eventInsert.args[0] as Record<string, unknown>;
    expect(eventPayload.ticker).toBe("ACME");
    expect(eventPayload.kind).toBe("list");
    expect(eventPayload.detail).toEqual({ source: "submitStartupListing" });
  });

  it("still returns ok:true when the audit event insert THROWS (fire-and-forget)", async () => {
    state.rpcResult = { data: "ACME", error: null };
    state.insertResult = { error: null };
    state.eventInsertResult = new Error("events table gone");
    const errSpy = vi.spyOn(console, "error");
    const out = await submitStartupListing("user-1", { name: "Acme" });
    expect(out).toEqual({ ok: true, ticker: "ACME" });
    // The error is logged (never swallowed silently).
    expect(errSpy).toHaveBeenCalled();
  });

  it("returns { ok:true, ticker } on happy path", async () => {
    state.rpcResult = { data: "ACME", error: null };
    state.insertResult = { error: null };
    const out = await submitStartupListing("user-1", { name: "Acme" });
    expect(out).toEqual({ ok: true, ticker: "ACME" });
  });

  it("trims whitespace from the RPC-returned ticker before inserting", async () => {
    state.rpcResult = { data: "  ACME  ", error: null };
    state.insertResult = { error: null };
    const out = await submitStartupListing("user-1", { name: "Acme" });
    expect(out).toEqual({ ok: true, ticker: "ACME" });
    const payload = findAllCalls("insert")[0].args[0] as Record<string, unknown>;
    expect(payload.ticker).toBe("ACME");
  });
});
