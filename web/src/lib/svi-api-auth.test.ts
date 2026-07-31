import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";

// Colocated vitest for the previously-untested server-only SVI-public-data
// API-key module. Distinct from the founder-facing api-keys.ts (which has
// its own colocated coverage) — this powers the institutional-investor
// index-data programme (Free / Team / Institutional tiers).
//
// Uses a fake SupabaseClient covering the six chain shapes the module walks:
//   .from().select().eq().maybeSingle()               ← authenticate lookup
//   .from().update().eq().then()                       ← authenticate fire-and-forget increment
//   .from().select(cols,{count,head}).eq().eq()        ← createSviApiKey pre-check
//   .from().insert().select().single()                 ← createSviApiKey insert
//   .from().select().eq().order()                      ← listSviApiKeys
//   .from().update().eq().eq()                         ← revokeSviApiKey

interface CapturedEq {
  col: string;
  val: unknown;
}

interface FakeState {
  adminConfigured: boolean;
  selectMaybeSingle: { data: unknown; error: unknown } | null;
  selectCountResult: { count: number | null; error: unknown };
  insertSingle: { data: unknown; error: unknown };
  listResult: { data: unknown[] | null; error: unknown };
  updateResult: { error: unknown };
  captured: {
    from: string[];
    selectCols: string | null;
    selectOpts: Record<string, unknown> | null;
    eqs: CapturedEq[];
    orderCol: string | null;
    orderOpts: Record<string, unknown> | null;
    updatePayload: Record<string, unknown> | null;
    insertPayload: Record<string, unknown> | null;
    insertSelectCols: string | null;
  };
}

const state: FakeState = {
  adminConfigured: true,
  selectMaybeSingle: null,
  selectCountResult: { count: 0, error: null },
  insertSingle: { data: { id: "new-id" }, error: null },
  listResult: { data: [], error: null },
  updateResult: { error: null },
  captured: {
    from: [],
    selectCols: null,
    selectOpts: null,
    eqs: [],
    orderCol: null,
    orderOpts: null,
    updatePayload: null,
    insertPayload: null,
    insertSelectCols: null,
  },
};

function resetState() {
  state.adminConfigured = true;
  state.selectMaybeSingle = null;
  state.selectCountResult = { count: 0, error: null };
  state.insertSingle = { data: { id: "new-id" }, error: null };
  state.listResult = { data: [], error: null };
  state.updateResult = { error: null };
  state.captured = {
    from: [],
    selectCols: null,
    selectOpts: null,
    eqs: [],
    orderCol: null,
    orderOpts: null,
    updatePayload: null,
    insertPayload: null,
    insertSelectCols: null,
  };
}

vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return {
      from(table: string) {
        state.captured.from.push(table);
        return {
          select(cols: string, opts?: Record<string, unknown>) {
            state.captured.selectCols = cols;
            state.captured.selectOpts = opts ?? null;
            const chain = {
              eq(col: string, val: unknown) {
                state.captured.eqs.push({ col, val });
                return chain;
              },
              order(col: string, opts?: Record<string, unknown>) {
                state.captured.orderCol = col;
                state.captured.orderOpts = opts ?? null;
                return Promise.resolve(state.listResult);
              },
              maybeSingle() {
                return Promise.resolve(state.selectMaybeSingle ?? { data: null, error: null });
              },
              single() {
                return Promise.resolve(state.insertSingle);
              },
              then<T>(
                onFulfilled?: (v: typeof state.selectCountResult) => T,
                onRejected?: (r: unknown) => T,
              ) {
                return Promise.resolve(state.selectCountResult).then(onFulfilled, onRejected);
              },
            };
            return chain;
          },
          update(payload: Record<string, unknown>) {
            state.captured.updatePayload = payload;
            const chain = {
              eq(col: string, val: unknown) {
                state.captured.eqs.push({ col, val });
                return chain;
              },
              then<T>(
                onFulfilled?: (v: typeof state.updateResult) => T,
                onRejected?: (r: unknown) => T,
              ) {
                return Promise.resolve(state.updateResult).then(onFulfilled, onRejected);
              },
            };
            return chain;
          },
          insert(payload: Record<string, unknown>) {
            state.captured.insertPayload = payload;
            return {
              select(cols: string) {
                state.captured.insertSelectCols = cols;
                return {
                  single() {
                    return Promise.resolve(state.insertSingle);
                  },
                };
              },
            };
          },
        };
      },
    };
  },
}));

