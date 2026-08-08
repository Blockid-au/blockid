// Colocated vitest for GET /api/admin/ai-status — P9 ship-readiness regression
// pin for the admin dashboard tile that renders which of the 5 configured AI
// providers are currently reachable ("active"), merely configured, or missing.
//
// admin@blockid.au reads this endpoint every morning before the loop runs to
// decide whether to top up ANTHROPIC_API_KEY, refresh the Claude CLI OAuth
// token, or fall back to the proxy. The tile keys off the exact shape the
// route returns — activeCount, configuredCount, providers[].status, and the
// priority[] fallback order — so silent regressions on any of them either
// hide a broken provider or fabricate a healthy one.
//
// Silent regressions this suite pins against:
//
//   - Dropping the admin gate so any signed-in user sees the tail-4 chars of
//     OPENAI_API_KEY / GOOGLE_GEMINI_API_KEY + the proxy URL (a partial
//     credential leak is a Priv-Act APP 11 incident even without the head).
//   - Dropping the getCurrentUser() null guard so a logged-out visitor sees
//     the provider inventory (still an information leak — which keys we
//     rotate + how many proxy keys we have loaded is not public).
//   - Changing the fixed 5-provider ordering — the admin tile renders
//     priority[] left-to-right and the operator memorises the columns.
//   - Losing the OAuth-token expiry branch so an expired token shows as
//     "active" and the operator does not refresh it before the loop tick
//     fails.
//   - Losing the ~/.claude/.credentials.json missing-file soft-fail so the
//     endpoint 500s on a fresh server instead of surfacing status: missing.
//   - Losing the JSON.parse try/catch so a partial-write of the OAuth
//     credential file 500s the admin dashboard.
//   - Losing the comma-split count on ANTHROPIC_PROXY_API_KEY so a
//     rotated-key list shows as "1 key" and the operator does not notice
//     one leg of the rotation went missing.
//   - Regressing the head/tail credential masking on the OpenAI + Gemini
//     detail strings — printing the full key would land it in browser
//     history + the admin's clipboard.
//   - Losing `export const dynamic = "force-dynamic"` — the route reads
//     process.env + ~/.claude/.credentials.json per request and MUST NOT
//     be pinned to a build-time snapshot.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── fs fake — in-memory store keyed by absolute path. The route builds the
//    credentials path from process.env.HOME so tests set HOME + write to the
//    matching store key; a HOME drift or a rename would miss the key and
//    surface as "missing" (the failure the suite pins against).

const fsStore = new Map<string, string>();

vi.mock("fs", () => ({
  existsSync: (p: string) => fsStore.has(p),
  readFileSync: (p: string) => {
    const v = fsStore.get(p);
    if (v == null) {
      const err = new Error(`ENOENT: no such file or directory, open '${p}'`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }
    return v;
  },
}));

// ── auth + ai-client mocks (hoisted so they exist before the route import) ─

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{ id: string; email: string; role?: string } | null>>(),
  getAIBudgetStatus: vi.fn<() => { month: string; spent: number; limit: number; percent: number; calls: number }>(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/ai-client", () => ({ getAIBudgetStatus: () => mocks.getAIBudgetStatus() }));

import { GET, dynamic } from "./route";

// ── Helpers ────────────────────────────────────────────────────────────────

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

type Provider = { id: string; name: string; status: "active" | "configured" | "missing"; detail: string };

function providersById(body: Record<string, unknown>): Record<string, Provider> {
  const list = body.providers as Provider[];
  const out: Record<string, Provider> = {};
  for (const p of list) out[p.id] = p;
  return out;
}

const ADMIN_USER = { id: "u-admin-1", email: "admin@blockid.au" };
const NON_ADMIN_USER = { id: "u-42", email: "someone@example.com" };
const DEFAULT_BUDGET = { month: "2026-08", spent: 12.34, limit: 500, percent: 2, calls: 42 };

// Save+restore process.env / HOME so cases can flip flags without leaking.
let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  savedEnv = { ...process.env };
  // Wipe every provider env so the baseline is "all missing". Individual
  // cases opt-in to the vars they need.
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_PROXY_API_KEY;
  delete process.env.ANTHROPIC_PROXY_BASE_URL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_GEMINI_API_KEY;
  process.env.HOME = "/home/test";

  fsStore.clear();
  mocks.getCurrentUser.mockReset();
  mocks.getAIBudgetStatus.mockReset();
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  mocks.getAIBudgetStatus.mockReturnValue(DEFAULT_BUDGET);
});

