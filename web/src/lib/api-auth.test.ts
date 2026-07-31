import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for the server-only BlockID API auth wrapper
// (`web/src/lib/api-auth.ts`) — the unified entry-point every /api/**
// route uses to accept EITHER a `Bearer bk_live_<key>` header OR a
// session cookie, and the flat `authenticateAPIKey` wrapper the
// public /api/v1/* endpoints call.
//
// Silent regressions here are load-bearing:
//   - dropping the `Bearer bk_live_` prefix guard would let a bare
//     "Bearer <anything>" header fall through to `validateApiKey`
//     and burn a rate-limit token on every request
//   - dropping the "invalid key → do NOT fall back to session" rule
//     would let a rejected API key silently upgrade to a session
//     cookie's identity — the wrong user_id lands on the row
//   - dropping the null-user fallback on the session path would 500
//     every logged-out /api/** route instead of returning 401
//   - the /api/v1/* wrapper's `plan="free"` default is what the
//     downstream feature-gate uses to decide entitlement — if a
//     null `app_users` row silently becomes `plan=undefined` the
//     gate opens for a caller who has no plan record at all
//
// Pins the observable contract used by every caller:
//   - authenticateRequest: prefix guard, invalid-key no-session-
//     fallback, rate-limit denial returns null (not throws), email
//     null-safe default (""), permissions passthrough, session
//     fallback shape (authMethod="session", no rateLimit)
//   - authenticateApiKey: rate-limited returns {rateLimited:true}
//     NOT null (distinct from authenticateRequest — the caller
//     needs the rateLimit info to emit 429 + Retry-After headers)
//   - authenticateAPIKey (public v1): no-supabase-admin degrades to
//     plan="free" (not throw), null user row → plan="free", null
//     plan column → plan="free", email prefers app_users over
//     validated.email but falls back through, keyId always echoes
//     validated.keyHash so the caller can log which key hit
//
// Mocks:
//   - ./auth (getCurrentUser)
//   - ./api-keys (validateApiKey + checkRateLimit)
//   - ./supabase (getSupabaseAdmin — dynamically imported inside
//     the /api/v1/* wrapper so the module load-order is preserved)

interface FakeState {
  currentUser: { id: string; email: string } | null;
  validated: {
    valid: boolean;
    userId?: string;
    email?: string;
    permissions?: string[];
    rateLimitPerMin?: number;
    keyHash?: string;
  };
  rateLimit: { allowed: boolean; remaining: number; resetAt: Date };
  validateCalls: string[];
  rateLimitCalls: Array<{ keyHash: string; limit: number }>;
  supabase: {
    adminConfigured: boolean;
    userRow: { email?: string | null; plan?: string | null } | null;
    userError: unknown;
    lastEq: { col: string; val: unknown } | null;
    lastSelect: string | null;
  };
}

const state: FakeState = {
  currentUser: null,
  validated: { valid: false },
  rateLimit: {
    allowed: true,
    remaining: 100,
    resetAt: new Date("2026-01-01T00:01:00.000Z"),
  },
  validateCalls: [],
  rateLimitCalls: [],
  supabase: {
    adminConfigured: true,
    userRow: null,
    userError: null,
    lastEq: null,
    lastSelect: null,
  },
};

vi.mock("./auth", () => ({
  getCurrentUser: async () => state.currentUser,
}));

vi.mock("./api-keys", () => ({
  validateApiKey: async (raw: string) => {
    state.validateCalls.push(raw);
    return state.validated;
  },
  checkRateLimit: async (keyHash: string, limit: number) => {
    state.rateLimitCalls.push({ keyHash, limit });
    return state.rateLimit;
  },
}));

vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.supabase.adminConfigured) return null;
    return {
      from: (_table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = (cols: string) => {
          state.supabase.lastSelect = cols;
          return chain;
        };
        chain.eq = (col: string, val: unknown) => {
          state.supabase.lastEq = { col, val };
          return chain;
        };
        chain.maybeSingle = () =>
          Promise.resolve({
            data: state.supabase.userRow,
            error: state.supabase.userError,
          });
        return chain;
      },
    };
  },
}));