import {
  generateSviApiKey,
  hashSviApiKey,
  authenticateSviApiKey,
  createSviApiKey,
  listSviApiKeys,
  revokeSviApiKey,
  SVI_API_TIERS,
} from "./svi-api-auth";

beforeEach(() => {
  resetState();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SVI_API_TIERS", () => {
  it("exposes exactly three canonical tiers with the shipped daily-limit + price ladder", () => {
    expect(Object.keys(SVI_API_TIERS).sort()).toEqual(["free", "institutional", "team"]);
    expect(SVI_API_TIERS.free).toEqual({ dailyLimit: 10, priceAud: 0, label: "Free" });
    expect(SVI_API_TIERS.team).toEqual({ dailyLimit: 1000, priceAud: 199, label: "Team" });
    expect(SVI_API_TIERS.institutional).toEqual({
      dailyLimit: 9_999_999,
      priceAud: 2000,
      label: "Institutional",
    });
  });

  it("daily-limit ladder is strictly monotone free < team < institutional", () => {
    expect(SVI_API_TIERS.free.dailyLimit).toBeLessThan(SVI_API_TIERS.team.dailyLimit);
    expect(SVI_API_TIERS.team.dailyLimit).toBeLessThan(SVI_API_TIERS.institutional.dailyLimit);
  });

  it("price ladder is strictly monotone free (0) < team < institutional", () => {
    expect(SVI_API_TIERS.free.priceAud).toBe(0);
    expect(SVI_API_TIERS.free.priceAud).toBeLessThan(SVI_API_TIERS.team.priceAud);
    expect(SVI_API_TIERS.team.priceAud).toBeLessThan(SVI_API_TIERS.institutional.priceAud);
  });
});

describe("generateSviApiKey", () => {
  it("emits raw / hash / prefix triples with the shipped `svi_live_<48-hex>` format", () => {
    const { raw, hash, prefix } = generateSviApiKey();
    expect(raw).toMatch(/^svi_live_[0-9a-f]{48}$/);
    expect(raw.length).toBe("svi_live_".length + 48);
    // 24 random bytes → 48 hex chars
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(prefix).toBe(raw.slice(0, 16) + "...");
    expect(prefix.length).toBe(19);
  });

  it("hash matches sha256(raw) — the DB stores only the hash, never the raw key", () => {
    const { raw, hash } = generateSviApiKey();
    expect(hash).toBe(createHash("sha256").update(raw).digest("hex"));
  });

  it("consecutive calls yield distinct raw keys (crypto-random not counter-based)", () => {
    const a = generateSviApiKey();
    const b = generateSviApiKey();
    const c = generateSviApiKey();
    expect(a.raw).not.toBe(b.raw);
    expect(b.raw).not.toBe(c.raw);
    expect(a.hash).not.toBe(b.hash);
  });

  it("prefix is a stable 16-char + ellipsis window from the raw key start (safe to log)", () => {
    const { raw, prefix } = generateSviApiKey();
    // Contains the tier-scheme sentinel; safe to log for operator audit.
    expect(prefix.startsWith("svi_live_")).toBe(true);
    expect(prefix.endsWith("...")).toBe(true);
    expect(raw.startsWith(prefix.slice(0, 16))).toBe(true);
  });
});

describe("hashSviApiKey", () => {
  it("returns sha256 hex of the input (deterministic + collision-resistant)", () => {
    const raw = "svi_live_" + "a".repeat(48);
    const expected = createHash("sha256").update(raw).digest("hex");
    expect(hashSviApiKey(raw)).toBe(expected);
  });

  it("empty input still hashes (never throws) — surface guard for a caller passing ''", () => {
    // Contract pin: authenticate short-circuits on the prefix guard before hashing,
    // but the helper itself must not throw on empty input.
    expect(() => hashSviApiKey("")).not.toThrow();
    expect(hashSviApiKey("")).toBe(createHash("sha256").update("").digest("hex"));
  });

  it("output is deterministic — same input yields same hash across calls", () => {
    const raw = "svi_live_" + "b".repeat(48);
    expect(hashSviApiKey(raw)).toBe(hashSviApiKey(raw));
  });
});

function makeReq(headers: Record<string, string> = {}) {
  return new Request("https://svi.blockid.au/api/v1/index", { headers });
}

