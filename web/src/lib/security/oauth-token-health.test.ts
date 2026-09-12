import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// S23-A — the `oauth_tokens_sealed` signal:
//   no_key           key unset (whatever the rows say)
//   obf_rows_present key set + ≥1 non-gcm token in EITHER table
//   ok               key set + zero non-gcm tokens
//   unknown          key set + DB missing / count query failed
// Cached 10 min per process; four `head: true` COUNT queries that filter
// on the prefix only — never a token byte is selected.

interface Filter {
  col: string;
  op: string;
  val: unknown;
}

const state: {
  admin: boolean;
  counts: Record<string, number>; // "<table>.<column>" → count
  failOn: string | null;
  queries: Array<{ table: string; filters: Filter[]; opts: unknown }>;
} = { admin: true, counts: {}, failOn: null, queries: [] };

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.admin) return null;
    return {
      from: (table: string) => ({
        select: (_cols: string, opts: unknown) => {
          const q = { table, filters: [] as Filter[], opts };
          state.queries.push(q);
          const chain = {
            not(col: string, op: string, val: unknown) {
              q.filters.push({ col, op, val });
              return chain;
            },
            then(resolve: (v: { count: number | null; error: { message: string } | null }) => void) {
              const col = q.filters[0]?.col ?? "";
              const key = `${table}.${col}`;
              if (state.failOn === key) return resolve({ count: null, error: { message: "boom" } });
              return resolve({ count: state.counts[key] ?? 0, error: null });
            },
          };
          return chain;
        },
      }),
    };
  },
}));

const HEX = "a".repeat(64);
const saved: Record<string, string | undefined> = {};
const KEYS = ["OAUTH_TOKEN_ENCRYPTION_KEY", "OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS"];

beforeEach(async () => {
  vi.resetModules();
  state.admin = true;
  state.counts = {};
  state.failOn = null;
  state.queries = [];
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  const m = await import("./oauth-token-health");
  m._resetOAuthTokenHealthCache();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe("readOAuthTokenHealth", () => {
  it("no_key when OAUTH_TOKEN_ENCRYPTION_KEY is unset, even with zero unsealed rows", async () => {
    const { readOAuthTokenHealth } = await import("./oauth-token-health");
    const h = await readOAuthTokenHealth({ force: true });
    expect(h.status).toBe("no_key");
    expect(h.unsealed).toEqual({ oauth_connections_v2: 0, oauth_connections: 0 });
  });

  it("ok when the key is set and every count is zero", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = HEX;
    const { readOAuthTokenHealth } = await import("./oauth-token-health");
    expect((await readOAuthTokenHealth({ force: true })).status).toBe("ok");
  });

  it("obf_rows_present when the key is set and any column in any table has a non-gcm row", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = HEX;
    const { readOAuthTokenHealth } = await import("./oauth-token-health");
    state.counts = { "oauth_connections.access_token": 4 };
    const h = await readOAuthTokenHealth({ force: true });
    expect(h.status).toBe("obf_rows_present");
    expect(h.unsealed).toEqual({ oauth_connections_v2: 0, oauth_connections: 4 });
    state.counts = { "oauth_connections_v2.refresh_token_encrypted": 1 };
    expect((await readOAuthTokenHealth({ force: true })).status).toBe("obf_rows_present");
  });

  it("counts filter on prefix only — non-null AND NOT LIKE 'gcm:%' — across both tables and all four columns", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = HEX;
    const { readOAuthTokenHealth, TOKEN_COLUMNS } = await import("./oauth-token-health");
    await readOAuthTokenHealth({ force: true });
    const seen = state.queries.map((q) => `${q.table}.${q.filters[0].col}`).sort();
    const expected = TOKEN_COLUMNS.flatMap((t) => t.columns.map((c) => `${t.table}.${c}`)).sort();
    expect(seen).toEqual(expected);
    for (const q of state.queries) {
      expect(q.opts).toEqual({ count: "exact", head: true });
      expect(q.filters).toEqual([
        { col: q.filters[0].col, op: "is", val: null },
        { col: q.filters[0].col, op: "like", val: "gcm:%" },
      ]);
    }
  });

  it("unknown (key set) / no_key (key unset) when Supabase is not configured", async () => {
    state.admin = false;
    let m = await import("./oauth-token-health");
    expect((await m.readOAuthTokenHealth({ force: true })).status).toBe("no_key");
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = HEX;
    vi.resetModules();
    m = await import("./oauth-token-health");
    const h = await m.readOAuthTokenHealth({ force: true });
    expect(h.status).toBe("unknown");
    expect(h.unsealed).toBeNull();
  });

  it("unknown when a count query fails (logged, no throw)", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = HEX;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { readOAuthTokenHealth } = await import("./oauth-token-health");
    state.failOn = "oauth_connections.refresh_token";
    expect((await readOAuthTokenHealth({ force: true })).status).toBe("unknown");
    expect(err).toHaveBeenCalled();
  });

  it("caches for 10 minutes; force bypasses; TTL expiry re-queries", async () => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = HEX;
    const { readOAuthTokenHealth, OAUTH_TOKEN_HEALTH_TTL_MS } = await import("./oauth-token-health");
    const t0 = 1_000_000;
    expect((await readOAuthTokenHealth({ now: t0 })).status).toBe("ok");
    const n = state.queries.length;
    state.counts = { "oauth_connections.access_token": 1 };
    expect((await readOAuthTokenHealth({ now: t0 + OAUTH_TOKEN_HEALTH_TTL_MS - 1 })).status).toBe("ok");
    expect(state.queries.length).toBe(n);
    expect((await readOAuthTokenHealth({ now: t0 + OAUTH_TOKEN_HEALTH_TTL_MS - 1, force: true })).status).toBe("obf_rows_present");
    state.counts = {};
    expect((await readOAuthTokenHealth({ now: t0 + 2 * OAUTH_TOKEN_HEALTH_TTL_MS })).status).toBe("ok");
  });
});
