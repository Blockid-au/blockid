// Colocated vitest for the server-only unified AI client
// (`web/src/lib/ai-client.ts`) — the module every AI route
// (svi-analysis, rnd-analysis, cfo-valuation, cmo-market-research, the
// whole C-Level agent suite, plus report generation and cron self-upgrade
// tasks) funnels through via callAI() / callAIForUpgrade().  A silent
// regression here is load-bearing across the entire AI surface:
//
//   - flipping the off-peak boundary (aestHour>=22 || <6) would let the
//     CEO implementing loop run compute-heavy code / deploy work during
//     peak Sydney hours, contradicting the "24/7 uptime" rule that
//     gates all deploy operations behind isOffPeakHours()
//   - dropping the "no providers" throw in callAI() would let a silent
//     empty-response bubble up to callers that then persist "" as a
//     valid AI answer to credits-charged reports
//   - dropping the isBudgetExceeded() throw would let a runaway loop
//     blow past the $100/month cap that protects the whole platform
//     from a stuck cron
//   - dropping the "return null" contract on callAIForUpgrade would
//     turn upgrade-task failures into hard exceptions that kill the
//     cron caller instead of the intended graceful skip
//   - drifting the FREE_MODELS_CONFIG absolute path would silently
//     desync the /api/cron/refresh-models writer from the ai-client
//     reader — the daily free-model refresh would land on disk but
//     never get read, and the chain would sink to hardcoded defaults
//   - drifting the "canRunUpgradeTasks < 80% budget" threshold would
//     move the safety brake before / after the point where paid
//     C-Level calls should stop firing
//   - dropping the currentMonth() reset in readBudget() would carry
//     last month's spend into a fresh month and permanently pin the
//     platform in "budget exceeded" state
//   - flipping isAnthropicConfigured() to true when neither the OAuth
//     credentials file nor ANTHROPIC_API_KEY is present would make
//     getAnthropicClient() throw AFTER a caller committed to the
//     Anthropic path — the two must agree
//
// Pins:
//   - `FREE_MODELS_CONFIG` — absolute path to the shared free-model
//     JSON that /api/cron/refresh-models writes and ai-client reads
//   - `isOffPeakHours()` — AEST hour math + boundary rules
//     (22..24 + 0..5 = off-peak, 6..21 = on-peak, boundary at exactly
//     6am AEST is on-peak, boundary at exactly 10pm AEST is off-peak)
//   - `canRunUpgradeTasks()` — 80%-of-$100 budget threshold, resets
//     when the file month != currentMonth()
//   - `getAIBudgetStatus()` — rounds spent to 2dp, integer percent,
//     resets on month-flip, defaults everything to zero when the
//     budget file is missing
//   - `isAIConfigured()` — env-driven provider chain (Cerebras, Groq,
//     SambaNova, Ollama, OpenRouter, Claude proxy pair, Claude OAuth
//     via ~/.claude/.credentials.json), returns false when none match
//   - `isAnthropicConfigured()` / `getAnthropicClient()` — must agree
//     on OAuth-first / apikey-fallback / neither-throws, expired OAuth
//     tokens are ignored, malformed credentials file gracefully falls
//     back
//   - `callAI()` — throws "No AI provider configured" when the chain
//     is empty, throws "Monthly AI budget exceeded" when the budget
//     file records spend >= $100 (checked BEFORE any provider is
//     dialled, so the cap protects the whole platform)
//   - `callAIForUpgrade()` — returns null (not throw) when no
//     upgrade-eligible provider is available; the upgrade chain is a
//     strict subset (cerebras/groq/sambanova/claude-oauth/openrouter)
//     that excludes paid keys and Ollama by design
//   - `invalidateAIKeysCache()` — callable no-op that makes the next
//     getDBKeys() hit Supabase again (proxied through the assertion
//     that isAIConfigured() re-reads the environment and does not
//     stick to a stale positive)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// fs mock — every ai-client read/write funnels through this so tests own the
// budget file, model-health file, free-models config, and OAuth credentials
// without ever touching real disk.
// ---------------------------------------------------------------------------