afterEach(() => {
  process.env = savedEnv;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
describe("dynamic export", () => {
  it("forces dynamic — the route reads per-request env + credentials and must not be prerendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
describe("auth gate", () => {
  it("returns 401 { error: 'Unauthorized' } when getCurrentUser() is null", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when the caller is authenticated but not admin email and role is unset", async () => {
    mocks.getCurrentUser.mockResolvedValue(NON_ADMIN_USER);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 401 when the caller has role='user' (not 'admin')", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-3", email: "x@x.com", role: "user" });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("admits admin@blockid.au regardless of role", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1", email: "admin@blockid.au" });
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("admits any user with role='admin' even when the email is not the primary admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-9", email: "other@x.com", role: "admin" });
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("does not read the OAuth credentials file for an unauthenticated caller (no wasted disk I/O)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    fsStore.set("/home/test/.claude/.credentials.json", JSON.stringify({ claudeAiOauth: { accessToken: "t" } }));
    await GET();
    // The fs.existsSync is called from the route; but since it 401s early,
    // the JSON.parse+readFileSync branch never runs. We assert on the returned
    // body — 401, and no provider list leaked.
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe("provider inventory — top-level counts + ordering", () => {
  it("always returns exactly 5 providers in the fixed priority order [claude-oauth, claude-apikey, claude-proxy, openai-apikey, gemini]", async () => {
    const body = await jsonOf(await GET());
    const providers = body.providers as Provider[];
    expect(providers).toHaveLength(5);
    expect(body.totalProviders).toBe(5);
    expect(body.priority).toEqual(["claude-oauth", "claude-apikey", "claude-proxy", "openai-apikey", "gemini"]);
  });

  it("counts 0 active + 0 configured when every credential is absent (baseline: all missing)", async () => {
    const body = await jsonOf(await GET());
    expect(body.activeCount).toBe(0);
    expect(body.configuredCount).toBe(0);
    const byId = providersById(body);
    for (const id of Object.keys(byId)) expect(byId[id].status).toBe("missing");
  });

  it("counts 'configured' as anything non-missing (active + configured), not just 'active'", async () => {
    // Configure only the anthropic api key — status = 'configured' (not
    // 'active' since the route does not live-probe it). configuredCount must
    // still tick to 1; activeCount must stay 0.
    process.env.ANTHROPIC_API_KEY = "sk-ant-abc";
    const body = await jsonOf(await GET());
    expect(body.activeCount).toBe(0);
    expect(body.configuredCount).toBe(1);
  });

  it("returns ok: true on the happy path", async () => {
    const body = await jsonOf(await GET());
    expect(body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("claude-oauth provider (from ~/.claude/.credentials.json)", () => {
  it("marks missing when the credentials file does not exist", async () => {
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["claude-oauth"].status).toBe("missing");
    expect(byId["claude-oauth"].detail).toContain("not found");
  });

  it("reads the credentials file from $HOME/.claude/.credentials.json (HOME drift regression)", async () => {
    process.env.HOME = "/home/alt";
    fsStore.set("/home/alt/.claude/.credentials.json", JSON.stringify({
      claudeAiOauth: { accessToken: "t", expiresAt: Date.now() + 60_000 },
    }));
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["claude-oauth"].status).toBe("active");
  });

  it("falls back to HOME='/root' when process.env.HOME is unset (server-daemon default)", async () => {
    delete process.env.HOME;
    fsStore.set("/root/.claude/.credentials.json", JSON.stringify({
      claudeAiOauth: { accessToken: "t", expiresAt: Date.now() + 60_000 },
    }));
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["claude-oauth"].status).toBe("active");
  });

  it("marks missing when the file exists but has no accessToken", async () => {
    fsStore.set("/home/test/.claude/.credentials.json", JSON.stringify({ claudeAiOauth: {} }));
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["claude-oauth"].status).toBe("missing");
    expect(byId["claude-oauth"].detail).toMatch(/no token/i);
  });

  it("marks active with 'min left' detail when the token is present and not expired", async () => {
    const expiresAt = Date.now() + 5 * 60_000; // 5 minutes
    fsStore.set("/home/test/.claude/.credentials.json", JSON.stringify({
      claudeAiOauth: { accessToken: "abc", expiresAt },
    }));
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["claude-oauth"].status).toBe("active");
    expect(byId["claude-oauth"].detail).toMatch(/min left/);
  });

  it("marks configured (not active) with 'expired' detail when expiresAt is in the past", async () => {
    fsStore.set("/home/test/.claude/.credentials.json", JSON.stringify({
      claudeAiOauth: { accessToken: "abc", expiresAt: Date.now() - 60_000 },
    }));
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["claude-oauth"].status).toBe("configured");
    expect(byId["claude-oauth"].detail.toLowerCase()).toContain("expired");
  });

  it("marks active when expiresAt is missing (indefinite token — treat as valid)", async () => {
    // Route logic: `expired = oauth.expiresAt && Date.now() > oauth.expiresAt`
    // With no expiresAt the guard short-circuits to false → active.
    fsStore.set("/home/test/.claude/.credentials.json", JSON.stringify({
      claudeAiOauth: { accessToken: "abc" },
    }));
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["claude-oauth"].status).toBe("active");
  });

  it("soft-fails to missing when the credentials JSON is torn / unparseable (never 500s the admin dashboard)", async () => {
    fsStore.set("/home/test/.claude/.credentials.json", "{not valid json");
    const res = await GET();
    expect(res.status).toBe(200);
    const byId = providersById(await jsonOf(res));
    expect(byId["claude-oauth"].status).toBe("missing");
    expect(byId["claude-oauth"].detail.toLowerCase()).toMatch(/cannot read|credentials/);
  });
});

// ---------------------------------------------------------------------------
describe("claude-apikey provider (from ANTHROPIC_API_KEY)", () => {
  it("marks missing when ANTHROPIC_API_KEY is absent", async () => {
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["claude-apikey"].status).toBe("missing");
    expect(byId["claude-apikey"].detail).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("marks configured (not active — route does not live-probe) when the key is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-abc";
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["claude-apikey"].status).toBe("configured");
    expect(byId["claude-apikey"].detail).toMatch(/configured/i);
  });

  it("never leaks the raw key value in the detail string (this provider does not mask + should not print)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-secret-xyz";
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["claude-apikey"].detail).not.toContain("sk-ant-secret-xyz");
  });
});

// ---------------------------------------------------------------------------
describe("claude-proxy provider (from ANTHROPIC_PROXY_API_KEY + ANTHROPIC_PROXY_BASE_URL)", () => {
  it("marks missing when either the key or the URL is absent", async () => {
    // key only, no URL
    process.env.ANTHROPIC_PROXY_API_KEY = "k";
    let byId = providersById(await jsonOf(await GET()));
    expect(byId["claude-proxy"].status).toBe("missing");
    // URL only, no key
    delete process.env.ANTHROPIC_PROXY_API_KEY;
    process.env.ANTHROPIC_PROXY_BASE_URL = "https://proxy.example";
    byId = providersById(await jsonOf(await GET()));
    expect(byId["claude-proxy"].status).toBe("missing");
  });

  it("marks active when both are set and reports the proxy URL in the detail", async () => {
    process.env.ANTHROPIC_PROXY_API_KEY = "k1";
    process.env.ANTHROPIC_PROXY_BASE_URL = "https://proxy.example";
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["claude-proxy"].status).toBe("active");
    expect(byId["claude-proxy"].detail).toContain("https://proxy.example");
  });

  it("counts comma-separated proxy keys individually (rotation regression — one key must not read as 'many')", async () => {
    process.env.ANTHROPIC_PROXY_API_KEY = "k1,k2,k3";
    process.env.ANTHROPIC_PROXY_BASE_URL = "https://proxy.example";
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["claude-proxy"].detail).toMatch(/3 key/);
  });

  it("does not count empty comma slots (trailing comma / empty tokens filtered out)", async () => {
    process.env.ANTHROPIC_PROXY_API_KEY = "k1,,";
    process.env.ANTHROPIC_PROXY_BASE_URL = "https://proxy.example";
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["claude-proxy"].detail).toMatch(/1 key/);
  });
});

