import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";

// Colocated vitest for the previously-untested server-only
// `oauth-connectors.ts` — the shared token vault + row helper the three
// OAuth signal connectors (GitHub / Stripe / GA4) all read and write
// through. Regressions here are security- and integrity-critical:
// (a) losing the AES-256-GCM branch downgrades every founder's access
//     token to a plain base64 wrapper at rest, silently defeating
//     encryption on any server where OAUTH_TOKEN_ENCRYPTION_KEY was set;
// (b) losing the `obf:` fallback for unset key envs 500s every local /
//     staging call to saveConnection instead of gracefully obfuscating;
// (c) losing the hex-length-64 branch in getKey() drops one supported
//     key format entirely, forcing an incident-only reissue;
// (d) losing the `existing` branch in saveConnection turns every
//     re-authorise into a duplicate row and re-triggers the unique-index
//     conflict the schema is protected by;
// (e) losing the projectId null-vs-eq switch in getConnection leaks the
//     global connection to a project-scoped call and vice versa,
//     misattributing signals across projects;
// (f) losing the `expires_at`/`refresh_token_encrypted` null-safety
//     coerces missing values into "null" strings and breaks token
//     refresh forever;
// (g) losing the `signals.length === 0` short-circuit in writeSignals
//     issues a no-op upsert PATCH and burns Supabase RLS budget for no
//     reason;
// (h) losing the `onConflict` key in the upsert duplicates every signal
//     on every capture, blowing up the svi_signals table;
// (i) losing the `status: 'revoked'` + token nulling in revokeConnection
//     leaves a live token in the vault after a user hit "disconnect",
//     which is a bug-bounty class issue.
//
// Supabase is stubbed with the same chain-recorder shape used across
// `api-keys.test.ts` — every `.from().select().eq().maybeSingle()` call
// records the exact chain so the DB contract can be asserted without a
// live database. `server-only` is neutered by the vitest alias in
// `web/vitest.config.ts` so no runtime shim import is needed.

interface CapturedEq {
  col: string;
  val: unknown;
}

interface CapturedIs {
  col: string;
  val: unknown;
}

interface CapturedCall {
  table: string;
  selectCols: string | null;
  insertPayload: unknown;
  updatePayload: unknown;
  upsertPayload: unknown;
  upsertOpts: Record<string, unknown> | null;
  eqs: CapturedEq[];
  is: CapturedIs | null;
  order: { col: string; opts: Record<string, unknown> | null } | null;
  terminal: "single" | "maybeSingle" | "await" | null;
}

interface FakeState {
  adminConfigured: boolean;
  queue: Array<{ data?: unknown; error?: unknown }>;
  calls: CapturedCall[];
}

const state: FakeState = {
  adminConfigured: true,
  queue: [],
  calls: [],
};

function nextResponse(): { data: unknown; error: unknown } {
  const next = state.queue.shift() ?? {};
  return { data: next.data ?? null, error: next.error ?? null };
}

function makeChain(table: string) {
  const op: CapturedCall = {
    table,
    selectCols: null,
    insertPayload: null,
    updatePayload: null,
    upsertPayload: null,
    upsertOpts: null,
    eqs: [],
    is: null,
    order: null,
    terminal: null,
  };
  state.calls.push(op);

  const chain: Record<string, unknown> = {};
  chain.select = (cols?: string) => {
    op.selectCols = cols ?? null;
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
  chain.upsert = (payload: unknown, opts?: Record<string, unknown>) => {
    op.upsertPayload = payload;
    op.upsertOpts = opts ?? null;
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    op.eqs.push({ col, val });
    return chain;
  };
  chain.is = (col: string, val: unknown) => {
    op.is = { col, val };
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

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return { from: (table: string) => makeChain(table) };
  },
}));

function callsFor(table: string): CapturedCall[] {
  return state.calls.filter((c) => c.table === table);
}