const fsMock = vi.hoisted(() => {
  const files = new Map<string, string>();
  function readFileSync(p: string): string {
    const v = files.get(p);
    if (v === undefined) {
      const err = new Error(`ENOENT: no such file or directory, open '${p}'`) as Error & { code?: string };
      err.code = "ENOENT";
      throw err;
    }
    return v;
  }
  function writeFileSync(p: string, content: string): void {
    files.set(p, typeof content === "string" ? content : String(content));
  }
  function existsSync(p: string): boolean {
    return files.has(p);
  }
  return { files, readFileSync, writeFileSync, existsSync };
});

vi.mock("fs", () => ({
  default: fsMock,
  readFileSync: fsMock.readFileSync,
  writeFileSync: fsMock.writeFileSync,
  existsSync: fsMock.existsSync,
}));

// ---------------------------------------------------------------------------
// Supabase mock — getDBKeys() dynamic-imports @/lib/supabase; return null so
// no DB-sourced provider ever appears (tests drive providers via env only).
// ---------------------------------------------------------------------------

const supabaseMock = vi.hoisted(() => {
  return { getSupabaseAdmin: vi.fn(() => null) };
});
vi.mock("@/lib/supabase", () => supabaseMock);

// ---------------------------------------------------------------------------
// Env sandbox — every test starts with the AI-relevant env vars cleared, and
// HOME pointed at a scratch dir so the OAuth-credentials probe is under our
// control. process.env is restored after each test.
// ---------------------------------------------------------------------------

const AI_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_PROXY_API_KEY",
  "ANTHROPIC_PROXY_BASE_URL",
  "OPENAI_API_KEY",
  "GOOGLE_GEMINI_API_KEY",
  "GROQ_API_KEY",
  "CEREBRAS_API_KEY",
  "SAMBANOVA_API_KEY",
  "OPENROUTER_API_KEY",
  "OLLAMA_HOST",
  "OLLAMA_ENABLED",
  "OLLAMA_MODEL",
  "AI_GATEWAY_URL",
  "AI_GATEWAY_SECRET",
  "AI_FETCH_MODE",
  "CRON_SECRET",
  "NEXT_PUBLIC_SITE_URL",
  "SITE_URL",
];

const savedEnv: Record<string, string | undefined> = {};