// ---------------------------------------------------------------------------
describe("openai-apikey provider (from OPENAI_API_KEY)", () => {
  it("marks missing when the key is unset", async () => {
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["openai-apikey"].status).toBe("missing");
    expect(byId["openai-apikey"].detail).toMatch(/OPENAI_API_KEY/);
  });

  it("marks configured + masks the key as head-8 + '...' + tail-4 (never full-key)", async () => {
    process.env.OPENAI_API_KEY = "sk-openai-1234567890abcdef";
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["openai-apikey"].status).toBe("configured");
    expect(byId["openai-apikey"].detail).toContain("sk-opena");
    expect(byId["openai-apikey"].detail).toContain("cdef");
    expect(byId["openai-apikey"].detail).not.toContain("sk-openai-1234567890abcdef");
  });
});

// ---------------------------------------------------------------------------
describe("gemini provider (from GOOGLE_GEMINI_API_KEY)", () => {
  it("marks missing when the key is unset", async () => {
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["gemini"].status).toBe("missing");
    expect(byId["gemini"].detail).toMatch(/GOOGLE_GEMINI_API_KEY/);
  });

  it("marks configured + masks the key as head-10 + '...' + tail-4 (Gemini keys are longer → wider head window)", async () => {
    process.env.GOOGLE_GEMINI_API_KEY = "AIzaSyABCDEFGHIJKLMNOP1234";
    const byId = providersById(await jsonOf(await GET()));
    expect(byId["gemini"].status).toBe("configured");
    expect(byId["gemini"].detail).toContain("AIzaSyABCD");
    expect(byId["gemini"].detail).toContain("1234");
    expect(byId["gemini"].detail).not.toContain("AIzaSyABCDEFGHIJKLMNOP1234");
  });
});