describe("authenticateSviApiKey", () => {
  it("returns null when the Authorization header is missing (no DB round-trip)", async () => {
    const res = await authenticateSviApiKey(makeReq());
    expect(res).toBeNull();
    expect(state.captured.from).toEqual([]);
  });

  it("returns null when the header is present but not Bearer", async () => {
    const res = await authenticateSviApiKey(
      makeReq({ authorization: "Basic svi_live_abc" }),
    );
    expect(res).toBeNull();
    expect(state.captured.from).toEqual([]);
  });

  it("returns null when the Bearer token does not start with the `svi_live_` scheme", async () => {
    const res = await authenticateSviApiKey(
      makeReq({ authorization: "Bearer bk_live_" + "a".repeat(48) }),
    );
    expect(res).toBeNull();
    expect(state.captured.from).toEqual([]);
  });

  it("returns null when the admin client is not configured (no throw, no partial state)", async () => {
    state.adminConfigured = false;
    const res = await authenticateSviApiKey(
      makeReq({ authorization: "Bearer svi_live_" + "a".repeat(48) }),
    );
    expect(res).toBeNull();
  });

  it("returns null when no row matches (maybeSingle → null)", async () => {
    state.selectMaybeSingle = { data: null, error: null };
    const res = await authenticateSviApiKey(
      makeReq({ authorization: "Bearer svi_live_" + "a".repeat(48) }),
    );
    expect(res).toBeNull();
    expect(state.captured.from).toEqual(["svi_api_keys"]);
    expect(state.captured.eqs).toEqual([
      { col: "key_hash", val: hashSviApiKey("svi_live_" + "a".repeat(48)) },
    ]);
  });

  it("returns null when the matched row is inactive (`is_active=false`)", async () => {
    state.selectMaybeSingle = {
      data: {
        id: "key-1",
        user_id: "u1",
        tier: "free",
        calls_today: 0,
        calls_today_date: "2026-07-31",
        is_active: false,
      },
      error: null,
    };
    const res = await authenticateSviApiKey(
      makeReq({ authorization: "Bearer svi_live_" + "a".repeat(48) }),
    );
    expect(res).toBeNull();
  });

  it("returns null when the caller has already hit their daily limit for today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:00:00.000Z"));
    state.selectMaybeSingle = {
      data: {
        id: "key-1",
        user_id: "u1",
        tier: "free",
        calls_today: 10, // == free daily limit
        calls_today_date: "2026-07-31",
        is_active: true,
      },
      error: null,
    };
    const res = await authenticateSviApiKey(
      makeReq({ authorization: "Bearer svi_live_" + "a".repeat(48) }),
    );
    expect(res).toBeNull();
    // No update fired on the deny path.
    expect(state.captured.updatePayload).toBeNull();
  });

  it("date rollover resets calls_today to 0 (previous day's counter ignored)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:05:00.000Z"));
    state.selectMaybeSingle = {
      data: {
        id: "key-1",
        user_id: "u1",
        tier: "free",
        calls_today: 10, // yesterday's saturation should not block today
        calls_today_date: "2026-07-30",
        is_active: true,
      },
      error: null,
    };
    const res = await authenticateSviApiKey(
      makeReq({ authorization: "Bearer svi_live_" + "a".repeat(48) }),
    );
    expect(res).toEqual({ keyId: "key-1", userId: "u1", tier: "free" });
    // Fire-and-forget increment resets both counter and date.
    // We can't assert on the async .then() before the returned promise resolves,
    // but the sync path already captured the update payload.
    await Promise.resolve();
    expect(state.captured.updatePayload?.calls_today).toBe(1);
    expect(state.captured.updatePayload?.calls_today_date).toBe("2026-07-31");
  });

  it("returns identity + fires the fire-and-forget counter increment on the happy path", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:00:00.000Z"));
    state.selectMaybeSingle = {
      data: {
        id: "key-42",
        user_id: "user-9",
        tier: "team",
        calls_today: 500,
        calls_today_date: "2026-07-31",
        is_active: true,
      },
      error: null,
    };
    const res = await authenticateSviApiKey(
      makeReq({ authorization: "Bearer svi_live_" + "b".repeat(48) }),
    );
    expect(res).toEqual({ keyId: "key-42", userId: "user-9", tier: "team" });
    await Promise.resolve();
    expect(state.captured.updatePayload).toEqual({
      calls_today: 501,
      calls_today_date: "2026-07-31",
      last_used_at: "2026-07-31T12:00:00.000Z",
    });
    // update() filters by id (the eq() call after update).
    const updateEqs = state.captured.eqs.slice(-1);
    expect(updateEqs).toEqual([{ col: "id", val: "key-42" }]);
  });

  it("unknown tier defaults to the free daily limit (10) — safety fallback", async () => {
    state.selectMaybeSingle = {
      data: {
        id: "key-1",
        user_id: "u1",
        tier: "enterprise" as unknown as "free", // rogue value not in SVI_API_TIERS
        calls_today: 10,
        calls_today_date: new Date().toISOString().slice(0, 10),
        is_active: true,
      },
      error: null,
    };
    const res = await authenticateSviApiKey(
      makeReq({ authorization: "Bearer svi_live_" + "c".repeat(48) }),
    );
    // 10 calls at unknown-tier defaults to free (10) → denied.
    expect(res).toBeNull();
  });

  it("Bearer token whitespace is trimmed before the scheme guard", async () => {
    // authHeader.slice(7).trim() must strip leading/trailing spaces on the token itself.
    state.selectMaybeSingle = {
      data: {
        id: "key-1",
        user_id: "u1",
        tier: "free",
        calls_today: 0,
        calls_today_date: new Date().toISOString().slice(0, 10),
        is_active: true,
      },
      error: null,
    };
    const raw = "svi_live_" + "d".repeat(48);
    const res = await authenticateSviApiKey(
      makeReq({ authorization: "Bearer   " + raw + "   " }),
    );
    expect(res).toEqual({ keyId: "key-1", userId: "u1", tier: "free" });
  });

  it("select filters exactly by key_hash (not by raw key) — pins the hash-only DB contract", async () => {
    state.selectMaybeSingle = {
      data: {
        id: "key-1",
        user_id: "u1",
        tier: "free",
        calls_today: 0,
        calls_today_date: new Date().toISOString().slice(0, 10),
        is_active: true,
      },
      error: null,
    };
    const raw = "svi_live_" + "e".repeat(48);
    await authenticateSviApiKey(makeReq({ authorization: "Bearer " + raw }));
    expect(state.captured.eqs[0]).toEqual({ col: "key_hash", val: hashSviApiKey(raw) });
    // Raw key never sent to the DB.
    expect(JSON.stringify(state.captured.eqs)).not.toContain(raw);
  });
});