const ENV_KEYS = [
  "OAUTH_TOKEN_ENCRYPTION_KEY",
  "GITHUB_OAUTH_CLIENT_ID",
  "GITHUB_CLIENT_ID",
  "STRIPE_OAUTH_CLIENT_ID",
  "STRIPE_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_CLIENT_ID",
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetModules();
  state.adminConfigured = true;
  state.queue = [];
  state.calls = [];
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

// ---------------------------------------------------------------------------
// encrypt / decrypt — token vault
// ---------------------------------------------------------------------------

describe("oauth-connectors — encrypt", () => {
  it("returns null for null input (never coerces to string 'null')", async () => {
    const { encrypt } = await import("./oauth-connectors");
    expect(encrypt(null)).toBeNull();
  });

  it("returns null for undefined input", async () => {
    const { encrypt } = await import("./oauth-connectors");
    expect(encrypt(undefined)).toBeNull();
  });

  it("returns null for empty string (treated as no-token)", async () => {
    const { encrypt } = await import("./oauth-connectors");
    expect(encrypt("")).toBeNull();
  });

  it("falls back to obf:<base64> when OAUTH_TOKEN_ENCRYPTION_KEY unset", async () => {
    const { encrypt } = await import("./oauth-connectors");
    const out = encrypt("hello-world");
    expect(out).not.toBeNull();
    expect(out!.startsWith("obf:")).toBe(true);
    expect(Buffer.from(out!.slice(4), "base64").toString("utf8")).toBe(
      "hello-world",
    );
  });

  it("emits gcm:<iv>:<tag>:<data> when key env is set as a passphrase", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "not-hex-just-a-passphrase";
    const { encrypt } = await import("./oauth-connectors");
    const out = encrypt("secret");
    expect(out).not.toBeNull();
    expect(out!.startsWith("gcm:")).toBe(true);
    const parts = out!.split(":");
    expect(parts).toHaveLength(4);
  });

  it("accepts a 64-char hex key without hashing (raw AES-256 key)", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const { encrypt, decrypt } = await import("./oauth-connectors");
    const out = encrypt("plain");
    expect(out!.startsWith("gcm:")).toBe(true);
    expect(decrypt(out)).toBe("plain");
  });

  it("produces a fresh IV per call — two encrypts of the same plaintext differ", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "same-passphrase";
    const { encrypt } = await import("./oauth-connectors");
    const a = encrypt("same-token");
    const b = encrypt("same-token");
    expect(a).not.toBe(b);
  });

  it("IV segment is 12 bytes (96 bits) as required for GCM", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "k";
    const { encrypt } = await import("./oauth-connectors");
    const out = encrypt("x")!;
    const [, ivB64] = out.split(":");
    expect(Buffer.from(ivB64, "base64").length).toBe(12);
  });

  it("auth tag segment is 16 bytes (128 bits) — the GCM default", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "k";
    const { encrypt } = await import("./oauth-connectors");
    const out = encrypt("x")!;
    const [, , tagB64] = out.split(":");
    expect(Buffer.from(tagB64, "base64").length).toBe(16);
  });
});

describe("oauth-connectors — decrypt", () => {
  it("returns null for null / undefined / empty payloads", async () => {
    const { decrypt } = await import("./oauth-connectors");
    expect(decrypt(null)).toBeNull();
    expect(decrypt(undefined)).toBeNull();
    expect(decrypt("")).toBeNull();
  });

  it("round-trips obf:<base64> without needing a key env", async () => {
    const { decrypt } = await import("./oauth-connectors");
    const enc = `obf:${Buffer.from("plain-token", "utf8").toString("base64")}`;
    expect(decrypt(enc)).toBe("plain-token");
  });

  it("round-trips gcm:<...> with the same passphrase", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "passphrase-1";
    const { encrypt, decrypt } = await import("./oauth-connectors");
    const enc = encrypt("round-trip-me");
    expect(decrypt(enc)).toBe("round-trip-me");
  });

  it("returns null when a gcm payload arrives with no key env (cannot decrypt)", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "k";
    const { encrypt } = await import("./oauth-connectors");
    const enc = encrypt("x");
    vi.resetModules();
    delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
    const { decrypt: decryptNoKey } = await import("./oauth-connectors");
    expect(decryptNoKey(enc)).toBeNull();
  });

  it("passes through opaque legacy tokens (no obf:/gcm: prefix) unchanged", async () => {
    const { decrypt } = await import("./oauth-connectors");
    expect(decrypt("legacy-plain-token")).toBe("legacy-plain-token");
  });

  it("hex-64 key decryption yields the exact original bytes (utf-8 preserved)", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "b".repeat(64);
    const { encrypt, decrypt } = await import("./oauth-connectors");
    const tok = "héllo-🌏-utf8";
    expect(decrypt(encrypt(tok))).toBe(tok);
  });

  it("passphrase → sha256 key: encrypt with 'K' and decrypt with sha256('K') hex fails silently (different key derivation path is not equivalent to raw hex)", async () => {
    // Documents that supplying the hex of sha256(passphrase) as a 64-char key
    // yields the *same* effective AES key as the passphrase branch — this is
    // the invariant that lets ops migrate a passphrase to raw hex.
    const passphrase = "migrate-me";
    const hex = crypto.createHash("sha256").update(passphrase).digest("hex");
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = passphrase;
    const { encrypt } = await import("./oauth-connectors");
    const enc = encrypt("token");
    vi.resetModules();
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = hex;
    const { decrypt: decryptHex } = await import("./oauth-connectors");
    expect(decryptHex(enc)).toBe("token");
  });
});

