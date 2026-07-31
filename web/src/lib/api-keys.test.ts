import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";

// Colocated vitest for the previously-untested server-only
// `api-keys.ts` — the BlockID public-API key lifecycle (create / validate /
// list / revoke) + per-minute sliding-window rate limiter. Regressions here
// are security-critical: (a) generateApiKey shipping a shorter random tail
// weakens the 96-bit search space the whole scheme rests on, (b) a bad
// hashApiKey drift silently invalidates every previously-stored key at
// once, (c) the ownership eq() on revokeApiKey being dropped lets any
// caller revoke any other tenant's key, (d) the fire-and-forget
// last_used_at update becoming awaited stalls every authed API request
// under load, (e) the sliding-window buckets losing the "current minute"
// truncation lets a bursty caller double the effective quota.
//
// The fake Supabase mirrors the chain shapes this module walks:
//   .from().select(c,opts).eq().eq()                     ← createApiKey key-count
//                                                          (count/head:true, awaited)
//   .from().insert(payload).select("id").single()        ← createApiKey insert
//   .from().select(cols).eq(k,v).maybeSingle()           ← validateApiKey key lookup
//                                                          + revokeApiKey prefix read
//                                                          + user email lookup
//                                                          + checkRateLimit existing bucket
//   .from().update(payload).eq()                         ← validateApiKey last_used_at
//                                                          + checkRateLimit counter++
//   .from().update(payload).eq().eq()                    ← revokeApiKey ownership guard
//   .from().insert(payload)                              ← checkRateLimit bucket create
//                                                          (awaited)
//   .from().select(cols).eq().order()                    ← listApiKeys

interface CapturedEq {
  col: string;
  val: unknown;
}

interface CapturedOrder {
  col: string;
  opts: Record<string, unknown> | null;
}

interface CapturedCall {
  table: string;
  selectCols: string | null;
  selectOpts: Record<string, unknown> | null;
  insertPayload: unknown;
  updatePayload: unknown;
  eqs: CapturedEq[];
  order: CapturedOrder | null;
  terminal: "single" | "maybeSingle" | "await" | null;
}

interface FakeState {
  adminConfigured: boolean;
  queue: Array<{ data?: unknown; error?: unknown; count?: number | null }>;
  calls: CapturedCall[];
}

const state: FakeState = {
  adminConfigured: true,
  queue: [],
  calls: [],
};

function nextResponse(): { data: unknown; error: unknown; count: number | null } {
  const next = state.queue.shift() ?? {};
  return {
    data: next.data ?? null,
    error: next.error ?? null,
    count: next.count ?? null,
  };
}

function makeChain(table: string) {
  const op: CapturedCall = {
    table,
    selectCols: null,
    selectOpts: null,
    insertPayload: null,
    updatePayload: null,
    eqs: [],
    order: null,
    terminal: null,
  };
  state.calls.push(op);

  const chain: Record<string, unknown> = {};
  chain.select = (cols?: string, opts?: Record<string, unknown>) => {
    op.selectCols = cols ?? null;
    op.selectOpts = opts ?? null;
    return chain;
  };
  chain.insert = (payload: unknown) => {
    op.insertPayload = payload;
    return chain;
  };
  chain.update = (payload: unknown) => {
    op.updatePayload = payload;
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    op.eqs.push({ col, val });
    return chain;
  };
  chain.order = (col: string, opts?: Record<string, unknown>) => {
    op.order = { col, opts: opts ?? null };
    return chain;
  };
  chain.single = () => {
    op.terminal = "single";
    return Promise.resolve(nextResponse());
  };
  chain.maybeSingle = () => {
    op.terminal = "maybeSingle";
    return Promise.resolve(nextResponse());
  };
  chain.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => {
    op.terminal = op.terminal ?? "await";
    return Promise.resolve(nextResponse()).then(onFulfilled, onRejected);
  };
  return chain;
}

vi.mock("server-only", () => ({}));

vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return {
      from: (table: string) => makeChain(table),
    };
  },
}));

const canMock = vi.fn(async () => true);
vi.mock("@/lib/entitlements", () => ({
  can: (...args: unknown[]) => canMock(...args),
}));

const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

function callsFor(table: string): CapturedCall[] {
  return state.calls.filter((c) => c.table === table);
}

beforeEach(() => {
  vi.resetModules();
  state.adminConfigured = true;
  state.queue = [];
  state.calls = [];
  canMock.mockReset();
  canMock.mockResolvedValue(true);
  errorSpy.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// generateApiKey — pure crypto
// ---------------------------------------------------------------------------

describe("api-keys — generateApiKey", () => {
  it("returns raw of shape bk_live_<48 hex chars> (56 chars total)", async () => {
    const { generateApiKey } = await import("./api-keys");
    const { raw } = generateApiKey();
    expect(raw).toMatch(/^bk_live_[0-9a-f]{48}$/);
    expect(raw).toHaveLength(56);
  });

  it("hash is a sha256 hex digest (64 chars) of the raw key", async () => {
    const { generateApiKey } = await import("./api-keys");
    const { raw, hash } = generateApiKey();
    expect(hash).toHaveLength(64);
    expect(hash).toBe(createHash("sha256").update(raw).digest("hex"));
  });

  it("prefix is exactly the first 16 chars of raw + '...' (19 chars total)", async () => {
    const { generateApiKey } = await import("./api-keys");
    const { raw, prefix } = generateApiKey();
    expect(prefix).toBe(raw.slice(0, 16) + "...");
    expect(prefix).toHaveLength(19);
    expect(prefix.startsWith("bk_live_")).toBe(true);
  });

  it("two consecutive calls produce different raw + hash (randomness sanity)", async () => {
    const { generateApiKey } = await import("./api-keys");
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });

  it("raw never leaks into hash/prefix as-is (defence-in-depth)", async () => {
    const { generateApiKey } = await import("./api-keys");
    const { raw, hash, prefix } = generateApiKey();
    expect(hash).not.toBe(raw);
    expect(prefix).not.toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// hashApiKey — pure hasher
// ---------------------------------------------------------------------------

describe("api-keys — hashApiKey", () => {
  it("matches Node crypto's sha256 hex digest of the input", async () => {
    const { hashApiKey } = await import("./api-keys");
    expect(hashApiKey("bk_live_abc")).toBe(
      createHash("sha256").update("bk_live_abc").digest("hex"),
    );
  });

  it("is deterministic — same input, same output", async () => {
    const { hashApiKey } = await import("./api-keys");
    expect(hashApiKey("x")).toBe(hashApiKey("x"));
  });

  it("returns 64 hex chars for any input (including empty string)", async () => {
    const { hashApiKey } = await import("./api-keys");
    expect(hashApiKey("")).toHaveLength(64);
    expect(hashApiKey("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// getRateLimitForPlan — pure lookup
// ---------------------------------------------------------------------------

describe("api-keys — getRateLimitForPlan", () => {
  it("enterprise tier plans get 1000 rpm", async () => {
    const { getRateLimitForPlan } = await import("./api-keys");
    expect(getRateLimitForPlan("founder_enterprise")).toBe(1000);
    expect(getRateLimitForPlan("enterprise")).toBe(1000);
    expect(getRateLimitForPlan("accelerator")).toBe(1000);
    expect(getRateLimitForPlan("pilot")).toBe(1000);
  });

  it("growth/scale tier plans get 100 rpm", async () => {
    const { getRateLimitForPlan } = await import("./api-keys");
    expect(getRateLimitForPlan("founder_scale")).toBe(100);
    expect(getRateLimitForPlan("scale")).toBe(100);
    expect(getRateLimitForPlan("founder_growth")).toBe(100);
    expect(getRateLimitForPlan("growth")).toBe(100);
    expect(getRateLimitForPlan("growth_annual")).toBe(100);
  });

  it("unknown / free / null plans fall through to 60 rpm default", async () => {
    const { getRateLimitForPlan } = await import("./api-keys");
    expect(getRateLimitForPlan(null)).toBe(60);
    expect(getRateLimitForPlan("free")).toBe(60);
    expect(getRateLimitForPlan("something-new")).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// canCreateApiKeys — entitlement bridge
// ---------------------------------------------------------------------------

describe("api-keys — canCreateApiKeys", () => {
  it("returns false when user is null (never calls entitlement)", async () => {
    const { canCreateApiKeys } = await import("./api-keys");
    expect(await canCreateApiKeys(null)).toBe(false);
    expect(canMock).not.toHaveBeenCalled();
  });

  it("delegates to can(user, 'api.access') for any non-null user", async () => {
    canMock.mockResolvedValue(true);
    const { canCreateApiKeys } = await import("./api-keys");
    const ok = await canCreateApiKeys({ id: "u-1", plan: "growth" });
    expect(ok).toBe(true);
    expect(canMock).toHaveBeenCalledTimes(1);
    const args = canMock.mock.calls[0];
    expect(args[1]).toBe("api.access");
  });

  it("normalises missing plan to 'free' and missing segment to 'founder' before delegating", async () => {
    canMock.mockResolvedValue(false);
    const { canCreateApiKeys } = await import("./api-keys");
    await canCreateApiKeys({ id: "u-2", plan: null });
    const uwp = canMock.mock.calls[0][0] as { plan: string; segment: string };
    expect(uwp.plan).toBe("free");
    expect(uwp.segment).toBe("founder");
  });

  it("preserves an explicit segment when one is provided", async () => {
    canMock.mockResolvedValue(false);
    const { canCreateApiKeys } = await import("./api-keys");
    await canCreateApiKeys({ id: "u-3", plan: "growth", segment: "investor" });
    const uwp = canMock.mock.calls[0][0] as { segment: string };
    expect(uwp.segment).toBe("investor");
  });

  it("bubbles the entitlement engine's boolean verdict (both branches)", async () => {
    const { canCreateApiKeys } = await import("./api-keys");
    canMock.mockResolvedValueOnce(false);
    expect(await canCreateApiKeys({ id: "u", plan: "free" })).toBe(false);
    canMock.mockResolvedValueOnce(true);
    expect(await canCreateApiKeys({ id: "u", plan: "growth" })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createApiKey
// ---------------------------------------------------------------------------

describe("api-keys — createApiKey", () => {
  it("returns an entitlement-gate error message when can() is false (no DB writes)", async () => {
    canMock.mockResolvedValue(false);
    const { createApiKey } = await import("./api-keys");
    const res = await createApiKey("u-1", "free");
    expect(res).toEqual({ error: "API keys require a Growth plan or above." });
    expect(state.calls).toHaveLength(0);
  });

  it("returns 'Database not configured.' when supabase admin is null", async () => {
    canMock.mockResolvedValue(true);
    state.adminConfigured = false;
    const { createApiKey } = await import("./api-keys");
    expect(await createApiKey("u-1", "growth")).toEqual({
      error: "Database not configured.",
    });
  });

  it("counts active keys with count:'exact', head:true keyed on user_id + is_active=true", async () => {
    canMock.mockResolvedValue(true);
    state.queue.push({ count: 0 });                       // count-only response
    state.queue.push({ data: { id: "new-key-id" } });     // insert result
    const { createApiKey } = await import("./api-keys");
    await createApiKey("user-x", "growth");
    const [countCall] = callsFor("api_keys");
    expect(countCall.selectCols).toBe("id");
    expect(countCall.selectOpts).toEqual({ count: "exact", head: true });
    expect(countCall.eqs).toEqual([
      { col: "user_id", val: "user-x" },
      { col: "is_active", val: true },
    ]);
  });

  it("caps active keys at 10 — 11th create returns the max-active error and skips insert", async () => {
    canMock.mockResolvedValue(true);
    state.queue.push({ count: 10 });
    const { createApiKey } = await import("./api-keys");
    const res = await createApiKey("u-2", "growth");
    expect(res).toEqual({ error: "Maximum 10 active keys allowed." });
    expect(callsFor("api_keys")).toHaveLength(1); // only the count query
  });

  it("null count is coerced to 0 — first key still allowed", async () => {
    canMock.mockResolvedValue(true);
    state.queue.push({ count: null });
    state.queue.push({ data: { id: "id-1" } });
    const { createApiKey } = await import("./api-keys");
    const res = await createApiKey("u-3", "growth");
    expect("key" in res).toBe(true);
  });

  it("insert payload trims + defaults name to 'Default' when blank/undefined", async () => {
    canMock.mockResolvedValue(true);
    state.queue.push({ count: 0 });
    state.queue.push({ data: { id: "id" } });
    const { createApiKey } = await import("./api-keys");
    await createApiKey("u", "growth", "   ");
    const insertCall = callsFor("api_keys").find((c) => c.insertPayload);
    expect((insertCall?.insertPayload as { name: string }).name).toBe("Default");
  });

  it("insert payload uses the trimmed name when caller supplies a real value", async () => {
    canMock.mockResolvedValue(true);
    state.queue.push({ count: 0 });
    state.queue.push({ data: { id: "id" } });
    const { createApiKey } = await import("./api-keys");
    await createApiKey("u", "growth", "  My Key  ");
    const insertCall = callsFor("api_keys").find((c) => c.insertPayload);
    expect((insertCall?.insertPayload as { name: string }).name).toBe("My Key");
  });

  it("insert payload records rate_limit_per_min derived from the plan", async () => {
    canMock.mockResolvedValue(true);
    state.queue.push({ count: 0 });
    state.queue.push({ data: { id: "id" } });
    const { createApiKey } = await import("./api-keys");
    await createApiKey("u", "enterprise");
    const insertCall = callsFor("api_keys").find((c) => c.insertPayload);
    expect(
      (insertCall?.insertPayload as { rate_limit_per_min: number })
        .rate_limit_per_min,
    ).toBe(1000);
  });

  it("insert payload persists key_hash (sha256 of raw) and key_prefix, NEVER the raw key", async () => {
    canMock.mockResolvedValue(true);
    state.queue.push({ count: 0 });
    state.queue.push({ data: { id: "id" } });
    const { createApiKey } = await import("./api-keys");
    const res = await createApiKey("u", "growth");
    const insertCall = callsFor("api_keys").find((c) => c.insertPayload);
    const payload = insertCall?.insertPayload as {
      key_hash: string;
      key_prefix: string;
      raw?: string;
    };
    expect(payload).not.toHaveProperty("raw");
    expect(payload.key_hash).toBe(
      createHash("sha256").update((res as { key: string }).key).digest("hex"),
    );
    expect(payload.key_prefix.endsWith("...")).toBe(true);
    expect(payload.key_prefix).toHaveLength(19);
  });

  it("returns { key, id } on happy path — raw key is shown once, id echoes DB row", async () => {
    canMock.mockResolvedValue(true);
    state.queue.push({ count: 0 });
    state.queue.push({ data: { id: "abc-123" } });
    const { createApiKey } = await import("./api-keys");
    const res = await createApiKey("u", "growth", "test");
    expect(res).toMatchObject({ id: "abc-123" });
    expect((res as { key: string }).key).toMatch(/^bk_live_[0-9a-f]{48}$/);
  });

  it("logs + returns 'Failed to create API key.' when the insert errors (raw key never leaked)", async () => {
    canMock.mockResolvedValue(true);
    state.queue.push({ count: 0 });
    state.queue.push({ error: { message: "unique_violation" } });
    const { createApiKey } = await import("./api-keys");
    const res = await createApiKey("u", "growth");
    expect(res).toEqual({ error: "Failed to create API key." });
    expect(errorSpy).toHaveBeenCalled();
    expect(res).not.toHaveProperty("key");
  });
});

// ---------------------------------------------------------------------------
// validateApiKey
// ---------------------------------------------------------------------------

describe("api-keys — validateApiKey", () => {
  it("returns {valid:false} when supabase admin is unavailable (no throw)", async () => {
    state.adminConfigured = false;
    const { validateApiKey } = await import("./api-keys");
    expect(await validateApiKey("bk_live_x")).toEqual({ valid: false });
  });

  it("looks up the row by key_hash (never by raw key)", async () => {
    state.queue.push({
      data: {
        id: "k-1",
        user_id: "u-1",
        permissions: ["read"],
        rate_limit_per_min: 60,
        is_active: true,
        expires_at: null,
      },
    });
    // fire-and-forget update chain is built (recorded in state.calls) but
    // never awaited by the SUT, so no queue entry is consumed for it.
    state.queue.push({ data: { email: "u@x" } });
    const { validateApiKey } = await import("./api-keys");
    const raw = "bk_live_deadbeef";
    await validateApiKey(raw);
    const lookup = callsFor("api_keys")[0];
    expect(lookup.eqs[0].col).toBe("key_hash");
    expect(lookup.eqs[0].val).toBe(
      createHash("sha256").update(raw).digest("hex"),
    );
    expect(lookup.terminal).toBe("maybeSingle");
  });

  it("returns {valid:false} on key-lookup error", async () => {
    state.queue.push({ error: { message: "boom" } });
    const { validateApiKey } = await import("./api-keys");
    expect(await validateApiKey("bk_live_x")).toEqual({ valid: false });
  });

  it("returns {valid:false} when no row matches the hash", async () => {
    state.queue.push({ data: null });
    const { validateApiKey } = await import("./api-keys");
    expect(await validateApiKey("bk_live_x")).toEqual({ valid: false });
  });

  it("returns {valid:false} when the key row exists but is_active=false", async () => {
    state.queue.push({
      data: {
        id: "k",
        user_id: "u",
        permissions: [],
        rate_limit_per_min: 60,
        is_active: false,
        expires_at: null,
      },
    });
    const { validateApiKey } = await import("./api-keys");
    expect(await validateApiKey("bk_live_x")).toEqual({ valid: false });
  });

  it("returns {valid:false} when expires_at is in the past", async () => {
    state.queue.push({
      data: {
        id: "k",
        user_id: "u",
        permissions: [],
        rate_limit_per_min: 60,
        is_active: true,
        expires_at: "2020-01-01T00:00:00Z",
      },
    });
    const { validateApiKey } = await import("./api-keys");
    expect(await validateApiKey("bk_live_x")).toEqual({ valid: false });
  });

  it("accepts an expires_at in the future", async () => {
    state.queue.push({
      data: {
        id: "k",
        user_id: "u-2",
        permissions: ["report.read"],
        rate_limit_per_min: 200,
        is_active: true,
        expires_at: "2099-01-01T00:00:00Z",
      },
    });
    state.queue.push({ data: { email: "u2@x" } });
    const { validateApiKey } = await import("./api-keys");
    const res = await validateApiKey("bk_live_x");
    expect(res.valid).toBe(true);
    expect(res.userId).toBe("u-2");
  });

  it("returns the full ValidatedKey payload (permissions/rateLimit/email/keyHash) on happy path", async () => {
    state.queue.push({
      data: {
        id: "k",
        user_id: "u",
        permissions: ["report.read", "svi.run"],
        rate_limit_per_min: 100,
        is_active: true,
        expires_at: null,
      },
    });
    state.queue.push({ data: { email: "founder@example.com" } });
    const raw = "bk_live_abcdef";
    const { validateApiKey } = await import("./api-keys");
    const res = await validateApiKey(raw);
    expect(res).toEqual({
      valid: true,
      userId: "u",
      email: "founder@example.com",
      permissions: ["report.read", "svi.run"],
      rateLimitPerMin: 100,
      keyHash: createHash("sha256").update(raw).digest("hex"),
    });
  });

  it("permissions defaults to [] when the row's permissions column is null", async () => {
    state.queue.push({
      data: {
        id: "k",
        user_id: "u",
        permissions: null,
        rate_limit_per_min: 60,
        is_active: true,
        expires_at: null,
      },
    });
    state.queue.push({ data: null });
    const { validateApiKey } = await import("./api-keys");
    const res = await validateApiKey("bk_live_x");
    expect(res.permissions).toEqual([]);
    expect(res.email).toBeUndefined();
  });

  it("issues the last_used_at update against api_keys keyed on id (fire-and-forget)", async () => {
    state.queue.push({
      data: {
        id: "key-id-42",
        user_id: "u",
        permissions: [],
        rate_limit_per_min: 60,
        is_active: true,
        expires_at: null,
      },
    });
    state.queue.push({ data: { email: "e" } });
    const { validateApiKey } = await import("./api-keys");
    await validateApiKey("bk_live_x");
    const updateCall = callsFor("api_keys").find((c) => c.updatePayload);
    expect(updateCall?.eqs).toEqual([{ col: "id", val: "key-id-42" }]);
    expect(
      (updateCall?.updatePayload as { last_used_at: string }).last_used_at,
    ).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("looks up the app_users email keyed on user_id (never on hash / key_id)", async () => {
    state.queue.push({
      data: {
        id: "k",
        user_id: "user-abc",
        permissions: [],
        rate_limit_per_min: 60,
        is_active: true,
        expires_at: null,
      },
    });
    state.queue.push({ data: { email: "e" } });
    const { validateApiKey } = await import("./api-keys");
    await validateApiKey("bk_live_x");
    const usersCall = callsFor("app_users")[0];
    expect(usersCall.selectCols).toBe("email");
    expect(usersCall.eqs).toEqual([{ col: "id", val: "user-abc" }]);
    expect(usersCall.terminal).toBe("maybeSingle");
  });
});

// ---------------------------------------------------------------------------
// checkRateLimit
// ---------------------------------------------------------------------------

describe("api-keys — checkRateLimit", () => {
  it("allows unlimited when supabase admin is null (returns full budget + non-null resetAt)", async () => {
    state.adminConfigured = false;
    const { checkRateLimit } = await import("./api-keys");
    const res = await checkRateLimit("hash", 60);
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(60);
    expect(res.resetAt).toBeInstanceOf(Date);
  });

  it("windowStart is truncated to the current minute; resetAt is +60s", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12, 34, 45, 678));
    state.queue.push({ data: null });     // no existing bucket
    state.queue.push({});                 // insert
    const { checkRateLimit } = await import("./api-keys");
    const res = await checkRateLimit("h", 60);
    expect(res.resetAt.getSeconds()).toBe(0);
    expect(res.resetAt.getMilliseconds()).toBe(0);
    // 12:34:45 → windowStart 12:34:00 → resetAt 12:35:00
    expect(res.resetAt.getMinutes()).toBe(35);
  });

  it("select bucket keyed on key_hash + window_start (ISO string)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12, 34, 45));
    state.queue.push({ data: { request_count: 3 } });
    state.queue.push({});
    const { checkRateLimit } = await import("./api-keys");
    await checkRateLimit("hash-xyz", 10);
    const [sel] = callsFor("api_rate_limits");
    expect(sel.selectCols).toBe("request_count");
    expect(sel.eqs[0]).toEqual({ col: "key_hash", val: "hash-xyz" });
    expect(sel.eqs[1].col).toBe("window_start");
    // ISO of Date(2026, 6, 15, 12, 34, 0, 0) — the truncated minute
    expect(String(sel.eqs[1].val)).toBe(
      new Date(2026, 6, 15, 12, 34, 0, 0).toISOString(),
    );
    expect(sel.terminal).toBe("maybeSingle");
  });

  it("blocks when currentCount >= limit — remaining 0, no DB write", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12, 34, 45));
    state.queue.push({ data: { request_count: 60 } });
    const { checkRateLimit } = await import("./api-keys");
    const res = await checkRateLimit("h", 60);
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
    // Only the select happened — no update/insert follow-up.
    expect(callsFor("api_rate_limits")).toHaveLength(1);
  });

  it("increments the existing bucket via UPDATE — targets same (key_hash, window_start)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12, 34, 45));
    state.queue.push({ data: { request_count: 4 } });
    state.queue.push({});
    const { checkRateLimit } = await import("./api-keys");
    await checkRateLimit("h", 10);
    const update = callsFor("api_rate_limits").find((c) => c.updatePayload);
    expect((update?.updatePayload as { request_count: number }).request_count).toBe(5);
    expect(update?.eqs.map((e) => e.col)).toEqual(["key_hash", "window_start"]);
  });

  it("returns remaining = limit - currentCount - 1 (accounts for the just-incremented request)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12, 34, 45));
    state.queue.push({ data: { request_count: 4 } });
    state.queue.push({});
    const { checkRateLimit } = await import("./api-keys");
    const res = await checkRateLimit("h", 10);
    expect(res.remaining).toBe(5); // 10 - 4 - 1
    expect(res.allowed).toBe(true);
  });

  it("first request in a new window issues an INSERT with request_count=1", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12, 34, 45));
    state.queue.push({ data: null }); // no bucket
    state.queue.push({});             // insert ok
    const { checkRateLimit } = await import("./api-keys");
    const res = await checkRateLimit("brand-new-hash", 100);
    const ins = callsFor("api_rate_limits").find((c) => c.insertPayload);
    expect(ins).toBeDefined();
    const payload = ins?.insertPayload as {
      key_hash: string;
      window_start: string;
      request_count: number;
    };
    expect(payload.key_hash).toBe("brand-new-hash");
    expect(payload.request_count).toBe(1);
    // remaining = 100 - 0 - 1 = 99
    expect(res.remaining).toBe(99);
    expect(res.allowed).toBe(true);
  });

  it("null request_count on the existing row is treated as 0", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12, 34, 45));
    state.queue.push({ data: { request_count: null } });
    state.queue.push({});
    const { checkRateLimit } = await import("./api-keys");
    const res = await checkRateLimit("h", 60);
    expect(res.remaining).toBe(59);
    // The update path (since existing row exists) not insert.
    const update = callsFor("api_rate_limits").find((c) => c.updatePayload);
    expect((update?.updatePayload as { request_count: number }).request_count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// listApiKeys
// ---------------------------------------------------------------------------

describe("api-keys — listApiKeys", () => {
  it("returns [] when supabase admin is null", async () => {
    state.adminConfigured = false;
    const { listApiKeys } = await import("./api-keys");
    expect(await listApiKeys("u")).toEqual([]);
  });

  it("selects only the display columns (never key_hash) keyed on user_id, newest first", async () => {
    state.queue.push({ data: [] });
    const { listApiKeys } = await import("./api-keys");
    await listApiKeys("user-abc");
    const [call] = callsFor("api_keys");
    expect(call.selectCols).toContain("id");
    expect(call.selectCols).toContain("key_prefix");
    expect(call.selectCols).not.toContain("key_hash");
    expect(call.eqs).toEqual([{ col: "user_id", val: "user-abc" }]);
    expect(call.order).toEqual({ col: "created_at", opts: { ascending: false } });
  });

  it("returns [] and logs on query error", async () => {
    state.queue.push({ error: { message: "boom" } });
    const { listApiKeys } = await import("./api-keys");
    expect(await listApiKeys("u")).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("maps snake_case DB rows into camelCase ApiKeyInfo — never leaks key_hash into the result", async () => {
    state.queue.push({
      data: [
        {
          id: "k1",
          name: "Prod",
          key_prefix: "bk_live_deadbeef...",
          is_active: true,
          last_used_at: "2026-07-01T00:00:00Z",
          created_at: "2026-06-01T00:00:00Z",
          permissions: ["report.read"],
          rate_limit_per_min: 100,
        },
      ],
    });
    const { listApiKeys } = await import("./api-keys");
    const rows = await listApiKeys("u");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: "k1",
      name: "Prod",
      prefix: "bk_live_deadbeef...",
      isActive: true,
      lastUsedAt: "2026-07-01T00:00:00Z",
      createdAt: "2026-06-01T00:00:00Z",
      permissions: ["report.read"],
      rateLimitPerMin: 100,
    });
    expect(rows[0]).not.toHaveProperty("key_hash");
  });

  it("null permissions collapses to [] and null last_used_at stays null", async () => {
    state.queue.push({
      data: [
        {
          id: "k2",
          name: "Test",
          key_prefix: "bk_live_x...",
          is_active: false,
          last_used_at: null,
          created_at: "2026-06-01T00:00:00Z",
          permissions: null,
          rate_limit_per_min: 60,
        },
      ],
    });
    const { listApiKeys } = await import("./api-keys");
    const [row] = await listApiKeys("u");
    expect(row.permissions).toEqual([]);
    expect(row.lastUsedAt).toBeNull();
    expect(row.isActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// revokeApiKey
// ---------------------------------------------------------------------------

describe("api-keys — revokeApiKey", () => {
  it("errors when supabase admin is null (no DB call attempted)", async () => {
    state.adminConfigured = false;
    const { revokeApiKey } = await import("./api-keys");
    expect(await revokeApiKey("k", "u")).toEqual({
      ok: false,
      error: "Database not configured.",
    });
  });

  it("reads key_prefix scoped to (id, user_id) BEFORE flipping is_active — needed for the audit log", async () => {
    state.queue.push({ data: { key_prefix: "bk_live_abc..." } });
    state.queue.push({}); // update ok
    const { revokeApiKey } = await import("./api-keys");
    const res = await revokeApiKey("k-1", "u-1");
    expect(res.ok).toBe(true);
    expect(res.keyPrefix).toBe("bk_live_abc...");
    const [read] = callsFor("api_keys");
    expect(read.selectCols).toBe("key_prefix");
    expect(read.eqs).toEqual([
      { col: "id", val: "k-1" },
      { col: "user_id", val: "u-1" },
    ]);
    expect(read.terminal).toBe("maybeSingle");
  });

  it("update flips is_active to false with BOTH (id, user_id) eq guards — ownership check must not be dropped", async () => {
    state.queue.push({ data: { key_prefix: "p" } });
    state.queue.push({});
    const { revokeApiKey } = await import("./api-keys");
    await revokeApiKey("k-2", "owner-42");
    const update = callsFor("api_keys").find((c) => c.updatePayload);
    expect((update?.updatePayload as { is_active: boolean }).is_active).toBe(false);
    expect(update?.eqs).toEqual([
      { col: "id", val: "k-2" },
      { col: "user_id", val: "owner-42" },
    ]);
  });

  it("returns keyPrefix undefined when the pre-read miss occurs but revoke still succeeds", async () => {
    state.queue.push({ data: null });
    state.queue.push({});
    const { revokeApiKey } = await import("./api-keys");
    const res = await revokeApiKey("k-3", "u");
    expect(res).toEqual({ ok: true, keyPrefix: undefined });
  });

  it("logs + returns {ok:false, error:'Failed to revoke key.'} on update error", async () => {
    state.queue.push({ data: { key_prefix: "p" } });
    state.queue.push({ error: { message: "boom" } });
    const { revokeApiKey } = await import("./api-keys");
    const res = await revokeApiKey("k-4", "u");
    expect(res).toEqual({ ok: false, error: "Failed to revoke key." });
    expect(errorSpy).toHaveBeenCalled();
  });
});
