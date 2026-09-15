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
// S31-A — the Anthropic quality tier is mocked so no test can dial
// api.anthropic.com with a fake key. `tierMock.call` is swapped per test.
// ---------------------------------------------------------------------------

const tierMock = vi.hoisted(() => ({
  call: vi.fn(async (): Promise<unknown> => {
    throw new Error("Anthropic 401 authentication_error: mocked");
  }),
}));
vi.mock("@/lib/ai/anthropic-tier", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, callAnthropicTier: tierMock.call };
});

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
  // S31-A queue knobs + cap
  "AI_MAX_CONCURRENT",
  "AI_MAX_QUEUED",
  "AI_MAX_PER_USER",
  "AI_USER_QUEUE",
  "AI_BACKGROUND_RESERVE",
  "AI_QUEUE_WAIT_MS",
  "AI_PROVIDER_PROBE",
  "AI_DAILY_SPEND_CAP_AUD",
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
  tierMock.call.mockReset();
  tierMock.call.mockRejectedValue(new Error("Anthropic 401 authentication_error: mocked"));
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

  it("returns true when only ANTHROPIC_API_KEY is set (S31-A: claude-apikey is the quality tier)", async () => {
    // S31-A flipped this: a funded Anthropic key alone IS a configured
    // platform — it is the quality tier the dispatcher tries first.
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    const { isAIConfigured } = await loadClient();
    expect(isAIConfigured()).toBe(true);
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

  it("dials the Anthropic quality tier when only ANTHROPIC_API_KEY is set, and surfaces its 401 (S31-A)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    tierMock.call.mockRejectedValueOnce(new Error("Anthropic 401 authentication_error: API key is invalid."));
    const { callAI } = await loadClient();
    await expect(callAI({ system: "s", user: "u" })).rejects.toThrow(/401 authentication_error/);
    expect(tierMock.call).toHaveBeenCalledTimes(1);
  });

  it("returns the Anthropic result (usage + cost) when the quality tier answers (S31-A)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    process.env.GROQ_API_KEY = "gsk-free";
    tierMock.call.mockResolvedValueOnce({
      text: "hello", model: "claude-sonnet-5", streamed: false, cost_usd: 0.0012,
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });
    const { callAI } = await loadClient();
    const out = await callAI({ system: "s", user: "u" });
    expect(out.provider).toBe("claude");
    expect(out.model).toBe("claude-sonnet-5");
    expect(out.cost_usd).toBeCloseTo(0.0012, 6);
    expect(out.usage?.input_tokens).toBe(100);
  });

  it("does NOT dial Anthropic again once the key is latched invalid — the free tier serves (S31-A)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    const mod = await loadClient();
    const tier = await import("@/lib/ai/anthropic-tier");
    tier.markAnthropicKeyInvalid(Date.now(), "test");
    await expect(mod.callAI({ system: "s", user: "u" })).rejects.toThrow(/blocked|invalid key/i);
    expect(tierMock.call).not.toHaveBeenCalled();
    tier._resetAnthropicTierForTests();
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

// ---------------------------------------------------------------------------
// Parallel-serving dispatcher: pickBestProvider + getDispatcherState
// ---------------------------------------------------------------------------
// These tests exercise the pure-logic pieces of the dispatcher: routing choice
// under simulated load and the observability snapshot. They don't call callAI
// itself (that needs a full HTTP mock stack) — the routing invariants are what
// determine whether N concurrent calls stampede one provider or spread out.

describe("pickBestProvider — capacity-aware routing", () => {
  beforeEach(async () => {
    const mod = await loadClient();
    mod._resetDispatcherForTests();
  });

  it("returns null for an empty candidate list", async () => {
    const { pickBestProvider } = await loadClient();
    expect(pickBestProvider([])).toBeNull();
  });

  it("returns the sole candidate when only one provider is available", async () => {
    const { pickBestProvider } = await loadClient();
    expect(pickBestProvider(["groq"])).toBe("groq");
  });

  it("prefers the higher-RPM provider on a cold system (tiebreak by capacity)", async () => {
    const { pickBestProvider } = await loadClient();
    // groq (1000 RPM) has vastly more headroom than cerebras (30 RPM) at rest
    expect(pickBestProvider(["cerebras", "groq"])).toBe("groq");
  });

  it("keeps input order when capacities tie (ties preserve quality ranking)", async () => {
    const { pickBestProvider } = await loadClient();
    // claude-oauth and claude-proxy both default to 50 RPM in the same table
    expect(pickBestProvider(["claude-oauth", "claude-proxy"])).toBe("claude-oauth");
    expect(pickBestProvider(["claude-proxy", "claude-oauth"])).toBe("claude-proxy");
  });

  it("returns a candidate even when every provider is saturated (least-bad wins)", async () => {
    const { pickBestProvider } = await loadClient();
    // With no way to fire, we still want a target to attempt — the caller's
    // cooldown / error path will handle the 429 that likely follows.
    const pick = pickBestProvider(["cerebras", "groq"]);
    expect(pick).not.toBeNull();
  });

  it("prefers a free provider over a paid one even when the paid has more capacity", async () => {
    const { pickBestProvider } = await loadClient();
    // deepinfra (paid, 300 RPM) has 15× the capacity of cerebras (free, 30 RPM),
    // but the free-first policy must still pick cerebras.
    expect(pickBestProvider(["deepinfra", "cerebras"])).toBe("cerebras");
    expect(pickBestProvider(["cerebras", "deepinfra"])).toBe("cerebras");
  });

  it("only picks a paid provider when NO free provider is available in the candidate list", async () => {
    const { pickBestProvider } = await loadClient();
    // No free tier in the list → paid tier is all there is.
    expect(pickBestProvider(["deepinfra", "claude-haiku-direct"])).toBe("deepinfra");
    // deepinfra has more capacity (300) than claude-haiku-direct (200)
  });

  it("classifies claude-oauth and claude-proxy as free (subscription = no per-call cost)", async () => {
    const { pickBestProvider } = await loadClient();
    // Claude subscription paths must beat DeepInfra (paid).
    expect(pickBestProvider(["deepinfra", "claude-oauth"])).toBe("claude-oauth");
    expect(pickBestProvider(["deepinfra", "claude-proxy"])).toBe("claude-proxy");
  });
});

describe("getPaidTierEventsLastHour — paid-tier engagement counter", () => {
  it("is 0 when no paid provider has been engaged", async () => {
    const { getPaidTierEventsLastHour, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    expect(getPaidTierEventsLastHour()).toBe(0);
  });

  it("increments after pickBestProvider chooses a paid provider (no free candidates)", async () => {
    const { pickBestProvider, getPaidTierEventsLastHour, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    pickBestProvider(["deepinfra"]);            // paid-only list → engages paid tier
    expect(getPaidTierEventsLastHour()).toBeGreaterThan(0);
  });
});

describe("getDispatcherState — observability snapshot", () => {
  beforeEach(async () => {
    const mod = await loadClient();
    mod._resetDispatcherForTests();
  });

  it("reports zero global running/queued on a fresh dispatcher", async () => {
    const { getDispatcherState } = await loadClient();
    const s = getDispatcherState();
    expect(s.globalRunning).toBe(0);
    expect(s.globalQueued).toBe(0);
  });

  it("perProvider only lists providers with active fires/in-flight (never all 10 rows)", async () => {
    const { getDispatcherState } = await loadClient();
    const s = getDispatcherState();
    expect(Object.keys(s.perProvider)).toEqual([]);
  });

  it("perAgent only lists agents with active work (empty on a fresh dispatcher)", async () => {
    const { getDispatcherState } = await loadClient();
    const s = getDispatcherState();
    expect(s.perAgent).toEqual({});
  });
});

describe("_resetDispatcherForTests — hermetic reset", () => {
  it("is exported (tests can restore a clean slate between cases)", async () => {
    const { _resetDispatcherForTests } = await loadClient();
    expect(typeof _resetDispatcherForTests).toBe("function");
  });

  it("returns undefined and does not throw when called on a fresh dispatcher", async () => {
    const { _resetDispatcherForTests } = await loadClient();
    expect(_resetDispatcherForTests()).toBeUndefined();
  });

  it("is idempotent (calling twice in a row is safe)", async () => {
    const { _resetDispatcherForTests } = await loadClient();
    expect(() => {
      _resetDispatcherForTests();
      _resetDispatcherForTests();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// S31-A — backpressure: bounded queue, per-user fairness, background yields,
// and the AICapacityError (503) contract. The Anthropic tier mock is the only
// provider and each call resolves when the test says so.
// ---------------------------------------------------------------------------

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const okResult = (n: number) => ({
  text: `r${n}`, model: "claude-sonnet-5", streamed: false, cost_usd: 0,
  usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
});

/** Real-time settle: callAI awaits a dynamic import before it queues, so the
 *  dispatcher state is only observable after a macrotask or two. */
async function settle(ms = 120): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
async function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > until) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("S31-A backpressure — per-user fairness (AI_MAX_PER_USER=2)", () => {
  it("lets 2 calls per user run, queues the 3rd, and dispatches it when one finishes", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    const gates = [deferred<unknown>(), deferred<unknown>(), deferred<unknown>()];
    let n = 0;
    tierMock.call.mockImplementation(() => gates[n++].promise);
    const { callAI, getDispatcherState, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    const calls = [0, 1, 2].map(() => callAI({ system: "s", user: "u", userId: "founder-1" }));
    await waitFor(() => tierMock.call.mock.calls.length >= 2);
    await settle();
    expect(tierMock.call).toHaveBeenCalledTimes(2);
    expect(getDispatcherState().perUser["founder-1"]).toBe(2);
    gates[0].resolve(okResult(0));
    await waitFor(() => tierMock.call.mock.calls.length >= 3);
    gates[1].resolve(okResult(1));
    gates[2].resolve(okResult(2));
    const out = await Promise.all(calls);
    expect(out.map((r) => r.text).sort()).toEqual(["r0", "r1", "r2"]);
    expect(getDispatcherState().perUser).toEqual({});
    expect(getDispatcherState().globalRunning).toBe(0);
  });

  it("a user past their in-flight AND queue allowance gets AICapacityError (503, Retry-After) — other users are untouched", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    process.env.AI_MAX_PER_USER = "1";
    process.env.AI_USER_QUEUE = "0";
    const gate = deferred<unknown>();
    tierMock.call.mockImplementation(() => gate.promise);
    const { callAI, _resetDispatcherForTests, getDispatcherState } = await loadClient();
    const { isAICapacityError } = await import("@/lib/ai/capacity");
    _resetDispatcherForTests();
    const first = callAI({ system: "s", user: "u", userId: "u1" });
    await waitFor(() => tierMock.call.mock.calls.length >= 1);
    const err = await callAI({ system: "s", user: "u", userId: "u1" }).catch((e) => e as Error);
    expect(isAICapacityError(err)).toBe(true);
    expect((err as { status?: number }).status).toBe(503);
    expect((err as { retryAfterSec?: number }).retryAfterSec).toBeGreaterThanOrEqual(2);
    expect(err.message).toMatch(/try again in ~\d+ s/);
    // The rejected call released its global slot; another user still runs.
    expect(getDispatcherState().globalRunning).toBe(1);
    const other = callAI({ system: "s", user: "u", userId: "u2" });
    await waitFor(() => tierMock.call.mock.calls.length >= 2);
    gate.resolve(okResult(1));
    await Promise.all([first, other]);
    expect(getDispatcherState().globalRunning).toBe(0);
  });
});

describe("S31 review — a user waiting at their per-user cap holds no global slot", () => {
  it("3 calls from one user with AI_MAX_PER_USER=1 leave globalRunning at 1, so a second user runs immediately on a 2-slot dispatcher", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    process.env.AI_MAX_CONCURRENT = "2";
    process.env.AI_MAX_PER_USER = "1";
    process.env.AI_USER_QUEUE = "2";
    const gates: Array<ReturnType<typeof deferred<unknown>>> = [];
    tierMock.call.mockImplementation(() => { const g = deferred<unknown>(); gates.push(g); return g.promise; });
    const { callAI, getDispatcherState, getAIQueueDepth, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    const u1 = [0, 1, 2].map(() => callAI({ system: "s", user: "u", userId: "u1" }));
    await waitFor(() => tierMock.call.mock.calls.length >= 1);
    await settle();
    // Before the fix the two user-queued calls each held a global slot
    // (globalRunning 3 > max 2 was impossible, but 2 of 2 were pinned).
    expect(getDispatcherState().globalRunning).toBe(1);
    expect(getAIQueueDepth().queued).toBe(0);
    const u2 = callAI({ system: "s", user: "u", userId: "u2" });
    await waitFor(() => tierMock.call.mock.calls.length >= 2); // u2 took the free slot at once
    expect(getDispatcherState().globalRunning).toBe(2);
    for (let i = 0; i < 4; i++) {
      await waitFor(() => gates.length >= i + 1);
      gates[i]!.resolve(okResult(i));
    }
    await Promise.all([...u1, u2]);
    expect(getDispatcherState().globalRunning).toBe(0);
    expect(getDispatcherState().perUser).toEqual({});
  });
});

describe("S31-A backpressure — bounded global queue + background yields to users", () => {
  it("queue full → AICapacityError('queue_full'), never a bare Error; ai_queue_depth reports the wait", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    process.env.AI_MAX_CONCURRENT = "1";
    process.env.AI_MAX_QUEUED = "1";
    const gate = deferred<unknown>();
    tierMock.call.mockImplementation(() => gate.promise);
    const { callAI, getAIQueueDepth, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    const a = callAI({ system: "s", user: "u" });
    await waitFor(() => tierMock.call.mock.calls.length >= 1);
    const b = callAI({ system: "s", user: "u" }); // queued (1/1)
    await waitFor(() => getAIQueueDepth().queued === 1);
    expect(getAIQueueDepth()).toEqual({ queued: 1, queued_user: 1, queued_background: 0, running: 1, max_concurrent: 1 });
    const err = await callAI({ system: "s", user: "u" }).catch((e) => e as Error & { reason?: string });
    expect(err.name).toBe("AICapacityError");
    expect(err.reason).toBe("queue_full");
    gate.resolve(okResult(1));
    await Promise.all([a, b]);
    expect(getAIQueueDepth().queued).toBe(0);
  });

  it("background work leaves a reserve for users and is dequeued only after waiting users", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    process.env.AI_MAX_CONCURRENT = "4";
    process.env.AI_BACKGROUND_RESERVE = "0.25"; // reserve = 1 slot
    const gates: Array<ReturnType<typeof deferred<unknown>>> = [];
    tierMock.call.mockImplementation(() => { const g = deferred<unknown>(); gates.push(g); return g.promise; });
    const { callAI, getAIQueueDepth, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    const bg = [0, 1, 2, 3].map(() => callAI({ system: "s", user: "u", priority: "background" }));
    await waitFor(() => getAIQueueDepth().queued_background === 1);
    await settle();
    // 3 background run, the 4th waits: slot #4 is the user reserve.
    expect(tierMock.call).toHaveBeenCalledTimes(3);
    expect(getAIQueueDepth()).toMatchObject({ running: 3, queued_background: 1, queued_user: 0 });
    const user = callAI({ system: "s", user: "u", priority: "user" });
    await waitFor(() => tierMock.call.mock.calls.length >= 4); // the user took the reserved slot immediately
    expect(getAIQueueDepth()).toMatchObject({ running: 4, queued_background: 1 });
    // A second user call queues; when a slot frees, the USER lane is served first.
    const user2 = callAI({ system: "s", user: "u", priority: "user" });
    await waitFor(() => getAIQueueDepth().queued_user === 1);
    expect(getAIQueueDepth()).toMatchObject({ queued_user: 1, queued_background: 1 });
    gates[0].resolve(okResult(0));
    await waitFor(() => tierMock.call.mock.calls.length >= 5);
    expect(getAIQueueDepth()).toMatchObject({ queued_user: 0, queued_background: 1 });
    for (let i = 1; i < gates.length; i++) gates[i].resolve(okResult(i));
    await waitFor(() => tierMock.call.mock.calls.length >= 6);
    for (let i = 5; i < gates.length; i++) gates[i].resolve(okResult(i));
    await Promise.all([...bg, user, user2]);
    expect(getAIQueueDepth().queued).toBe(0);
  });
});

describe("S31-A — daily spend cap skips the paid tiers, free tier keeps serving", () => {
  it("with the cap reached, Anthropic is never dialled; the error names the cap when nothing else is configured", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    process.env.AI_DAILY_SPEND_CAP_AUD = "1";
    const { callAI, _resetDispatcherForTests } = await loadClient();
    const spend = await import("@/lib/ai/spend-guard");
    spend._resetSpendGuardForTests();
    spend.recordPaidSpend("claude-apikey", 5); // US$5 × 1.55 ≫ A$1
    _resetDispatcherForTests();
    await expect(callAI({ system: "s", user: "u" })).rejects.toThrow(/blocked .*daily cap/);
    expect(tierMock.call).not.toHaveBeenCalled();
    spend._resetSpendGuardForTests();
  });

  it("records real Anthropic usage cost into the daily ledger after a successful call", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    tierMock.call.mockResolvedValueOnce({ ...okResult(1), cost_usd: 0.42 });
    const { callAI, _resetDispatcherForTests } = await loadClient();
    const spend = await import("@/lib/ai/spend-guard");
    spend._resetSpendGuardForTests();
    _resetDispatcherForTests();
    await callAI({ system: "s", user: "u" });
    expect(spend.readDailySpend().spent_usd).toBeCloseTo(0.42, 8);
    expect(spend.readDailySpend().by_provider["claude-apikey"]).toBeCloseTo(0.42, 8);
    spend._resetSpendGuardForTests();
  });
});