beforeEach(() => {
  state.currentUser = null;
  state.validated = { valid: false };
  state.rateLimit = {
    allowed: true,
    remaining: 100,
    resetAt: new Date("2026-01-01T00:01:00.000Z"),
  };
  state.validateCalls = [];
  state.rateLimitCalls = [];
  state.supabase.adminConfigured = true;
  state.supabase.userRow = null;
  state.supabase.userError = null;
  state.supabase.lastEq = null;
  state.supabase.lastSelect = null;
});

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://blockid.au/api/x", { headers });
}

// ---------------------------------------------------------------------------
// authenticateRequest — dual-mode (API key OR session)
// ---------------------------------------------------------------------------

describe("api-auth — authenticateRequest", () => {
  it("no Authorization header + no session → null", async () => {
    const { authenticateRequest } = await import("./api-auth");
    const out = await authenticateRequest(req());
    expect(out).toBeNull();
    // Session was checked, but no API-key branch ran
    expect(state.validateCalls).toHaveLength(0);
    expect(state.rateLimitCalls).toHaveLength(0);
  });

  it("no Authorization header + valid session → session AuthResult (no rateLimit)", async () => {
    state.currentUser = { id: "u-1", email: "founder@example.com" };
    const { authenticateRequest } = await import("./api-auth");
    const out = await authenticateRequest(req());
    expect(out).toEqual({
      auth: {
        userId: "u-1",
        email: "founder@example.com",
        authMethod: "session",
      },
    });
    // Session hits do NOT surface rateLimit info
    expect((out as { rateLimit?: unknown }).rateLimit).toBeUndefined();
    expect(state.validateCalls).toHaveLength(0);
  });

  it("Authorization present but NOT `Bearer bk_live_` prefix → falls back to session", async () => {
    // e.g. an OAuth JWT — must not burn an API-key validation call
    state.currentUser = { id: "u-2", email: "s@x.com" };
    const { authenticateRequest } = await import("./api-auth");
    const out = await authenticateRequest(
      req({ authorization: "Bearer eyJhbGciOi.session.jwt" }),
    );
    expect(out?.auth.authMethod).toBe("session");
    expect(state.validateCalls).toHaveLength(0);
  });

  it("Authorization prefix check is case-sensitive on `bk_live_` (lowercase-only)", async () => {
    // Guard against silently accepting `Bearer BK_LIVE_...` — the DB
    // stores lowercase-hashed keys, so an uppercase variant would
    // never validate anyway but we must not even try (avoid burning
    // a validateApiKey DB call on a garbage header).
    state.currentUser = null;
    const { authenticateRequest } = await import("./api-auth");
    const out = await authenticateRequest(
      req({ authorization: "Bearer BK_LIVE_abcdef" }),
    );
    expect(out).toBeNull();
    expect(state.validateCalls).toHaveLength(0);
  });

  it("Bearer bk_live_ + invalid key → null (does NOT fall back to session)", async () => {
    // Critical: a bogus API key must NOT silently upgrade to the
    // session cookie's identity — that would pin the wrong user
    // onto every write.
    state.currentUser = { id: "u-3", email: "s@x.com" };
    state.validated = { valid: false };
    const { authenticateRequest } = await import("./api-auth");
    const out = await authenticateRequest(
      req({ authorization: "Bearer bk_live_bad" }),
    );
    expect(out).toBeNull();
    expect(state.validateCalls).toEqual(["bk_live_bad"]);
    expect(state.rateLimitCalls).toHaveLength(0);
  });

  it("Bearer bk_live_ + valid key but missing userId → null (guards a partial ValidatedKey shape)", async () => {
    state.validated = { valid: true, userId: undefined };
    const { authenticateRequest } = await import("./api-auth");
    const out = await authenticateRequest(
      req({ authorization: "Bearer bk_live_x" }),
    );
    expect(out).toBeNull();
    expect(state.rateLimitCalls).toHaveLength(0);
  });

  it("Bearer bk_live_ + valid key + rate-limited → null (caller must inspect via authenticateApiKey for 429 detail)", async () => {
    state.validated = {
      valid: true,
      userId: "u-4",
      email: "a@b.com",
      keyHash: "h-4",
      rateLimitPerMin: 60,
    };
    state.rateLimit = {
      allowed: false,
      remaining: 0,
      resetAt: new Date("2026-01-01T00:02:00.000Z"),
    };
    const { authenticateRequest } = await import("./api-auth");
    const out = await authenticateRequest(
      req({ authorization: "Bearer bk_live_ok" }),
    );
    expect(out).toBeNull();
    expect(state.rateLimitCalls).toEqual([{ keyHash: "h-4", limit: 60 }]);
  });

  it("Bearer bk_live_ + valid key + within limit → api_key AuthResult + rateLimit", async () => {
    const resetAt = new Date("2026-01-01T00:05:00.000Z");
    state.validated = {
      valid: true,
      userId: "u-5",
      email: "founder@blockid.au",
      permissions: ["read:startup", "write:cap_table"],
      keyHash: "h-5",
      rateLimitPerMin: 120,
    };
    state.rateLimit = { allowed: true, remaining: 119, resetAt };
    const { authenticateRequest } = await import("./api-auth");
    const out = await authenticateRequest(
      req({ authorization: "Bearer bk_live_ok" }),
    );
    expect(out).toEqual({
      auth: {
        userId: "u-5",
        email: "founder@blockid.au",
        authMethod: "api_key",
        permissions: ["read:startup", "write:cap_table"],
      },
      rateLimit: { remaining: 119, resetAt },
    });
  });

  it("Bearer bk_live_ + valid key + no email on ValidatedKey → email defaults to '' (never undefined)", async () => {
    state.validated = {
      valid: true,
      userId: "u-6",
      email: undefined,
      permissions: [],
      keyHash: "h-6",
      rateLimitPerMin: 30,
    };
    const { authenticateRequest } = await import("./api-auth");
    const out = await authenticateRequest(
      req({ authorization: "Bearer bk_live_ok" }),
    );
    expect(out?.auth.email).toBe("");
  });

  it("strips exactly the 7-char `Bearer ` prefix — the raw key is forwarded verbatim to validateApiKey", async () => {
    // Regression guard: if the slice ever drifts (e.g. slice(6) or a
    // trim() that mangles a trailing signature) the DB lookup misses.
    state.validated = {
      valid: true,
      userId: "u-7",
      keyHash: "h-7",
      rateLimitPerMin: 10,
    };
    const { authenticateRequest } = await import("./api-auth");
    await authenticateRequest(
      req({ authorization: "Bearer bk_live_ABC123.sig" }),
    );
    expect(state.validateCalls).toEqual(["bk_live_ABC123.sig"]);
  });
});