describe("createSviApiKey", () => {
  it("returns {error} when the admin client is not configured", async () => {
    state.adminConfigured = false;
    const res = await createSviApiKey("user-1");
    expect(res).toEqual({ error: "DB unavailable" });
    expect(state.captured.from).toEqual([]);
  });

  it("returns the max-keys error when the caller already has 5 active keys", async () => {
    state.selectCountResult = { count: 5, error: null };
    const res = await createSviApiKey("user-1");
    expect(res).toEqual({ error: "Maximum 5 active SVI API keys per account." });
    // No insert fired on the cap-hit branch.
    expect(state.captured.insertPayload).toBeNull();
  });

  it("counts only ACTIVE keys against the 5-per-account cap (eq is_active=true)", async () => {
    state.selectCountResult = { count: 5, error: null };
    await createSviApiKey("user-1");
    // Two eq filters: user_id + is_active
    expect(state.captured.eqs).toEqual([
      { col: "user_id", val: "user-1" },
      { col: "is_active", val: true },
    ]);
    expect(state.captured.selectOpts).toEqual({ count: "exact", head: true });
  });

  it("null count is treated as zero (fresh account) and does NOT block creation", async () => {
    state.selectCountResult = { count: null, error: null };
    state.insertSingle = { data: { id: "new-key-id" }, error: null };
    const res = await createSviApiKey("user-fresh");
    expect(res).toHaveProperty("id", "new-key-id");
    expect(res).toHaveProperty("raw");
  });

  it("returns {error:message} when the insert fails — surfaces the DB error verbatim", async () => {
    state.insertSingle = { data: null, error: { message: "duplicate key value" } };
    const res = await createSviApiKey("user-1");
    expect(res).toEqual({ error: "duplicate key value" });
  });

  it("happy path returns {raw, id} — raw is a fresh generated key, id is the DB row id", async () => {
    state.insertSingle = { data: { id: "row-abc" }, error: null };
    const res = await createSviApiKey("user-1");
    if ("error" in res) throw new Error("expected happy path");
    expect(res.id).toBe("row-abc");
    expect(res.raw).toMatch(/^svi_live_[0-9a-f]{48}$/);
    // Insert payload stores only the hash (never the raw key).
    expect(state.captured.insertPayload?.key_hash).toBe(hashSviApiKey(res.raw));
    expect(JSON.stringify(state.captured.insertPayload)).not.toContain(res.raw);
  });

  it("insert payload stamps user_id + prefix + tier + name (all six columns present)", async () => {
    state.insertSingle = { data: { id: "row-1" }, error: null };
    await createSviApiKey("user-42", "team", "Bloomberg feed");
    const p = state.captured.insertPayload ?? {};
    expect(p.user_id).toBe("user-42");
    expect(p.tier).toBe("team");
    expect(p.name).toBe("Bloomberg feed");
    expect(typeof p.key_hash).toBe("string");
    expect(typeof p.key_prefix).toBe("string");
    expect((p.key_prefix as string).endsWith("...")).toBe(true);
  });

  it("name defaults to 'Default' when omitted or blank/whitespace-only", async () => {
    state.insertSingle = { data: { id: "row-1" }, error: null };
    await createSviApiKey("user-1");
    expect(state.captured.insertPayload?.name).toBe("Default");

    resetState();
    state.insertSingle = { data: { id: "row-2" }, error: null };
    await createSviApiKey("user-1", "free", "   ");
    expect(state.captured.insertPayload?.name).toBe("Default");
  });

  it("name is trimmed before insert", async () => {
    state.insertSingle = { data: { id: "row-1" }, error: null };
    await createSviApiKey("user-1", "free", "  My Feed  ");
    expect(state.captured.insertPayload?.name).toBe("My Feed");
  });

  it("default tier is 'free' when the caller omits it", async () => {
    state.insertSingle = { data: { id: "row-1" }, error: null };
    await createSviApiKey("user-1");
    expect(state.captured.insertPayload?.tier).toBe("free");
  });
});