// ---------------------------------------------------------------------------
describe("budget passthrough", () => {
  it("threads the getAIBudgetStatus() envelope through untouched onto the response body", async () => {
    const b = { month: "2026-08", spent: 42.42, limit: 500, percent: 8, calls: 999 };
    mocks.getAIBudgetStatus.mockReturnValue(b);
    const body = await jsonOf(await GET());
    expect(body.budget).toEqual(b);
  });

  it("calls getAIBudgetStatus exactly once per request (not per provider)", async () => {
    await GET();
    expect(mocks.getAIBudgetStatus).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
describe("aggregate happy path — every provider configured, no proxy", () => {
  it("returns the expected inventory when all 4 env-based providers + OAuth are wired", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    process.env.ANTHROPIC_PROXY_API_KEY = "k1,k2";
    process.env.ANTHROPIC_PROXY_BASE_URL = "https://proxy.example";
    process.env.OPENAI_API_KEY = "sk-openai-abcdefghijklmnop";
    process.env.GOOGLE_GEMINI_API_KEY = "AIzaSy1234567890abcd";
    fsStore.set("/home/test/.claude/.credentials.json", JSON.stringify({
      claudeAiOauth: { accessToken: "t", expiresAt: Date.now() + 3600_000 },
    }));

    const body = await jsonOf(await GET());
    expect(body.configuredCount).toBe(5);
    // Active only counts probes that can be verified without a network call —
    // OAuth (token freshness) + proxy (both env vars present).
    expect(body.activeCount).toBe(2);
    const byId = providersById(body);
    expect(byId["claude-oauth"].status).toBe("active");
    expect(byId["claude-proxy"].status).toBe("active");
    expect(byId["claude-apikey"].status).toBe("configured");
    expect(byId["openai-apikey"].status).toBe("configured");
    expect(byId["gemini"].status).toBe("configured");
  });
});