// ---------------------------------------------------------------------------
// authenticateApiKey — API-key only, exposes rate-limit info on denial
// ---------------------------------------------------------------------------

describe("api-auth — authenticateApiKey", () => {
  it("no Authorization header → null (never touches validateApiKey)", async () => {
    const { authenticateApiKey } = await import("./api-auth");
    const out = await authenticateApiKey(req());
    expect(out).toBeNull();
    expect(state.validateCalls).toHaveLength(0);
  });

  it("Authorization without `Bearer bk_live_` prefix → null", async () => {
    const { authenticateApiKey } = await import("./api-auth");
    const out = await authenticateApiKey(
      req({ authorization: "Bearer sk_test_xyz" }),
    );
    expect(out).toBeNull();
    expect(state.validateCalls).toHaveLength(0);
  });

  it("invalid key → null", async () => {
    state.validated = { valid: false };
    const { authenticateApiKey } = await import("./api-auth");
    const out = await authenticateApiKey(
      req({ authorization: "Bearer bk_live_bad" }),
    );
    expect(out).toBeNull();
    expect(state.rateLimitCalls).toHaveLength(0);
  });

  it("valid key + WITHIN rate limit → auth + rateLimit + rateLimited:false", async () => {
    const resetAt = new Date("2026-01-01T00:03:00.000Z");
    state.validated = {
      valid: true,
      userId: "u-a",
      email: "a@b.com",
      permissions: ["read:startup"],
      keyHash: "h-a",
      rateLimitPerMin: 60,
    };
    state.rateLimit = { allowed: true, remaining: 42, resetAt };
    const { authenticateApiKey } = await import("./api-auth");
    const out = await authenticateApiKey(
      req({ authorization: "Bearer bk_live_ok" }),
    );
    expect(out).toEqual({
      auth: {
        userId: "u-a",
        email: "a@b.com",
        authMethod: "api_key",
        permissions: ["read:startup"],
      },
      rateLimit: { remaining: 42, resetAt },
      rateLimited: false,
    });
  });

  it("valid key + RATE-LIMITED → returns full envelope with rateLimited:true (NOT null — caller needs the info to build 429)", async () => {
    // This is the key semantic difference from authenticateRequest:
    // authenticateApiKey preserves the rate-limit info so the route
    // can emit `Retry-After` + `X-RateLimit-*` headers, and only
    // then reply 429.
    const resetAt = new Date("2026-01-01T00:04:00.000Z");
    state.validated = {
      valid: true,
      userId: "u-b",
      email: "b@c.com",
      keyHash: "h-b",
      rateLimitPerMin: 30,
    };
    state.rateLimit = { allowed: false, remaining: 0, resetAt };
    const { authenticateApiKey } = await import("./api-auth");
    const out = await authenticateApiKey(
      req({ authorization: "Bearer bk_live_ok" }),
    );
    expect(out).not.toBeNull();
    expect(out?.rateLimited).toBe(true);
    expect(out?.rateLimit).toEqual({ remaining: 0, resetAt });
    // auth payload is still present — the route can log which caller
    // hit the ceiling
    expect(out?.auth.userId).toBe("u-b");
  });

  it("valid key + no email on ValidatedKey → auth.email = '' (never undefined)", async () => {
    state.validated = {
      valid: true,
      userId: "u-c",
      email: undefined,
      keyHash: "h-c",
      rateLimitPerMin: 15,
    };
    const { authenticateApiKey } = await import("./api-auth");
    const out = await authenticateApiKey(
      req({ authorization: "Bearer bk_live_ok" }),
    );
    expect(out?.auth.email).toBe("");
  });
});