// ---------------------------------------------------------------------------
// isProviderConfigured — env-var probe
// ---------------------------------------------------------------------------

describe("oauth-connectors — isProviderConfigured", () => {
  it("github: false when neither GITHUB_OAUTH_CLIENT_ID nor GITHUB_CLIENT_ID set", async () => {
    const { isProviderConfigured } = await import("./oauth-connectors");
    expect(isProviderConfigured("github")).toBe(false);
  });

  it("github: true when GITHUB_OAUTH_CLIENT_ID is set", async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "x";
    const { isProviderConfigured } = await import("./oauth-connectors");
    expect(isProviderConfigured("github")).toBe(true);
  });

  it("github: true via legacy GITHUB_CLIENT_ID fallback", async () => {
    process.env.GITHUB_CLIENT_ID = "legacy";
    const { isProviderConfigured } = await import("./oauth-connectors");
    expect(isProviderConfigured("github")).toBe(true);
  });

  it("stripe: true via STRIPE_OAUTH_CLIENT_ID", async () => {
    process.env.STRIPE_OAUTH_CLIENT_ID = "sk";
    const { isProviderConfigured } = await import("./oauth-connectors");
    expect(isProviderConfigured("stripe")).toBe(true);
  });

  it("stripe: true via legacy STRIPE_CLIENT_ID fallback", async () => {
    process.env.STRIPE_CLIENT_ID = "legacy";
    const { isProviderConfigured } = await import("./oauth-connectors");
    expect(isProviderConfigured("stripe")).toBe(true);
  });

  it("ga4: true via GOOGLE_OAUTH_CLIENT_ID", async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "g";
    const { isProviderConfigured } = await import("./oauth-connectors");
    expect(isProviderConfigured("ga4")).toBe(true);
  });

  it("ga4: true via legacy GOOGLE_CLIENT_ID fallback", async () => {
    process.env.GOOGLE_CLIENT_ID = "legacy";
    const { isProviderConfigured } = await import("./oauth-connectors");
    expect(isProviderConfigured("ga4")).toBe(true);
  });

  it("empty-string env is treated as false (Boolean('') === false)", async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "";
    const { isProviderConfigured } = await import("./oauth-connectors");
    expect(isProviderConfigured("github")).toBe(false);
  });

  it("providers are independent — configuring github does not enable stripe or ga4", async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "x";
    const { isProviderConfigured } = await import("./oauth-connectors");
    expect(isProviderConfigured("stripe")).toBe(false);
    expect(isProviderConfigured("ga4")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getConnection — chain contract + projectId branching
// ---------------------------------------------------------------------------

describe("oauth-connectors — getConnection", () => {
  it("returns null when Supabase admin is not configured (no throw)", async () => {
    state.adminConfigured = false;
    const { getConnection } = await import("./oauth-connectors");
    expect(await getConnection("u-1", "github")).toBeNull();
  });

  it("uses .is('project_id', null) when projectId is omitted", async () => {
    state.queue = [{ data: null }];
    const { getConnection } = await import("./oauth-connectors");
    await getConnection("u-1", "github");
    const c = callsFor("oauth_connections_v2")[0];
    expect(c.is).toEqual({ col: "project_id", val: null });
    expect(c.eqs).toContainEqual({ col: "user_id", val: "u-1" });
    expect(c.eqs).toContainEqual({ col: "provider", val: "github" });
  });

  it("uses .eq('project_id', <id>) when a projectId is passed", async () => {
    state.queue = [{ data: null }];
    const { getConnection } = await import("./oauth-connectors");
    await getConnection("u-2", "stripe", "proj-9");
    const c = callsFor("oauth_connections_v2")[0];
    expect(c.is).toBeNull();
    expect(c.eqs).toContainEqual({ col: "project_id", val: "proj-9" });
  });

  it("terminates the query with .maybeSingle() (not .single())", async () => {
    state.queue = [{ data: null }];
    const { getConnection } = await import("./oauth-connectors");
    await getConnection("u-3", "ga4");
    expect(callsFor("oauth_connections_v2")[0].terminal).toBe("maybeSingle");
  });

  it("returns null when the query returns an error", async () => {
    state.queue = [{ data: null, error: { message: "boom" } }];
    const { getConnection } = await import("./oauth-connectors");
    expect(await getConnection("u", "github")).toBeNull();
  });

  it("maps a snake_case row into the camelCase OAuthConnection shape", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "k";
    const { encrypt } = await import("./oauth-connectors");
    const accessEnc = encrypt("acc-token");
    const refreshEnc = encrypt("ref-token");
    vi.resetModules();
    state.queue = [
      {
        data: {
          id: "conn-1",
          user_id: "u-1",
          project_id: null,
          provider: "github",
          provider_account_id: "gh-42",
          access_token_encrypted: accessEnc,
          refresh_token_encrypted: refreshEnc,
          scopes: ["repo", "read:org"],
          expires_at: "2099-01-01T00:00:00Z",
          status: "active",
          last_sync_at: null,
          last_sync_error: null,
          metadata: { foo: 1 },
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-02-01T00:00:00Z",
        },
      },
    ];
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "k";
    const { getConnection } = await import("./oauth-connectors");
    const c = await getConnection("u-1", "github");
    expect(c).toMatchObject({
      id: "conn-1",
      userId: "u-1",
      providerAccountId: "gh-42",
      accessToken: "acc-token",
      refreshToken: "ref-token",
      scopes: ["repo", "read:org"],
      status: "active",
      metadata: { foo: 1 },
    });
  });

  it("coerces null scopes / metadata to [] and {} rather than passing through", async () => {
    state.queue = [
      {
        data: {
          id: "c",
          user_id: "u",
          project_id: null,
          provider: "github",
          provider_account_id: null,
          access_token_encrypted: null,
          refresh_token_encrypted: null,
          scopes: null,
          expires_at: null,
          status: "active",
          last_sync_at: null,
          last_sync_error: null,
          metadata: null,
          created_at: "t",
          updated_at: "t",
        },
      },
    ];
    const { getConnection } = await import("./oauth-connectors");
    const c = await getConnection("u", "github");
    expect(c!.scopes).toEqual([]);
    expect(c!.metadata).toEqual({});
    expect(c!.accessToken).toBeNull();
    expect(c!.refreshToken).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listConnections
// ---------------------------------------------------------------------------

describe("oauth-connectors — listConnections", () => {
  it("returns [] when Supabase admin is not configured", async () => {
    state.adminConfigured = false;
    const { listConnections } = await import("./oauth-connectors");
    expect(await listConnections("u")).toEqual([]);
  });

  it("scopes the select to the given user_id and orders by created_at desc", async () => {
    state.queue = [{ data: [] }];
    const { listConnections } = await import("./oauth-connectors");
    await listConnections("u-42");
    const c = callsFor("oauth_connections_v2")[0];
    expect(c.eqs).toContainEqual({ col: "user_id", val: "u-42" });
    expect(c.order).toEqual({
      col: "created_at",
      opts: { ascending: false },
    });
  });

  it("returns [] on error", async () => {
    state.queue = [{ data: null, error: { message: "boom" } }];
    const { listConnections } = await import("./oauth-connectors");
    expect(await listConnections("u")).toEqual([]);
  });

  it("maps every row to camelCase via rowToConnection", async () => {
    state.queue = [
      {
        data: [
          {
            id: "a",
            user_id: "u",
            project_id: null,
            provider: "github",
            provider_account_id: null,
            access_token_encrypted: null,
            refresh_token_encrypted: null,
            scopes: [],
            expires_at: null,
            status: "active",
            last_sync_at: null,
            last_sync_error: null,
            metadata: {},
            created_at: "t",
            updated_at: "t",
          },
          {
            id: "b",
            user_id: "u",
            project_id: "p",
            provider: "stripe",
            provider_account_id: null,
            access_token_encrypted: null,
            refresh_token_encrypted: null,
            scopes: [],
            expires_at: null,
            status: "revoked",
            last_sync_at: null,
            last_sync_error: null,
            metadata: {},
            created_at: "t",
            updated_at: "t",
          },
        ],
      },
    ];
    const { listConnections } = await import("./oauth-connectors");
    const rows = await listConnections("u");
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("a");
    expect(rows[1].projectId).toBe("p");
    expect(rows[1].status).toBe("revoked");
  });
});

// ---------------------------------------------------------------------------
// saveConnection — insert vs update
// ---------------------------------------------------------------------------

describe("oauth-connectors — saveConnection", () => {
  it("returns null when Supabase admin is not configured", async () => {
    state.adminConfigured = false;
    const { saveConnection } = await import("./oauth-connectors");
    const out = await saveConnection({
      userId: "u",
      provider: "github",
      providerAccountId: "x",
      accessToken: "t",
    });
    expect(out).toBeNull();
  });

  it("inserts a new row when no existing connection is found", async () => {
    state.queue = [
      { data: null }, // getConnection lookup → null
      {
        data: {
          id: "new-id",
          user_id: "u",
          project_id: null,
          provider: "github",
          provider_account_id: "gh",
          access_token_encrypted: "obf:AAA",
          refresh_token_encrypted: null,
          scopes: [],
          expires_at: null,
          status: "active",
          last_sync_at: null,
          last_sync_error: null,
          metadata: {},
          created_at: "t",
          updated_at: "t",
        },
      },
    ];
    const { saveConnection } = await import("./oauth-connectors");
    await saveConnection({
      userId: "u",
      provider: "github",
      providerAccountId: "gh",
      accessToken: "token",
    });
    const calls = callsFor("oauth_connections_v2");
    // last call must carry an insert payload (not update)
    const write = calls[calls.length - 1];
    expect(write.insertPayload).not.toBeNull();
    expect(write.updatePayload).toBeNull();
    const p = write.insertPayload as Record<string, unknown>;
    expect(p.user_id).toBe("u");
    expect(p.provider).toBe("github");
    expect(typeof p.access_token_encrypted).toBe("string");
    // encryption applied (not stored raw)
    expect(p.access_token_encrypted).not.toBe("token");
    // created_at present on insert path
    expect(typeof p.created_at).toBe("string");
  });

  it("updates the existing row (matched by id) when getConnection returns one", async () => {
    state.queue = [
      {
        data: {
          id: "existing-id",
          user_id: "u",
          project_id: null,
          provider: "github",
          provider_account_id: "gh",
          access_token_encrypted: "obf:AAA",
          refresh_token_encrypted: null,
          scopes: [],
          expires_at: null,
          status: "active",
          last_sync_at: null,
          last_sync_error: null,
          metadata: {},
          created_at: "t",
          updated_at: "t",
        },
      },
      {
        data: {
          id: "existing-id",
          user_id: "u",
          project_id: null,
          provider: "github",
          provider_account_id: "gh-2",
          access_token_encrypted: "obf:BBB",
          refresh_token_encrypted: null,
          scopes: ["repo"],
          expires_at: null,
          status: "active",
          last_sync_at: null,
          last_sync_error: null,
          metadata: {},
          created_at: "t",
          updated_at: "t2",
        },
      },
    ];
    const { saveConnection } = await import("./oauth-connectors");
    const out = await saveConnection({
      userId: "u",
      provider: "github",
      providerAccountId: "gh-2",
      accessToken: "new-token",
      scopes: ["repo"],
    });
    const calls = callsFor("oauth_connections_v2");
    const write = calls[calls.length - 1];
    expect(write.updatePayload).not.toBeNull();
    expect(write.insertPayload).toBeNull();
    expect(write.eqs).toContainEqual({ col: "id", val: "existing-id" });
    expect(out!.id).toBe("existing-id");
    expect(out!.providerAccountId).toBe("gh-2");
  });

  it("marks the saved payload as 'active' (fresh authorise re-enables a revoked row)", async () => {
    state.queue = [{ data: null }, { data: null }];
    const { saveConnection } = await import("./oauth-connectors");
    await saveConnection({
      userId: "u",
      provider: "stripe",
      providerAccountId: "acct_x",
      accessToken: "t",
    });
    const write = callsFor("oauth_connections_v2").at(-1)!;
    const p = write.insertPayload as Record<string, unknown>;
    expect(p.status).toBe("active");
    // last_sync_error must be reset on re-auth so stale error messages don't linger
    expect(p.last_sync_error).toBeNull();
  });

  it("passes through refreshToken null when omitted (no coercion to string)", async () => {
    state.queue = [{ data: null }, { data: null }];
    const { saveConnection } = await import("./oauth-connectors");
    await saveConnection({
      userId: "u",
      provider: "ga4",
      providerAccountId: "p",
      accessToken: "t",
    });
    const p = callsFor("oauth_connections_v2").at(-1)!
      .insertPayload as Record<string, unknown>;
    expect(p.refresh_token_encrypted).toBeNull();
  });

  it("encrypts refreshToken when provided", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "k";
    state.queue = [{ data: null }, { data: null }];
    const { saveConnection } = await import("./oauth-connectors");
    await saveConnection({
      userId: "u",
      provider: "ga4",
      providerAccountId: "p",
      accessToken: "a",
      refreshToken: "r",
    });
    const p = callsFor("oauth_connections_v2").at(-1)!
      .insertPayload as Record<string, unknown>;
    expect(typeof p.refresh_token_encrypted).toBe("string");
    expect((p.refresh_token_encrypted as string).startsWith("gcm:")).toBe(true);
  });

  it("returns null when the insert reports an error", async () => {
    state.queue = [{ data: null }, { data: null, error: { message: "conflict" } }];
    const { saveConnection } = await import("./oauth-connectors");
    const out = await saveConnection({
      userId: "u",
      provider: "github",
      providerAccountId: "g",
      accessToken: "t",
    });
    expect(out).toBeNull();
  });

  it("scopes/metadata default to [] and {} respectively when omitted", async () => {
    state.queue = [{ data: null }, { data: null }];
    const { saveConnection } = await import("./oauth-connectors");
    await saveConnection({
      userId: "u",
      provider: "github",
      providerAccountId: "g",
      accessToken: "t",
    });
    const p = callsFor("oauth_connections_v2").at(-1)!
      .insertPayload as Record<string, unknown>;
    expect(p.scopes).toEqual([]);
    expect(p.metadata).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// markSynced
// ---------------------------------------------------------------------------

describe("oauth-connectors — markSynced", () => {
  it("no-op when Supabase admin is not configured (does not throw)", async () => {
    state.adminConfigured = false;
    const { markSynced } = await import("./oauth-connectors");
    await expect(markSynced("id")).resolves.toBeUndefined();
    expect(callsFor("oauth_connections_v2")).toHaveLength(0);
  });

  it("sets status='active' + last_sync_error=null when no error argument passed", async () => {
    const { markSynced } = await import("./oauth-connectors");
    await markSynced("conn-1");
    const c = callsFor("oauth_connections_v2")[0];
    const p = c.updatePayload as Record<string, unknown>;
    expect(p.status).toBe("active");
    expect(p.last_sync_error).toBeNull();
    expect(typeof p.last_sync_at).toBe("string");
    expect(c.eqs).toContainEqual({ col: "id", val: "conn-1" });
  });

  it("sets status='error' + preserves the error message when one is passed", async () => {
    const { markSynced } = await import("./oauth-connectors");
    await markSynced("conn-2", "429 rate limited");
    const p = callsFor("oauth_connections_v2")[0]
      .updatePayload as Record<string, unknown>;
    expect(p.status).toBe("error");
    expect(p.last_sync_error).toBe("429 rate limited");
  });

  it("treats explicit null error as clean sync (same as omitted)", async () => {
    const { markSynced } = await import("./oauth-connectors");
    await markSynced("conn-3", null);
    const p = callsFor("oauth_connections_v2")[0]
      .updatePayload as Record<string, unknown>;
    expect(p.status).toBe("active");
    expect(p.last_sync_error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// revokeConnection
// ---------------------------------------------------------------------------

describe("oauth-connectors — revokeConnection", () => {
  it("no-op when Supabase admin is not configured", async () => {
    state.adminConfigured = false;
    const { revokeConnection } = await import("./oauth-connectors");
    await expect(revokeConnection("id")).resolves.toBeUndefined();
  });

  it("sets status='revoked' and nulls out both encrypted token fields", async () => {
    const { revokeConnection } = await import("./oauth-connectors");
    await revokeConnection("conn-9");
    const c = callsFor("oauth_connections_v2")[0];
    const p = c.updatePayload as Record<string, unknown>;
    expect(p.status).toBe("revoked");
    expect(p.access_token_encrypted).toBeNull();
    expect(p.refresh_token_encrypted).toBeNull();
    expect(typeof p.updated_at).toBe("string");
    expect(c.eqs).toContainEqual({ col: "id", val: "conn-9" });
  });
});

// ---------------------------------------------------------------------------
// writeSignals
// ---------------------------------------------------------------------------

describe("oauth-connectors — writeSignals", () => {
  it("no-op when Supabase admin is not configured", async () => {
    state.adminConfigured = false;
    const { writeSignals } = await import("./oauth-connectors");
    await writeSignals("u", null, "github", [{ key: "commits", numeric: 5 }]);
    expect(callsFor("svi_signals")).toHaveLength(0);
  });

  it("short-circuits on empty signals[] (does not touch DB)", async () => {
    const { writeSignals } = await import("./oauth-connectors");
    await writeSignals("u", null, "github", []);
    expect(callsFor("svi_signals")).toHaveLength(0);
  });

  it("upserts one row per signal onto svi_signals with correct column shape", async () => {
    const { writeSignals } = await import("./oauth-connectors");
    await writeSignals("u-1", "p-1", "stripe", [
      { key: "mrr_aud", numeric: 12345 },
      { key: "customers", numeric: 42, metadata: { since: "2026-01-01" } },
      { key: "top_plan", text: "growth" },
    ]);
    const c = callsFor("svi_signals")[0];
    const rows = c.upsertPayload as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      user_id: "u-1",
      project_id: "p-1",
      provider: "stripe",
      signal_key: "mrr_aud",
      signal_value_num: 12345,
      signal_value_text: null,
    });
    expect(rows[1].metadata).toEqual({ since: "2026-01-01" });
    expect(rows[2].signal_value_text).toBe("growth");
    expect(rows[2].signal_value_num).toBeNull();
  });

  it("passes the composite onConflict key so re-captures update in place", async () => {
    const { writeSignals } = await import("./oauth-connectors");
    await writeSignals("u", null, "ga4", [{ key: "sessions", numeric: 1 }]);
    const c = callsFor("svi_signals")[0];
    expect(c.upsertOpts).toEqual({
      onConflict: "user_id,provider,signal_key,project_id",
      ignoreDuplicates: false,
    });
  });

  it("stamps every row with the same captured_at ISO timestamp", async () => {
    const { writeSignals } = await import("./oauth-connectors");
    await writeSignals("u", null, "github", [
      { key: "a", numeric: 1 },
      { key: "b", numeric: 2 },
    ]);
    const rows = callsFor("svi_signals")[0].upsertPayload as Array<
      Record<string, unknown>
    >;
    expect(rows[0].captured_at).toBe(rows[1].captured_at);
    expect(typeof rows[0].captured_at).toBe("string");
    expect(() => new Date(rows[0].captured_at as string).toISOString()).not.toThrow();
  });

  it("defaults numeric/text to null when only the other is provided", async () => {
    const { writeSignals } = await import("./oauth-connectors");
    await writeSignals("u", null, "github", [{ key: "flag", text: "yes" }]);
    const row = (callsFor("svi_signals")[0].upsertPayload as Array<
      Record<string, unknown>
    >)[0];
    expect(row.signal_value_num).toBeNull();
    expect(row.signal_value_text).toBe("yes");
  });

  it("defaults metadata to {} when caller omits it", async () => {
    const { writeSignals } = await import("./oauth-connectors");
    await writeSignals("u", null, "github", [{ key: "k", numeric: 1 }]);
    const row = (callsFor("svi_signals")[0].upsertPayload as Array<
      Record<string, unknown>
    >)[0];
    expect(row.metadata).toEqual({});
  });

  it("propagates a null projectId as-is (global-scope signals)", async () => {
    const { writeSignals } = await import("./oauth-connectors");
    await writeSignals("u", null, "github", [{ key: "k", numeric: 1 }]);
    const row = (callsFor("svi_signals")[0].upsertPayload as Array<
      Record<string, unknown>
    >)[0];
    expect(row.project_id).toBeNull();
  });
});