describe("listSviApiKeys", () => {
  it("returns [] when the admin client is not configured", async () => {
    state.adminConfigured = false;
    const res = await listSviApiKeys("user-1");
    expect(res).toEqual([]);
    expect(state.captured.from).toEqual([]);
  });

  it("queries svi_api_keys by user_id and orders by created_at DESC", async () => {
    state.listResult = {
      data: [
        { id: "k2", name: "B", key_prefix: "svi_live_1111...", tier: "team", created_at: "2026-07-30" },
        { id: "k1", name: "A", key_prefix: "svi_live_2222...", tier: "free", created_at: "2026-07-01" },
      ],
      error: null,
    };
    const res = await listSviApiKeys("user-1");
    expect(state.captured.from).toEqual(["svi_api_keys"]);
    expect(state.captured.eqs).toEqual([{ col: "user_id", val: "user-1" }]);
    expect(state.captured.orderCol).toBe("created_at");
    expect(state.captured.orderOpts).toEqual({ ascending: false });
    expect(res).toHaveLength(2);
  });

  it("returns [] (never undefined) when the DB returns null data", async () => {
    state.listResult = { data: null, error: null };
    const res = await listSviApiKeys("user-1");
    expect(res).toEqual([]);
  });
});

describe("revokeSviApiKey", () => {
  it("returns false when the admin client is not configured", async () => {
    state.adminConfigured = false;
    const res = await revokeSviApiKey("user-1", "key-1");
    expect(res).toBe(false);
    expect(state.captured.from).toEqual([]);
  });

  it("soft-deletes (is_active=false) — never a hard DELETE — and filters by (id + user_id)", async () => {
    const res = await revokeSviApiKey("user-1", "key-1");
    expect(res).toBe(true);
    expect(state.captured.from).toEqual(["svi_api_keys"]);
    expect(state.captured.updatePayload).toEqual({ is_active: false });
    // Ownership guard: both id AND user_id filters — prevents cross-tenant revoke.
    expect(state.captured.eqs).toEqual([
      { col: "id", val: "key-1" },
      { col: "user_id", val: "user-1" },
    ]);
  });

  it("returns false when the DB update errors", async () => {
    state.updateResult = { error: { message: "not found" } };
    const res = await revokeSviApiKey("user-1", "key-1");
    expect(res).toBe(false);
  });

  it("returns true when the update succeeds even if zero rows matched (idempotent revoke)", async () => {
    state.updateResult = { error: null };
    const res = await revokeSviApiKey("user-1", "missing-key");
    expect(res).toBe(true);
  });
});