// ---------------------------------------------------------------------------
// authenticateAPIKey — flat public /api/v1/* wrapper (plan-aware)
// ---------------------------------------------------------------------------

describe("api-auth — authenticateAPIKey (public v1)", () => {
  it("no Authorization header → null", async () => {
    const { authenticateAPIKey } = await import("./api-auth");
    const out = await authenticateAPIKey(req());
    expect(out).toBeNull();
    expect(state.validateCalls).toHaveLength(0);
  });

  it("wrong prefix → null (never hits validate)", async () => {
    const { authenticateAPIKey } = await import("./api-auth");
    const out = await authenticateAPIKey(
      req({ authorization: "Basic dXNlcjpwYXNz" }),
    );
    expect(out).toBeNull();
    expect(state.validateCalls).toHaveLength(0);
  });

  it("invalid key → null", async () => {
    state.validated = { valid: false };
    const { authenticateAPIKey } = await import("./api-auth");
    const out = await authenticateAPIKey(
      req({ authorization: "Bearer bk_live_bad" }),
    );
    expect(out).toBeNull();
  });

  it("valid key + RATE-LIMITED → null (v1 wrapper collapses limit denial into 401-style null; caller must emit 429 via headers)", async () => {
    state.validated = {
      valid: true,
      userId: "u-d",
      email: "d@e.com",
      keyHash: "h-d",
      rateLimitPerMin: 60,
    };
    state.rateLimit = {
      allowed: false,
      remaining: 0,
      resetAt: new Date("2026-01-01T00:06:00.000Z"),
    };
    const { authenticateAPIKey } = await import("./api-auth");
    const out = await authenticateAPIKey(
      req({ authorization: "Bearer bk_live_ok" }),
    );
    expect(out).toBeNull();
    // Supabase user-lookup must NOT run when rate-limited (wasted round-trip)
    expect(state.supabase.lastSelect).toBeNull();
  });

  it("valid key + allowed + app_users row with plan → echoes plan + email + keyId", async () => {
    state.validated = {
      valid: true,
      userId: "u-e",
      email: "fallback@x.com",
      keyHash: "h-e",
      rateLimitPerMin: 60,
    };
    state.supabase.userRow = { email: "primary@blockid.au", plan: "growth" };
    const { authenticateAPIKey } = await import("./api-auth");
    const out = await authenticateAPIKey(
      req({ authorization: "Bearer bk_live_ok" }),
    );
    expect(out).toEqual({
      userId: "u-e",
      email: "primary@blockid.au",
      keyId: "h-e",
      plan: "growth",
    });
    // Pin the exact projection + filter shape so a schema-rename
    // doesn't silently break the plan lookup
    expect(state.supabase.lastSelect).toBe("email, plan");
    expect(state.supabase.lastEq).toEqual({ col: "id", val: "u-e" });
  });

  it("valid key + allowed + supabase admin not configured → plan defaults to 'free' (never throws)", async () => {
    state.supabase.adminConfigured = false;
    state.validated = {
      valid: true,
      userId: "u-f",
      email: "f@g.com",
      keyHash: "h-f",
      rateLimitPerMin: 60,
    };
    const { authenticateAPIKey } = await import("./api-auth");
    const out = await authenticateAPIKey(
      req({ authorization: "Bearer bk_live_ok" }),
    );
    expect(out).toEqual({
      userId: "u-f",
      email: "f@g.com",
      keyId: "h-f",
      plan: "free",
    });
  });

  it("valid key + allowed + app_users row missing → plan='free', email falls back to validated.email", async () => {
    state.validated = {
      valid: true,
      userId: "u-g",
      email: "validated@x.com",
      keyHash: "h-g",
      rateLimitPerMin: 60,
    };
    state.supabase.userRow = null;
    const { authenticateAPIKey } = await import("./api-auth");
    const out = await authenticateAPIKey(
      req({ authorization: "Bearer bk_live_ok" }),
    );
    expect(out).toEqual({
      userId: "u-g",
      email: "validated@x.com",
      keyId: "h-g",
      plan: "free",
    });
  });

  it("valid key + allowed + app_users row has null plan column → plan='free' (nullish-coalesce guard)", async () => {
    state.validated = {
      valid: true,
      userId: "u-h",
      email: "h@i.com",
      keyHash: "h-h",
      rateLimitPerMin: 60,
    };
    state.supabase.userRow = { email: "h@i.com", plan: null };
    const { authenticateAPIKey } = await import("./api-auth");
    const out = await authenticateAPIKey(
      req({ authorization: "Bearer bk_live_ok" }),
    );
    expect(out?.plan).toBe("free");
  });

  it("valid key + allowed + app_users row has null email → keeps validated.email fallback", async () => {
    state.validated = {
      valid: true,
      userId: "u-i",
      email: "validated@x.com",
      keyHash: "h-i",
      rateLimitPerMin: 60,
    };
    state.supabase.userRow = { email: null, plan: "founding50" };
    const { authenticateAPIKey } = await import("./api-auth");
    const out = await authenticateAPIKey(
      req({ authorization: "Bearer bk_live_ok" }),
    );
    expect(out?.email).toBe("validated@x.com");
    expect(out?.plan).toBe("founding50");
  });

  it("valid key + allowed + validated has no email + no app_users row → email defaults to ''", async () => {
    state.validated = {
      valid: true,
      userId: "u-j",
      email: undefined,
      keyHash: "h-j",
      rateLimitPerMin: 60,
    };
    state.supabase.userRow = null;
    const { authenticateAPIKey } = await import("./api-auth");
    const out = await authenticateAPIKey(
      req({ authorization: "Bearer bk_live_ok" }),
    );
    expect(out?.email).toBe("");
  });

  it("keyId always echoes validated.keyHash (falls back to '' if unset)", async () => {
    // The `keyId` field is what routes log/audit — it must never be
    // undefined (would print `keyId=undefined` into structured logs).
    state.validated = {
      valid: true,
      userId: "u-k",
      email: "k@l.com",
      keyHash: undefined,
      rateLimitPerMin: 60,
    };
    const { authenticateAPIKey } = await import("./api-auth");
    const out = await authenticateAPIKey(
      req({ authorization: "Bearer bk_live_ok" }),
    );
    expect(out?.keyId).toBe("");
  });
});