function scrubEnv(): void {
  for (const k of AI_ENV_KEYS) {
    if (!(k in savedEnv)) savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  if (!("HOME" in savedEnv)) savedEnv.HOME = process.env.HOME;
  process.env.HOME = "/nx-test-home";
}

function restoreEnv(): void {
  for (const k of Object.keys(savedEnv)) {
    const v = savedEnv[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const BUDGET_FILE = "/tmp/blockid-ai-budget.json";
const OAUTH_PATH = "/nx-test-home/.claude/.credentials.json";

function resetFs(): void {
  fsMock.files.clear();
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// Sink the loud console.warn from the storm / provider fallback so test
// output stays readable. Individual tests re-enable spy() where needed.
let warnSpy: ReturnType<typeof vi.spyOn> | null = null;
let logSpy: ReturnType<typeof vi.spyOn> | null = null;
let errorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  resetFs();
  scrubEnv();
  supabaseMock.getSupabaseAdmin.mockReset();
  supabaseMock.getSupabaseAdmin.mockReturnValue(null);
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  warnSpy?.mockRestore();
  logSpy?.mockRestore();
  errorSpy?.mockRestore();
  restoreEnv();
});

// Every test requires a fresh module instance so module-level caches
// (dbKeysCache, modelHealthCache, providerCooldown, modelCooldownUntil,
// modelCfgCache, cachedWorkerPath, gatewayBackoffUntil) can't leak across.
// Using dynamic import + vi.resetModules keeps this hermetic.
async function loadClient() {
  vi.resetModules();
  return await import("./ai-client");
}

// ---------------------------------------------------------------------------
// FREE_MODELS_CONFIG — absolute path pin
// ---------------------------------------------------------------------------

describe("FREE_MODELS_CONFIG", () => {
  it("is the absolute path the daily refresher writes to", async () => {
    const { FREE_MODELS_CONFIG } = await loadClient();
    expect(FREE_MODELS_CONFIG).toBe(
      "/home/dovanlong/blockid.au/web/content/reports/ai-free-models.json",
    );
  });

  it("is a string (not an array or object)", async () => {
    const { FREE_MODELS_CONFIG } = await loadClient();
    expect(typeof FREE_MODELS_CONFIG).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// isOffPeakHours — AEST hour math + boundary rules
// ---------------------------------------------------------------------------

function pinUtcHour(hourUtc: number): void {
  vi.useFakeTimers();
  const d = new Date(Date.UTC(2026, 5, 15, hourUtc, 0, 0));
  vi.setSystemTime(d);
}

describe("isOffPeakHours", () => {
  it("2am AEST (16:00 UTC previous day) → true", async () => {
    pinUtcHour(16);
    const { isOffPeakHours } = await loadClient();
    expect(isOffPeakHours()).toBe(true);
  });

  it("5am AEST (19:00 UTC previous day) → true (5<6 boundary inside window)", async () => {
    pinUtcHour(19);
    const { isOffPeakHours } = await loadClient();
    expect(isOffPeakHours()).toBe(true);
  });

  it("6am AEST (20:00 UTC previous day) → false (6 is on-peak boundary)", async () => {
    pinUtcHour(20);
    const { isOffPeakHours } = await loadClient();
    expect(isOffPeakHours()).toBe(false);
  });

  it("10pm AEST (12:00 UTC same day) → true (22>=22 lower boundary of off-peak)", async () => {
    pinUtcHour(12);
    const { isOffPeakHours } = await loadClient();
    expect(isOffPeakHours()).toBe(true);
  });

  it("9pm AEST (11:00 UTC same day) → false (still peak)", async () => {
    pinUtcHour(11);
    const { isOffPeakHours } = await loadClient();
    expect(isOffPeakHours()).toBe(false);
  });

  it("12noon AEST (02:00 UTC same day) → false", async () => {
    pinUtcHour(2);
    const { isOffPeakHours } = await loadClient();
    expect(isOffPeakHours()).toBe(false);
  });

  it("midnight AEST (14:00 UTC previous day) → true (0<6)", async () => {
    pinUtcHour(14);
    const { isOffPeakHours } = await loadClient();
    expect(isOffPeakHours()).toBe(true);
  });

  it("11pm AEST (13:00 UTC same day) → true (23>=22)", async () => {
    pinUtcHour(13);
    const { isOffPeakHours } = await loadClient();
    expect(isOffPeakHours()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canRunUpgradeTasks — 80%-of-$100 threshold + month-flip reset
// ---------------------------------------------------------------------------

describe("canRunUpgradeTasks", () => {
  it("returns true when the budget file is missing (fresh month)", async () => {
    const { canRunUpgradeTasks } = await loadClient();
    expect(canRunUpgradeTasks()).toBe(true);
  });

  it("returns true when totalUSD is 0 for the current month", async () => {
    fsMock.files.set(BUDGET_FILE, JSON.stringify({ month: currentMonth(), totalUSD: 0, calls: 0 }));
    const { canRunUpgradeTasks } = await loadClient();
    expect(canRunUpgradeTasks()).toBe(true);
  });

  it("returns true when totalUSD is $79.99 (just under 80%)", async () => {
    fsMock.files.set(BUDGET_FILE, JSON.stringify({ month: currentMonth(), totalUSD: 79.99, calls: 42 }));
    const { canRunUpgradeTasks } = await loadClient();
    expect(canRunUpgradeTasks()).toBe(true);
  });

  it("returns false at exactly $80 (strict < threshold)", async () => {
    fsMock.files.set(BUDGET_FILE, JSON.stringify({ month: currentMonth(), totalUSD: 80, calls: 100 }));
    const { canRunUpgradeTasks } = await loadClient();
    expect(canRunUpgradeTasks()).toBe(false);
  });

  it("returns false at $99.99 (still under monthly cap but past upgrade brake)", async () => {
    fsMock.files.set(BUDGET_FILE, JSON.stringify({ month: currentMonth(), totalUSD: 99.99, calls: 500 }));
    const { canRunUpgradeTasks } = await loadClient();
    expect(canRunUpgradeTasks()).toBe(false);
  });

  it("treats a stale-month file as fresh zero-spend (returns true)", async () => {
    fsMock.files.set(BUDGET_FILE, JSON.stringify({ month: "1999-01", totalUSD: 500, calls: 999 }));
    const { canRunUpgradeTasks } = await loadClient();
    expect(canRunUpgradeTasks()).toBe(true);
  });

  it("treats a malformed budget file as fresh zero-spend (returns true)", async () => {
    fsMock.files.set(BUDGET_FILE, "not valid json {");
    const { canRunUpgradeTasks } = await loadClient();
    expect(canRunUpgradeTasks()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getAIBudgetStatus — shape + rounding + month-flip reset
// ---------------------------------------------------------------------------

describe("getAIBudgetStatus", () => {
  it("returns zeroes when no budget file exists", async () => {
    const { getAIBudgetStatus } = await loadClient();
    const s = getAIBudgetStatus();
    expect(s).toEqual({
      month: currentMonth(),
      spent: 0,
      limit: 100,
      percent: 0,
      calls: 0,
    });
  });

  it("returns file values for the current month", async () => {
    fsMock.files.set(BUDGET_FILE, JSON.stringify({ month: currentMonth(), totalUSD: 12.34, calls: 7 }));
    const { getAIBudgetStatus } = await loadClient();
    const s = getAIBudgetStatus();
    expect(s.spent).toBe(12.34);
    expect(s.calls).toBe(7);
    expect(s.month).toBe(currentMonth());
    expect(s.limit).toBe(100);
    expect(s.percent).toBe(12);
  });

  it("rounds fractional spend to 2 decimal places", async () => {
    fsMock.files.set(BUDGET_FILE, JSON.stringify({ month: currentMonth(), totalUSD: 3.14159, calls: 1 }));
    const { getAIBudgetStatus } = await loadClient();
    expect(getAIBudgetStatus().spent).toBe(3.14);
  });

  it("rounds percent to integer", async () => {
    fsMock.files.set(BUDGET_FILE, JSON.stringify({ month: currentMonth(), totalUSD: 45.7, calls: 1 }));
    const { getAIBudgetStatus } = await loadClient();
    expect(getAIBudgetStatus().percent).toBe(46);
  });

  it("resets to zero when the file month != currentMonth()", async () => {
    fsMock.files.set(BUDGET_FILE, JSON.stringify({ month: "1999-12", totalUSD: 88, calls: 999 }));
    const { getAIBudgetStatus } = await loadClient();
    const s = getAIBudgetStatus();
    expect(s.spent).toBe(0);
    expect(s.calls).toBe(0);
    expect(s.percent).toBe(0);
    expect(s.month).toBe(currentMonth());
  });

  it("reports the $100 monthly limit as the .limit field", async () => {
    const { getAIBudgetStatus } = await loadClient();
    expect(getAIBudgetStatus().limit).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// isAnthropicConfigured / getAnthropicClient — must agree
// ---------------------------------------------------------------------------

describe("isAnthropicConfigured", () => {
  it("returns false with no OAuth file and no ANTHROPIC_API_KEY", async () => {
    const { isAnthropicConfigured } = await loadClient();
    expect(isAnthropicConfigured()).toBe(false);
  });

  it("returns true when ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const { isAnthropicConfigured } = await loadClient();
    expect(isAnthropicConfigured()).toBe(true);
  });

  it("returns true when OAuth token file has a non-expired accessToken", async () => {
    fsMock.files.set(OAUTH_PATH, JSON.stringify({
      claudeAiOauth: { accessToken: "sk-ant-oat-abc", expiresAt: Date.now() + 60 * 60 * 1000 },
    }));
    const { isAnthropicConfigured } = await loadClient();
    expect(isAnthropicConfigured()).toBe(true);
  });

  it("returns false when the OAuth token has expired (within the 5-min skew window)", async () => {
    fsMock.files.set(OAUTH_PATH, JSON.stringify({
      claudeAiOauth: { accessToken: "sk-ant-oat-expired", expiresAt: Date.now() + 60 * 1000 },
    }));
    const { isAnthropicConfigured } = await loadClient();
    expect(isAnthropicConfigured()).toBe(false);
  });

  it("returns false when the OAuth file is malformed JSON", async () => {
    fsMock.files.set(OAUTH_PATH, "not-json{");
    const { isAnthropicConfigured } = await loadClient();
    expect(isAnthropicConfigured()).toBe(false);
  });

  it("returns false when the OAuth file has no claudeAiOauth block", async () => {
    fsMock.files.set(OAUTH_PATH, JSON.stringify({ somethingElse: true }));
    const { isAnthropicConfigured } = await loadClient();
    expect(isAnthropicConfigured()).toBe(false);
  });
});

describe("getAnthropicClient", () => {
  it("throws 'No Anthropic credentials for term-sheet analysis' when unconfigured", async () => {
    const { getAnthropicClient } = await loadClient();
    expect(() => getAnthropicClient()).toThrow(/No Anthropic credentials for term-sheet analysis/);
  });

  it("returns an Anthropic client with .messages when ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const { getAnthropicClient } = await loadClient();
    const client = getAnthropicClient();
    expect(client).toBeTruthy();
    expect(typeof client.messages?.create).toBe("function");
  });

  it("returns an Anthropic client (authToken path) when a valid OAuth token exists", async () => {
    fsMock.files.set(OAUTH_PATH, JSON.stringify({
      claudeAiOauth: { accessToken: "sk-ant-oat-live", expiresAt: Date.now() + 3600_000 },
    }));
    const { getAnthropicClient } = await loadClient();
    const client = getAnthropicClient();
    expect(client).toBeTruthy();
    expect(typeof client.messages?.create).toBe("function");
  });

  it("prefers OAuth over ANTHROPIC_API_KEY when both are set (OAuth check runs first)", async () => {
    // Both configured — the code branches on OAuth first (readCliOAuthToken()
    // returns first), so we just assert no throw and a working client shape.
    process.env.ANTHROPIC_API_KEY = "sk-ant-api";
    fsMock.files.set(OAUTH_PATH, JSON.stringify({
      claudeAiOauth: { accessToken: "sk-ant-oat-both", expiresAt: Date.now() + 3600_000 },
    }));
    const { getAnthropicClient } = await loadClient();
    const client = getAnthropicClient();
    expect(typeof client.messages?.create).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// isAIConfigured — env-driven provider detection
// ---------------------------------------------------------------------------

describe("isAIConfigured", () => {
  it("returns false with a fully-scrubbed environment and no OAuth file", async () => {
    const { isAIConfigured } = await loadClient();
    expect(isAIConfigured()).toBe(false);
  });

  it("returns true when CEREBRAS_API_KEY is set", async () => {
    process.env.CEREBRAS_API_KEY = "cb-test";
    const { isAIConfigured } = await loadClient();
    expect(isAIConfigured()).toBe(true);
  });

  it("returns true when GROQ_API_KEY is set", async () => {
    process.env.GROQ_API_KEY = "gsk-test";
    const { isAIConfigured } = await loadClient();
    expect(isAIConfigured()).toBe(true);
  });

  it("returns true when SAMBANOVA_API_KEY is set", async () => {
    process.env.SAMBANOVA_API_KEY = "sn-test";
    const { isAIConfigured } = await loadClient();
    expect(isAIConfigured()).toBe(true);
  });

  it("returns true when OPENROUTER_API_KEY is set", async () => {
    process.env.OPENROUTER_API_KEY = "or-test";
    const { isAIConfigured } = await loadClient();
    expect(isAIConfigured()).toBe(true);
  });

  it("returns true when OLLAMA_HOST is set", async () => {
    process.env.OLLAMA_HOST = "http://localhost:11434";
    const { isAIConfigured } = await loadClient();
    expect(isAIConfigured()).toBe(true);
  });

  it("returns true when OLLAMA_ENABLED === 'true' (host inferred at call-time)", async () => {
    process.env.OLLAMA_ENABLED = "true";
    const { isAIConfigured } = await loadClient();
    expect(isAIConfigured()).toBe(true);
  });

  it("returns true when both claude-proxy env vars are set as a pair", async () => {
    process.env.ANTHROPIC_PROXY_API_KEY = "px-key";
    process.env.ANTHROPIC_PROXY_BASE_URL = "https://proxy.example";
    const { isAIConfigured } = await loadClient();
    expect(isAIConfigured()).toBe(true);
  });

  it("returns true when a valid OAuth token file exists", async () => {
    fsMock.files.set(OAUTH_PATH, JSON.stringify({
      claudeAiOauth: { accessToken: "sk-ant-oat-c", expiresAt: Date.now() + 3600_000 },
    }));
    const { isAIConfigured } = await loadClient();
    expect(isAIConfigured()).toBe(true);
  });

  it("returns false when only ANTHROPIC_API_KEY is set (paid claude-apikey is not in the getAvailableProviders() chain)", async () => {
    // Sanity: only the paid direct Anthropic key alone does NOT surface in
    // the free-first chain (claude-apikey is excluded by design). Only OAuth
    // (subscription) or the proxy (shared key) is considered.
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    const { isAIConfigured } = await loadClient();
    expect(isAIConfigured()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// callAI — throws when unconfigured / budget-exceeded
// ---------------------------------------------------------------------------

describe("callAI", () => {
  it("throws 'No AI provider configured' when the env is scrubbed and no OAuth file exists", async () => {
    const { callAI } = await loadClient();
    await expect(
      callAI({ system: "s", user: "u" }),
    ).rejects.toThrow(/No AI provider configured/);
  });

  it("throws 'Monthly AI budget exceeded' when totalUSD >= $100 for the current month, even with providers present", async () => {
    process.env.CEREBRAS_API_KEY = "cb-test";
    fsMock.files.set(BUDGET_FILE, JSON.stringify({ month: currentMonth(), totalUSD: 100, calls: 100 }));
    const { callAI } = await loadClient();
    await expect(
      callAI({ system: "s", user: "u" }),
    ).rejects.toThrow(/Monthly AI budget exceeded/);
  });

  it("does NOT throw budget-exceeded when the file's month is stale (fresh month resets)", async () => {
    // No providers so it throws the OTHER error — but confirms budget check
    // sees the reset (i.e. does NOT throw budget-exceeded first).
    fsMock.files.set(BUDGET_FILE, JSON.stringify({ month: "1999-01", totalUSD: 500, calls: 999 }));
    const { callAI } = await loadClient();
    await expect(
      callAI({ system: "s", user: "u" }),
    ).rejects.toThrow(/No AI provider configured/);
  });

  it("throws 'No AI provider configured' when only ANTHROPIC_API_KEY is set (paid claude-apikey excluded)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    const { callAI } = await loadClient();
    await expect(
      callAI({ system: "s", user: "u" }),
    ).rejects.toThrow(/No AI provider configured/);
  });

  it("consults supabase for DB-sourced keys via getDBKeys() before failing", async () => {
    // Even if env is bare, callAI() awaits getDBKeys() first. Assert the
    // supabase probe fires once (returning null in our mock → no DB keys).
    supabaseMock.getSupabaseAdmin.mockReturnValue(null);
    const { callAI } = await loadClient();
    await expect(callAI({ system: "s", user: "u" })).rejects.toThrow();
    expect(supabaseMock.getSupabaseAdmin).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// callAIForUpgrade — graceful null instead of throw
// ---------------------------------------------------------------------------

describe("callAIForUpgrade", () => {
  it("returns null when the env has no upgrade-eligible provider", async () => {
    const { callAIForUpgrade } = await loadClient();
    const out = await callAIForUpgrade({ system: "s", user: "u" });
    expect(out).toBeNull();
  });

  it("returns null when only OLLAMA_HOST is set (ollama is NOT in the upgrade chain)", async () => {
    process.env.OLLAMA_HOST = "http://localhost:11434";
    const { callAIForUpgrade } = await loadClient();
    const out = await callAIForUpgrade({ system: "s", user: "u" });
    expect(out).toBeNull();
  });

  it("returns null when only ANTHROPIC_API_KEY is set (paid direct key excluded from upgrades)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    const { callAIForUpgrade } = await loadClient();
    const out = await callAIForUpgrade({ system: "s", user: "u" });
    expect(out).toBeNull();
  });

  it("returns null when the paid claude-proxy is the only env pair set (proxy is not in the free upgrade chain)", async () => {
    process.env.ANTHROPIC_PROXY_API_KEY = "px";
    process.env.ANTHROPIC_PROXY_BASE_URL = "https://x";
    const { callAIForUpgrade } = await loadClient();
    const out = await callAIForUpgrade({ system: "s", user: "u" });
    expect(out).toBeNull();
  });

  it("does NOT throw when all providers are unavailable — the cron caller relies on this", async () => {
    const { callAIForUpgrade } = await loadClient();
    // If this ever throws, cron workers that call it will crash mid-tick.
    await expect(callAIForUpgrade({ system: "s", user: "u" })).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// invalidateAIKeysCache — behaves as a no-op cache clear
// ---------------------------------------------------------------------------

describe("invalidateAIKeysCache", () => {
  it("is callable and returns undefined", async () => {
    const { invalidateAIKeysCache } = await loadClient();
    expect(invalidateAIKeysCache()).toBeUndefined();
  });

  it("does not throw when called multiple times in a row", async () => {
    const { invalidateAIKeysCache } = await loadClient();
    expect(() => {
      invalidateAIKeysCache();
      invalidateAIKeysCache();
      invalidateAIKeysCache();
    }).not.toThrow();
  });

  it("does not throw when called before any getDBKeys() run has populated the cache", async () => {
    const { invalidateAIKeysCache } = await loadClient();
    expect(() => invalidateAIKeysCache()).not.toThrow();
  });

  it("forces the next callAI() to hit supabase again", async () => {
    const { callAI, invalidateAIKeysCache } = await loadClient();
    // First call populates the cache (getSupabaseAdmin returns null → no keys)
    await expect(callAI({ system: "s", user: "u" })).rejects.toThrow();
    const beforeCount = supabaseMock.getSupabaseAdmin.mock.calls.length;
    invalidateAIKeysCache();
    // Second call — after invalidation — must re-consult supabase
    await expect(callAI({ system: "s", user: "u" })).rejects.toThrow();
    expect(supabaseMock.getSupabaseAdmin.mock.calls.length).toBeGreaterThan(beforeCount);
  });
});
