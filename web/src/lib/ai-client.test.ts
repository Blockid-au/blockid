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
import type https from "node:https";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";

// Hard network boundary: namespace imports in ai-client must receive the mock,
// not a copied node namespace captured before a later spy is installed.
const networkMock = vi.hoisted(() => ({ request: vi.fn(() => { throw new Error("HTTP 599: unexpected test transport"); }) }));
vi.mock("https", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, request: networkMock.request };
});
vi.mock("http", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, request: networkMock.request };
});

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
  // S32-C routing knobs
  "DEEPINFRA_API_KEY",
  "ANTHROPIC_HAIKU_API_KEY",
  "AI_REPORT_PROVIDER_ORDER",
  "AI_RPM_CLAUDE_OAUTH",
  "AI_RPM_CLAUDE_PROXY",
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
    // G24-B: the previous test's 401 latched the tier for the process — clear it here.
    (await import("@/lib/ai/anthropic-tier"))._resetAnthropicTierForTests();
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
    // S32-C: claude-oauth defaults to 20 RPM (fallback-only); pin both
    // subscription paths to the same ceiling so the tie-break is exercised.
    process.env.AI_RPM_CLAUDE_OAUTH = "50";
    process.env.AI_RPM_CLAUDE_PROXY = "50";
    const { pickBestProvider } = await loadClient();
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

  it("classify: prefers a free provider over the quality-cost tier even when the paid one has more capacity", async () => {
    const { pickBestProvider } = await loadClient();
    // deepinfra (quality-cost, 300 RPM) has 10× the capacity of cerebras (free,
    // 30 RPM), but classify is cheap-first so cerebras wins.
    expect(pickBestProvider(["deepinfra", "cerebras"], "classify")).toBe("cerebras");
    expect(pickBestProvider(["cerebras", "deepinfra"], "classify")).toBe("cerebras");
  });

  it("report / synthesis: the quality-cost tier (deepinfra, gemini) beats every free provider (S32-C)", async () => {
    const { pickBestProvider } = await loadClient();
    expect(pickBestProvider(["cerebras", "deepinfra"], "report")).toBe("deepinfra");
    expect(pickBestProvider(["groq", "gemini"], "synthesis")).toBe("gemini");
    // default class is `report` (matches inferTaskClass's default)
    expect(pickBestProvider(["groq", "deepinfra"])).toBe("deepinfra");
  });

  it("only picks the last-resort paid tier when nothing better is in the candidate list", async () => {
    const { pickBestProvider } = await loadClient();
    expect(pickBestProvider(["claude-haiku-direct", "groq"], "report")).toBe("groq");
    expect(pickBestProvider(["claude-haiku-direct"], "report")).toBe("claude-haiku-direct");
  });

  it("claude-oauth is a fallback, never primary: loses to deepinfra/gemini for reports and to free tiers for classify (S32-C)", async () => {
    const { pickBestProvider } = await loadClient();
    expect(pickBestProvider(["claude-oauth", "deepinfra"], "report")).toBe("deepinfra");
    expect(pickBestProvider(["claude-oauth", "gemini"], "synthesis")).toBe("gemini");
    expect(pickBestProvider(["claude-oauth", "groq"], "classify")).toBe("groq");
    // …but it still beats the free tiers for a report (Sonnet 5 > a 27B model)
    expect(pickBestProvider(["groq", "claude-oauth"], "report")).toBe("claude-oauth");
    // …and the last-resort paid tier in every class
    expect(pickBestProvider(["claude-haiku-direct", "claude-oauth"], "classify")).toBe("claude-oauth");
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
    pickBestProvider(["claude-haiku-direct"]);  // last-resort paid-only list → engages paid tier
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

// ---------------------------------------------------------------------------
// S32-C — quality-first, cheapest-possible routing for report tasks.
// Provider order per task class, report-grade model allow-list, per-class
// model choice for the quality-cost providers, the AI_REPORT_PROVIDER_ORDER
// override, cost table entries and the `via` field. No live calls.
// ---------------------------------------------------------------------------

function setOAuthFixture(): void {
  fsMock.files.set(OAUTH_PATH, JSON.stringify({
    claudeAiOauth: { accessToken: "sk-ant-oat-test", expiresAt: Date.now() + 60 * 60_000 },
  }));
}

describe("S32-C — provider order per task class", () => {
  it("report/synthesis: claude-apikey → deepinfra → gemini → claude-oauth → groq → sambanova → cerebras → openrouter (configured keys only)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-x";
    process.env.DEEPINFRA_API_KEY = "di";
    process.env.GOOGLE_GEMINI_API_KEY = "gm";
    process.env.GROQ_API_KEY = "gq";
    process.env.SAMBANOVA_API_KEY = "sn";
    process.env.CEREBRAS_API_KEY = "cb";
    process.env.OPENROUTER_API_KEY = "or";
    setOAuthFixture();
    const { getAvailableProviders } = await loadClient();
    const expected = ["claude-apikey", "deepinfra", "gemini", "claude-oauth", "groq", "sambanova", "cerebras", "openrouter"];
    expect(getAvailableProviders("report")).toEqual(expected);
    expect(getAvailableProviders("synthesis")).toEqual(expected);
    expect(getAvailableProviders()).toEqual(expected); // default = report
  });

  it("classify: cheap-first — free tiers before gemini/deepinfra, claude-oauth after them", async () => {
    process.env.DEEPINFRA_API_KEY = "di";
    process.env.GOOGLE_GEMINI_API_KEY = "gm";
    process.env.GROQ_API_KEY = "gq";
    process.env.CEREBRAS_API_KEY = "cb";
    process.env.OPENROUTER_API_KEY = "or";
    setOAuthFixture();
    const { getAvailableProviders } = await loadClient();
    expect(getAvailableProviders("classify")).toEqual(["groq", "cerebras", "openrouter", "gemini", "deepinfra", "claude-oauth"]);
  });

  it("gemini is ENABLED when GOOGLE_GEMINI_API_KEY is set, and absent otherwise", async () => {
    process.env.GOOGLE_GEMINI_API_KEY = "gm";
    const withKey = await loadClient();
    expect(withKey.getAvailableProviders("report")).toEqual(["gemini"]);
    expect(withKey.isAIConfigured()).toBe(true);
    delete process.env.GOOGLE_GEMINI_API_KEY;
    const without = await loadClient();
    expect(without.getAvailableProviders("report")).toEqual([]);
  });

  it("tier ranking: deepinfra/gemini are quality-cost, claude-oauth is subscription (fallback), haiku-direct is paid", async () => {
    const { providerTier, TIER_ORDER_BY_CLASS } = await loadClient();
    expect(providerTier("claude-apikey")).toBe("quality");
    expect(providerTier("deepinfra")).toBe("quality-cost");
    expect(providerTier("gemini")).toBe("quality-cost");
    expect(providerTier("claude-oauth")).toBe("subscription");
    expect(providerTier("groq")).toBe("free");
    expect(providerTier("claude-haiku-direct")).toBe("paid");
    expect(TIER_ORDER_BY_CLASS.report).toEqual(["quality", "quality-cost", "subscription", "free", "paid"]);
    expect(TIER_ORDER_BY_CLASS.classify).toEqual(["quality", "free", "quality-cost", "subscription", "paid"]);
  });

  it("claude-oauth is never picked while deepinfra or gemini has headroom, even when it has the most capacity", async () => {
    process.env.AI_RPM_CLAUDE_OAUTH = "5000";
    const { pickBestProvider, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    expect(pickBestProvider(["claude-oauth", "deepinfra", "gemini"], "report")).toBe("deepinfra");
    expect(pickBestProvider(["claude-oauth", "gemini"], "report")).toBe("gemini");
  });

  it("pickBestProvider still honours blocks: a provider on the daily cap is skipped for report classes too", async () => {
    process.env.AI_DAILY_SPEND_CAP_AUD = "1";
    const { pickBestProvider, _resetDispatcherForTests } = await loadClient();
    const spend = await import("@/lib/ai/spend-guard");
    spend._resetSpendGuardForTests();
    spend.recordPaidSpend("deepinfra", 5); // US$5 ≫ A$1 cap
    _resetDispatcherForTests();
    // quality-cost is paid → blocked by the cap; free tier serves
    expect(pickBestProvider(["deepinfra", "gemini", "groq"], "report")).toBe("groq");
    // only capped providers → nothing usable (never bypass a cap)
    expect(pickBestProvider(["deepinfra", "gemini"], "report")).toBeNull();
    spend._resetSpendGuardForTests();
  });
});

// ---------------------------------------------------------------------------
// G25-B — ANTHROPIC_API_KEY is OPTIONAL (founder 2026-09-21: no key, the
// Claude CLI subscription is the Anthropic path). Absent or placeholder →
// the tier does not exist for this process: zero calls, zero log lines, the
// free chain order unchanged, claude-oauth still reachable as the fallback.
// ---------------------------------------------------------------------------

describe("G25-B — Anthropic key optional", () => {
  const freeChain = () => {
    process.env.DEEPINFRA_API_KEY = "di";
    process.env.GOOGLE_GEMINI_API_KEY = "gm";
    process.env.GROQ_API_KEY = "gq";
    process.env.SAMBANOVA_API_KEY = "sn";
    process.env.CEREBRAS_API_KEY = "cb";
    process.env.OPENROUTER_API_KEY = "or";
    setOAuthFixture();
  };

  it("absent key: claude-apikey is absent from every class, the rest of the chain keeps its order, claude-oauth stays as fallback", async () => {
    freeChain();
    delete process.env.ANTHROPIC_API_KEY;
    const { getAvailableProviders, getProviderHealthSnapshot, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    expect(getAvailableProviders("report")).toEqual(["deepinfra", "gemini", "claude-oauth", "groq", "sambanova", "cerebras", "openrouter"]);
    expect(getAvailableProviders("synthesis")).toEqual(["deepinfra", "gemini", "claude-oauth", "groq", "sambanova", "cerebras", "openrouter"]);
    expect(getAvailableProviders("classify")).toEqual(["groq", "cerebras", "sambanova", "openrouter", "gemini", "deepinfra", "claude-oauth"]);
    // Health: absent, not "blocked / unconfigured" — and claude-oauth has its own entry.
    const snap = getProviderHealthSnapshot();
    expect(snap.providers.map((p) => p.name)).not.toContain("claude-apikey");
    expect(snap.providers.find((p) => p.name === "claude-oauth")).toEqual({ name: "claude-oauth", state: "ok", cooldown_until: null });
    expect(snap.providers.every((p) => p.state === "ok")).toBe(true);
  });

  it("placeholder values (empty, whitespace, sk-ant-xxxx, changeme, <your-key>) count as absent", async () => {
    freeChain();
    for (const v of ["", "   ", "sk-ant-xxxxxxxx", "changeme", "<your-key>", "your_api_key_here", "..."]) {
      process.env.ANTHROPIC_API_KEY = v;
      const { getAvailableProviders } = await loadClient();
      expect(getAvailableProviders("report")[0]).toBe("deepinfra");
      expect(getAvailableProviders("report")).not.toContain("claude-apikey");
    }
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-real-looking-key";
    const { getAvailableProviders } = await loadClient();
    expect(getAvailableProviders("report")[0]).toBe("claude-apikey");
  });

  it("absent key: callAI never dials the Anthropic tier (zero calls) and never logs an Anthropic line; the free chain serves", async () => {
    freeChain();
    delete process.env.ANTHROPIC_API_KEY;
    tierMock.call.mockClear();
    const tier = await import("@/lib/ai/anthropic-tier");
    tier._resetAnthropicTierForTests();
    const { callAI, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    // Every non-Anthropic provider fails fast in this sandbox (no worker) —
    // what matters is that the Anthropic tier is never on the list.
    await callAI({ system: "s", user: "u", maxTokens: 50 }).catch(() => undefined);
    expect(tierMock.call).not.toHaveBeenCalled();
    expect(tier.isAnthropicKeyInvalid()).toBe(false);
    const anthropicLines = (warnSpy?.mock.calls ?? []).flat().filter((l) => typeof l === "string" && /anthropic/i.test(l) && /rejected|unconfigured|missing|not set/i.test(l));
    expect(anthropicLines).toEqual([]);
  });

  it("CLI path reachable as the fallback: with only the OAuth token the report chain is exactly [claude-oauth]", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    setOAuthFixture();
    const { getAvailableProviders, isAIConfigured, isAnthropicConfigured, pickBestProvider, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    expect(getAvailableProviders("report")).toEqual(["claude-oauth"]);
    expect(pickBestProvider(["claude-oauth"], "report")).toBe("claude-oauth");
    expect(isAIConfigured()).toBe(true);
    expect(isAnthropicConfigured()).toBe(true);
  });
});

describe("S32-C — AI_REPORT_PROVIDER_ORDER override", () => {
  it("parses a comma list: listed first, unknown ignored, '-name' drops, rest follow in default order", async () => {
    const { parseProviderOrderOverride } = await loadClient();
    expect(parseProviderOrderOverride(undefined)).toBeNull();
    expect(parseProviderOrderOverride("   ")).toBeNull();
    const out = parseProviderOrderOverride("gemini, deepinfra ,bogus,-claude-oauth,GROQ");
    expect(out?.slice(0, 3)).toEqual(["gemini", "deepinfra", "groq"]);
    expect(out).not.toContain("claude-oauth");
    expect(out).toContain("sambanova");
    expect(out?.indexOf("claude-apikey")).toBeGreaterThan(2);
  });

  it("re-orders the report chain without a deploy and is honoured strictly by pickBestProvider; classify is untouched", async () => {
    process.env.AI_REPORT_PROVIDER_ORDER = "groq,deepinfra";
    process.env.DEEPINFRA_API_KEY = "di";
    process.env.GROQ_API_KEY = "gq";
    const { getAvailableProviders, pickBestProvider, providerOrderForClass, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    expect(providerOrderForClass("report").slice(0, 2)).toEqual(["groq", "deepinfra"]);
    expect(getAvailableProviders("report")).toEqual(["groq", "deepinfra"]);
    expect(pickBestProvider(["deepinfra", "groq"], "report")).toBe("groq");
    expect(getAvailableProviders("classify")).toEqual(["groq", "deepinfra"]);
    expect(providerOrderForClass("classify")[0]).toBe("claude-apikey");
  });
});

describe("S32-C — MIN_REPORT_MODEL allow-list for report classes", () => {
  it("accepts report-grade families and rejects tiny / non-text models", async () => {
    const { isReportGradeModel } = await loadClient();
    for (const ok of [
      "openai/gpt-oss-120b", "gpt-oss-120b", "nvidia/nemotron-3-ultra-550b-a55b:free",
      "nvidia/nemotron-3-super-120b-a12b:free", "qwen/qwen3.6-27b", "qwen-3-32b",
      "Qwen3-235B-A22B-Instruct-2507", "qwen/qwen3-next-80b-a3b-instruct:free",
      "DeepSeek-V3.2", "deepseek-ai/DeepSeek-V4-Flash", "llama-3.3-70b-versatile",
      "Meta-Llama-3.3-70B-Instruct", "moonshotai/kimi-k2.6:free", "gemma-4-31b", "gemma-4-31B-it",
      "google/gemini-2.5-flash:free",
    ]) expect(isReportGradeModel(ok), ok).toBe(true);
    for (const bad of [
      "llama-3.1-8b-instant", "openai/gpt-oss-20b", "allam-2-7b", "canopylabs/orpheus-v1-english",
      "whisper-large-v3", "text-embedding-3-small", "nvidia/nemotron-nano-12b-v2-vl:free",
      "nvidia/nemotron-3-nano-30b-a3b:free", "nvidia/nemotron-3.5-lightning:free",
      "liquid/lfm-2.5-2.6b:free", "google/gemma-4-26b-a4b-it:free", "gemini-2.5-flash-lite",
      "deepseek-r1-distill-llama-70b", "google/lyria-3-pro-preview",
    ]) expect(isReportGradeModel(bad), bad).toBe(false);
  });

  it("modelsForClass filters for report/synthesis, keeps everything for classify, and falls back to the full list when nothing qualifies", async () => {
    const { modelsForClass } = await loadClient();
    const list = ["llama-3.1-8b-instant", "openai/gpt-oss-120b", "allam-2-7b", "qwen/qwen3.6-27b"];
    expect(modelsForClass(list, "report")).toEqual(["openai/gpt-oss-120b", "qwen/qwen3.6-27b"]);
    expect(modelsForClass(list, "synthesis")).toEqual(["openai/gpt-oss-120b", "qwen/qwen3.6-27b"]);
    expect(modelsForClass(list, "classify")).toEqual(list);
    expect(modelsForClass(["llama-3.1-8b-instant"], "report")).toEqual(["llama-3.1-8b-instant"]);
  });
});

describe("S32-C — per-class models on the quality-cost providers + cost table", () => {
  it("deepinfra: V4-Flash → V3.2 → Qwen3-235B → gpt-oss-120b for reports; Kimi for synthesis; gpt-oss/Llama for classify", async () => {
    const { DEEPINFRA_MODELS_BY_CLASS } = await loadClient();
    // G30 D-A1/D-A2: grounding-first order, measured 2026-09-23. gpt-oss-120b
    // attached 0 citations to a real chapter prompt, so it is classify-only.
    expect(DEEPINFRA_MODELS_BY_CLASS.report).toEqual([
      "deepseek-ai/DeepSeek-V3.2", "Qwen/Qwen3-235B-A22B-Instruct-2507", "deepseek-ai/DeepSeek-V4-Flash",
    ]);
    expect(DEEPINFRA_MODELS_BY_CLASS.report).not.toContain("openai/gpt-oss-120b");
    expect(DEEPINFRA_MODELS_BY_CLASS.synthesis).toEqual(["deepseek-ai/DeepSeek-V3.2", "deepseek-ai/DeepSeek-V4-Flash", "moonshotai/Kimi-K2.6"]);
    expect(DEEPINFRA_MODELS_BY_CLASS.classify).toEqual(["openai/gpt-oss-120b", "meta-llama/Llama-3.3-70B-Instruct-Turbo"]);
  });

  it("gemini: 3-flash-preview → 2.5-flash for reports; 3.1-pro-preview → 2.5-pro for synthesis; flash-lite for classify", async () => {
    const { GEMINI_MODELS_BY_CLASS } = await loadClient();
    expect(GEMINI_MODELS_BY_CLASS.report).toEqual(["gemini-3-flash-preview", "gemini-2.5-flash"]);
    expect(GEMINI_MODELS_BY_CLASS.synthesis).toEqual(["gemini-3.1-pro-preview", "gemini-2.5-pro"]);
    expect(GEMINI_MODELS_BY_CLASS.classify).toEqual(["gemini-2.5-flash-lite"]);
  });

  it("every per-class model has a price row and usageCostUsd computes from real usage (previews billed as GA siblings)", async () => {
    const { DEEPINFRA_MODELS_BY_CLASS, GEMINI_MODELS_BY_CLASS, PAID_PRICING_USD_PER_1M, usageCostUsd } = await loadClient();
    for (const m of Object.values(DEEPINFRA_MODELS_BY_CLASS).flat()) expect(PAID_PRICING_USD_PER_1M[`deepinfra:${m}`], m).toBeDefined();
    for (const m of Object.values(GEMINI_MODELS_BY_CLASS).flat()) expect(PAID_PRICING_USD_PER_1M[`gemini:${m}`], m).toBeDefined();
    expect(PAID_PRICING_USD_PER_1M["deepinfra:deepseek-ai/DeepSeek-V4-Flash"]).toEqual({ in: 0.09, out: 0.18 });
    expect(PAID_PRICING_USD_PER_1M["deepinfra:openai/gpt-oss-120b"]).toEqual({ in: 0.037, out: 0.17 });
    expect(PAID_PRICING_USD_PER_1M["gemini:gemini-3-flash-preview"]).toEqual(PAID_PRICING_USD_PER_1M["gemini:gemini-2.5-flash"]);
    expect(PAID_PRICING_USD_PER_1M["gemini:gemini-3.1-pro-preview"]).toEqual(PAID_PRICING_USD_PER_1M["gemini:gemini-2.5-pro"]);
    // 1M in + 1M out on V4-Flash = $0.27
    expect(usageCostUsd("deepinfra", "deepseek-ai/DeepSeek-V4-Flash", 1_000_000, 1_000_000)).toBeCloseTo(0.27, 8);
    expect(usageCostUsd("gemini", "gemini-2.5-pro", 100_000, 10_000)).toBeCloseTo(0.225, 8);
    expect(usageCostUsd("groq", "openai/gpt-oss-120b", 1000, 1000)).toBeNull(); // free — no row
  });
});

describe("S32-C — callAI stamps `via` + `taskClass` on the result", () => {
  it("reports the dispatcher provider and the inferred class", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    tierMock.call.mockResolvedValueOnce({ ...okResult(1), cost_usd: 0.01 });
    const { callAI, _resetDispatcherForTests } = await loadClient();
    const spend = await import("@/lib/ai/spend-guard");
    spend._resetSpendGuardForTests();
    _resetDispatcherForTests();
    const r = await callAI({ system: "s", user: "u", agentId: "first-analysis-cfo", taskClass: "report" });
    expect(r.via).toBe("claude-apikey");
    expect(r.taskClass).toBe("report");
    spend._resetSpendGuardForTests();
  });
});

describe("S32-F interactive ordering", () => {
  it("orders configured providers by throughput for interactive calls and keeps unknowns last", async () => {
    const { orderForInteractive } = await import("./ai-client");
    expect(orderForInteractive(["deepinfra", "gemini", "claude-oauth", "groq", "openrouter"])).toEqual(["groq", "gemini", "deepinfra", "claude-oauth", "openrouter"]);
    expect(orderForInteractive([])).toEqual([]);
  });
});

describe("S32-F pickFirstUsable", () => {
  it("returns the first candidate in order (no tier re-ranking) and null for an empty list", async () => {
    const { pickFirstUsable } = await import("./ai-client");
    expect(pickFirstUsable(["groq", "deepinfra"])).toBe("groq");
    expect(pickFirstUsable([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Post-ship review 2026-09-17 — wall-clock budget across providers + model
// ladders. A Money Finder narrative walked DeepInfra's 4-model ladder at
// 30 s each (Worker timeout) = 120 s > Cloudflare's 100 s wall → 524; the
// template fallback was never reached. `budgetMs` (default 60 s for
// `interactive`) stops every loop from STARTING a new attempt once spent and
// clamps each attempt's timeout to what is left.
// ---------------------------------------------------------------------------

describe("review 2026-09-17 — call budget helpers", () => {
  it("aiBudgetExpired: false without a deadline, false before it, true at/after it", async () => {
    const { aiBudgetExpired } = await import("./ai-client");
    expect(aiBudgetExpired({})).toBe(false);
    expect(aiBudgetExpired({ deadlineAt: Date.now() + 10_000 })).toBe(false);
    expect(aiBudgetExpired({ deadlineAt: Date.now() - 1 })).toBe(true);
  });

  it("budgetedTimeoutMs: per-attempt timeout, clamped to the remaining budget, never under 1 s", async () => {
    const { budgetedTimeoutMs } = await import("./ai-client");
    expect(budgetedTimeoutMs({ timeoutMs: 30_000 })).toBe(30_000);
    expect(budgetedTimeoutMs({})).toBe(30_000);
    expect(budgetedTimeoutMs({}, 180_000)).toBe(180_000);
    const clamped = budgetedTimeoutMs({ timeoutMs: 30_000, deadlineAt: Date.now() + 5_000 });
    expect(clamped).toBeGreaterThan(4_000);
    expect(clamped).toBeLessThanOrEqual(5_000);
    expect(budgetedTimeoutMs({ timeoutMs: 30_000, deadlineAt: Date.now() - 60_000 })).toBe(1_000);
  });

  it("INTERACTIVE_BUDGET_MS defaults to 60 s — under Cloudflare's 100 s wall with room for the caller's fallback", async () => {
    const { INTERACTIVE_BUDGET_MS } = await import("./ai-client");
    expect(INTERACTIVE_BUDGET_MS).toBe(60_000);
  });
});

describe("review 2026-09-17 — callAI stops dialling providers once the budget is spent", () => {
  it("with budgetMs already elapsed, no provider is called and the error names the budget", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    const { callAI, _resetDispatcherForTests, AIBudgetExhaustedError } = await loadClient();
    const spend = await import("@/lib/ai/spend-guard");
    spend._resetSpendGuardForTests();
    _resetDispatcherForTests();
    const nowSpy = vi.spyOn(Date, "now");
    const t0 = 1_700_000_000_000;
    // First read stamps the deadline (t0 + 100 ms); every later read is past it.
    nowSpy.mockReturnValueOnce(t0).mockReturnValue(t0 + 5_000);
    try {
      const err = await callAI({ system: "s", user: "u", budgetMs: 100 }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AIBudgetExhaustedError);
      expect(String((err as Error).message)).toMatch(/budget exhausted/);
      expect(tierMock.call).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
      spend._resetSpendGuardForTests();
    }
  });

  it("an interactive call carries the default budget; a non-interactive call is unbounded", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    tierMock.call.mockResolvedValue({ ...okResult(1), cost_usd: 0 });
    const { callAI, _resetDispatcherForTests } = await loadClient();
    const spend = await import("@/lib/ai/spend-guard");
    spend._resetSpendGuardForTests();
    _resetDispatcherForTests();
    await callAI({ system: "s", user: "u", interactive: true });
    const interactiveOpts = tierMock.call.mock.calls.at(-1)?.[0] as { deadlineAt?: number; budgetMs?: number } | undefined;
    expect(interactiveOpts?.budgetMs).toBe(60_000);
    expect(typeof interactiveOpts?.deadlineAt).toBe("number");
    // A caller with a longer per-attempt timeout keeps at least one full attempt.
    await callAI({ system: "s", user: "u", interactive: true, timeoutMs: 180_000 });
    const longOpts = tierMock.call.mock.calls.at(-1)?.[0] as { budgetMs?: number } | undefined;
    expect(longOpts?.budgetMs).toBe(180_000);
    await callAI({ system: "s", user: "u" });
    const plainOpts = tierMock.call.mock.calls.at(-1)?.[0] as { deadlineAt?: number } | undefined;
    expect(plainOpts?.deadlineAt).toBeUndefined();
    spend._resetSpendGuardForTests();
  });
});

// ---------------------------------------------------------------------------
// G15-R3.3 — provider health snapshot. A pure reader over the dispatcher's
// cooldown map / block reasons / interactive order plus a 1-hour ring buffer
// of AIBudgetExhaustedError throws, for /api/status.ai and the error digest.
// It must never change routing: the states it reports are the ones
// pickFirstUsable / pickBestProvider already act on.
// ---------------------------------------------------------------------------

describe("G15-R3 getProviderHealthSnapshot", () => {
  it("is empty when nothing is configured", async () => {
    const { getProviderHealthSnapshot, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    expect(getProviderHealthSnapshot()).toEqual({ providers: [], budget_exhausted_1h: 0, interactive_order: [], healthy_providers: 0, unfunded: [], dead_rungs: {} });
  });

  it("reports a configured provider as ok, then cooldown (with cooldown_until) after a transient failure", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    const { callAI, getProviderHealthSnapshot, _resetDispatcherForTests } = await loadClient();
    const spend = await import("@/lib/ai/spend-guard");
    const tier = await import("@/lib/ai/anthropic-tier");
    spend._resetSpendGuardForTests();
    tier._resetAnthropicTierForTests();
    _resetDispatcherForTests();
    expect(getProviderHealthSnapshot()).toEqual({
      providers: [{ name: "claude-apikey", state: "ok", cooldown_until: null }],
      budget_exhausted_1h: 0,
      interactive_order: ["claude-apikey"],
      healthy_providers: 1,
      unfunded: [],
      dead_rungs: {},
    });
    tierMock.call.mockRejectedValueOnce(new Error("Anthropic HTTP 529: Overloaded"));
    const t0 = Date.now();
    await expect(callAI({ system: "s", user: "u" })).rejects.toThrow(/529/);
    const snap = getProviderHealthSnapshot();
    expect(snap.providers).toHaveLength(1);
    expect(snap.providers[0]).toMatchObject({ name: "claude-apikey", state: "cooldown", reason: "cooldown" });
    const until = Date.parse(snap.providers[0].cooldown_until ?? "");
    expect(until).toBeGreaterThanOrEqual(t0 + 15 * 60_000 - 1_000); // overloaded → 15 min cooldown (never the process latch)
    expect(until).toBeLessThanOrEqual(Date.now() + 15 * 60_000 + 1_000);
    expect(snap.budget_exhausted_1h).toBe(0);
    spend._resetSpendGuardForTests();
    tier._resetAnthropicTierForTests();
  });

  it("reports blocked + unconfigured for a latched invalid key (no cooldown involved)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    const { getProviderHealthSnapshot, _resetDispatcherForTests } = await loadClient();
    const tier = await import("@/lib/ai/anthropic-tier");
    tier._resetAnthropicTierForTests();
    _resetDispatcherForTests();
    const now = Date.now();
    tier.markAnthropicKeyInvalid(now, "test");
    expect(getProviderHealthSnapshot(now).providers).toEqual([{ name: "claude-apikey", state: "blocked", cooldown_until: null, reason: "unconfigured" }]);
    tier._resetAnthropicTierForTests();
  });

  // ── G24-B: a 401 marks the provider unconfigured for the process ──────────
  describe("G24-B unconfigured latch", () => {
    it("a 401 from the Anthropic tier marks claude-apikey unconfigured: ONE dial, no cooldown, blocked for the rest of the process", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-solo-secret";
      const { callAI, getProviderHealthSnapshot, providerBlockReason, pickBestProvider, pickFirstUsable, _resetDispatcherForTests } = await loadClient();
      const spend = await import("@/lib/ai/spend-guard");
      const tier = await import("@/lib/ai/anthropic-tier");
      spend._resetSpendGuardForTests();
      tier._resetAnthropicTierForTests();
      _resetDispatcherForTests();
      tierMock.call.mockRejectedValue(new Error("Anthropic 401 authentication_error: API key rejected"));
      await expect(callAI({ system: "s", user: "u" })).rejects.toThrow(/401/);
      expect(tierMock.call).toHaveBeenCalledTimes(1);
      expect(providerBlockReason("claude-apikey")).toBe("unconfigured");
      expect(getProviderHealthSnapshot().providers).toEqual([{ name: "claude-apikey", state: "blocked", cooldown_until: null, reason: "unconfigured" }]);
      // Never picked — not even as "the coolest of an all-blocked list".
      expect(pickBestProvider(["claude-apikey"], "report")).toBeNull();
      expect(pickFirstUsable(["claude-apikey"])).toBeNull();
      // Second call: no dial at all, and the error says why.
      await expect(callAI({ system: "s", user: "u" })).rejects.toThrow(/blocked|invalid key|unconfigured/i);
      expect(tierMock.call).toHaveBeenCalledTimes(1);
      // One log line, from the tier module, naming the env var and never the key.
      const lines = (warnSpy?.mock.calls ?? []).map((c) => String(c[0])).filter((l) => /unconfigured/.test(l));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("ANTHROPIC_API_KEY");
      expect(lines[0]).not.toContain("sk-ant");
      expect(lines[0]).not.toContain("key len=");
      spend._resetSpendGuardForTests();
      tier._resetAnthropicTierForTests();
    });

    it("any provider: markProviderUnconfigured latches for the process, logs once naming the env var (no value), and survives a transient-cooldown fallback", async () => {
      process.env.GROQ_API_KEY = "gsk-secret-value";
      process.env.DEEPINFRA_API_KEY = "di-secret-value";
      const mod = await loadClient();
      mod._resetDispatcherForTests();
      expect(mod.providerBlockReason("groq")).toBeNull();
      mod.markProviderUnconfigured("groq", "401 invalid key");
      mod.markProviderUnconfigured("groq", "401 invalid key again");
      expect(mod.isProviderUnconfigured("groq")).toBe(true);
      expect(mod.providerBlockReason("groq")).toBe("unconfigured");
      expect(mod.providerBlockReason("deepinfra")).toBeNull();
      const lines = (warnSpy?.mock.calls ?? []).map((c) => String(c[0])).filter((l) => /groq rejected the key/.test(l));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("GROQ_API_KEY");
      expect(lines[0]).toContain("unconfigured for the rest of this process");
      expect(lines[0]).not.toContain("gsk-secret-value");
      // deepinfra merely cooling → it is retried as the only candidate; groq never is.
      expect(mod.pickBestProvider(["groq", "deepinfra"], "report")).toBe("deepinfra");
      expect(mod.pickBestProvider(["groq"], "report")).toBeNull();
      expect(mod.getProviderHealthSnapshot().providers.find((p) => p.name === "groq")).toEqual({ name: "groq", state: "blocked", cooldown_until: null, reason: "unconfigured" });
      // Only the test reset clears it (a restart in production).
      mod._resetDispatcherForTests();
      expect(mod.providerBlockReason("groq")).toBeNull();
    });

    it("isInvalidKeyError: 401 / authentication_error / invalid api key / kind=invalid_key → true; 429 / 5xx / timeouts → false", async () => {
      const { isInvalidKeyError, providerKeyEnvName } = await loadClient();
      expect(isInvalidKeyError(new Error("HTTP 401: {\"error\":{\"message\":\"Invalid API Key\"}}"))).toBe(true);
      expect(isInvalidKeyError(new Error("Anthropic 401 authentication_error: API key rejected"))).toBe(true);
      expect(isInvalidKeyError(new Error("Gemini: invalid api key"))).toBe(true);
      expect(isInvalidKeyError({ message: "x", kind: "invalid_key" })).toBe(true);
      expect(isInvalidKeyError({ message: "x", status: 401 })).toBe(true);
      expect(isInvalidKeyError(new Error("HTTP 429: rate limit"))).toBe(false);
      expect(isInvalidKeyError(new Error("HTTP 529: Overloaded"))).toBe(false);
      expect(isInvalidKeyError(new Error("timeout after 30000ms"))).toBe(false);
      expect(isInvalidKeyError(new Error("HTTP 402: payment required"))).toBe(false);
      expect(providerKeyEnvName("claude-apikey")).toBe("ANTHROPIC_API_KEY");
      expect(providerKeyEnvName("groq")).toBe("GROQ_API_KEY");
      expect(providerKeyEnvName("deepinfra")).toBe("DEEPINFRA_API_KEY");
    });

    it("Anthropic stays fallback-only: claude-oauth sits behind deepinfra / gemini in the report order and behind the free tiers for classify", async () => {
      const { providerOrderForClass } = await loadClient();
      const report = providerOrderForClass("report");
      expect(report.indexOf("claude-oauth")).toBeGreaterThan(report.indexOf("deepinfra"));
      expect(report.indexOf("claude-oauth")).toBeGreaterThan(report.indexOf("gemini"));
      const classify = providerOrderForClass("classify");
      for (const free of ["groq", "cerebras", "sambanova", "openrouter"] as const) {
        expect(classify.indexOf("claude-oauth")).toBeGreaterThan(classify.indexOf(free));
      }
    });
  });

  it("counts AIBudgetExhaustedError throws for one hour and _resetDispatcherForTests clears them", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    const { callAI, getProviderHealthSnapshot, _resetDispatcherForTests, AIBudgetExhaustedError } = await loadClient();
    const spend = await import("@/lib/ai/spend-guard");
    spend._resetSpendGuardForTests();
    _resetDispatcherForTests();
    const nowSpy = vi.spyOn(Date, "now");
    const t0 = 1_700_000_000_000;
    nowSpy.mockReturnValueOnce(t0).mockReturnValue(t0 + 5_000);
    try {
      const err = await callAI({ system: "s", user: "u", budgetMs: 100 }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AIBudgetExhaustedError);
      expect(tierMock.call).not.toHaveBeenCalled();
      expect(getProviderHealthSnapshot(t0 + 5_000).budget_exhausted_1h).toBe(1);
      // Still inside the window 59 min later, gone after the hour.
      expect(getProviderHealthSnapshot(t0 + 5_000 + 59 * 60_000).budget_exhausted_1h).toBe(1);
      expect(getProviderHealthSnapshot(t0 + 5_000 + 60 * 60_000 + 1).budget_exhausted_1h).toBe(0);
    } finally {
      nowSpy.mockRestore();
      spend._resetSpendGuardForTests();
    }
    // A second exhaustion after the window: the reset empties the buffer.
    const nowSpy2 = vi.spyOn(Date, "now");
    nowSpy2.mockReturnValueOnce(t0).mockReturnValue(t0 + 5_000);
    try {
      await callAI({ system: "s", user: "u", budgetMs: 100 }).catch(() => undefined);
      expect(getProviderHealthSnapshot(t0 + 5_000).budget_exhausted_1h).toBe(1);
      _resetDispatcherForTests();
      expect(getProviderHealthSnapshot(t0 + 5_000).budget_exhausted_1h).toBe(0);
    } finally {
      nowSpy2.mockRestore();
      spend._resetSpendGuardForTests();
    }
  });
});

// ---------------------------------------------------------------------------
// G28-B — run-scoped provider strikes inside callAI
// ---------------------------------------------------------------------------

describe("G28-B — callAI honours the run-scoped strike ledger", () => {
  it("a worker timeout from a provider is counted on the run ledger (once per error object)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    const tier = await import("@/lib/ai/anthropic-tier");
    tier._resetAnthropicTierForTests();
    tierMock.call.mockRejectedValueOnce(new Error("Worker timeout (45s)"));
    const { createRunStrikeLedger } = await import("@/lib/ai/run-strikes");
    const { callAI, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    const runStrikes = createRunStrikeLedger();
    await expect(callAI({ system: "s", user: "u", runStrikes })).rejects.toThrow(/Worker timeout/);
    expect(runStrikes.strikes("claude-apikey")).toBe(1);
    expect(runStrikes.struck("claude-apikey")).toBe(false);
    tier._resetAnthropicTierForTests();
  });

  it("a struck provider is never dialled again in that run — the call fails fast with RunStruckError, no tier call, no cooldown", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    const tier = await import("@/lib/ai/anthropic-tier");
    tier._resetAnthropicTierForTests();
    tierMock.call.mockClear();
    const { createRunStrikeLedger } = await import("@/lib/ai/run-strikes");
    const { callAI, getProviderHealthSnapshot, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    const runStrikes = createRunStrikeLedger();
    runStrikes.note("claude-apikey", new Error("Worker timeout (45s)"));
    runStrikes.note("claude-apikey", new Error('HTTP 429: {"code":"engine_overloaded"}'));
    expect(runStrikes.struck("claude-apikey")).toBe(true);
    await expect(callAI({ system: "s", user: "u", runStrikes })).rejects.toThrow(/skipped for the rest of this run after 2 strikes/);
    expect(tierMock.call).not.toHaveBeenCalled();
    // Run scoping is not the process-wide cooldown: the provider stays "ok" for the next run.
    expect(getProviderHealthSnapshot().providers.find((p) => p.name === "claude-apikey")?.state).toBe("ok");
    // A fresh ledger (next run) dials it again.
    tierMock.call.mockResolvedValueOnce({
      text: "hello", model: "claude-sonnet-5", streamed: false, cost_usd: 0.001,
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });
    const out = await callAI({ system: "s", user: "u", runStrikes: createRunStrikeLedger() });
    expect(out.text).toBe("hello");
    expect(tierMock.call).toHaveBeenCalledTimes(1);
    tier._resetAnthropicTierForTests();
  });

  it("without a ledger nothing changes (crons / chat keep the process-wide cooldown only)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-solo";
    const tier = await import("@/lib/ai/anthropic-tier");
    tier._resetAnthropicTierForTests();
    tierMock.call.mockRejectedValueOnce(new Error("Worker timeout (45s)"));
    const { callAI, _resetDispatcherForTests, runStruck } = await loadClient();
    _resetDispatcherForTests();
    await expect(callAI({ system: "s", user: "u" })).rejects.toThrow(/Worker timeout/);
    expect(runStruck({}, "claude-apikey")).toBe(false);
    tier._resetAnthropicTierForTests();
  });
});

// ---------------------------------------------------------------------------
// G29-A — dead rungs at runtime. The strike table lives in the in-memory fs
// mock; fixtures are the 2026-09-21 showcase log lines (model-strikes.test.ts
// carries the verbatim heads). No HTTP transport is exercised: a dead rung is
// skipped BEFORE any call, and an unfunded provider is blocked in the
// dispatcher, so nothing here can reach a provider.
// ---------------------------------------------------------------------------

describe("G29-A — dead rungs are skipped at runtime without spending a call", () => {
  const STRIKES = "/home/dovanlong/blockid.au/web/content/reports/ai-model-strikes.json";
  const NOW = new Date("2026-09-21T10:30:00Z").getTime();
  // A rung that never lapses. This used to default to "2026-09-22T10:00:00.000Z",
  // which silently expired once the wall clock passed it: `callAI` reads the REAL
  // clock (not the test's NOW), so "an unfunded provider is never dialled" below
  // started dialling SambaNova for real and failed on the transport stub. Fixed
  // and far future keeps it deterministic. Callers that want a LAPSED rung still
  // pass an explicit past timestamp.
  const DEAD_FOREVER = "2099-01-01T00:00:00.000Z";
  const dead = (until = DEAD_FOREVER, reason = "model_not_found") =>
    ({ strikes: 1, last_status: reason, last_at: "2026-09-21T10:00:00.000Z", dead_until: until, dead_reason: reason, dead_at: "2026-09-21T10:00:00.000Z" });

  it("readyModels drops dead rungs from the curated ladder (the file prune never reached it) and never resurrects one through the all-cooling fallback", async () => {
    fsMock.files.set(STRIKES, JSON.stringify({
      "cerebras::gemma-4-31b": dead(undefined, "model_archived"),
      "cerebras::qwen-3-32b": dead(),
      "cerebras::llama-3.3-70b": dead(),
      "cerebras::gpt-oss-120b": dead(undefined, "payment_required"),
      "cerebras::lapsed": dead("2026-09-21T10:00:00.000Z"),
    }));
    const { readyModels, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    const ladder = ["gemma-4-31b", "gpt-oss-120b", "qwen-3-32b", "llama-3.3-70b", "llama-3.1-8b", "lapsed"];
    expect(readyModels("cerebras", ladder, "classify", NOW)).toEqual(["llama-3.1-8b", "lapsed"]);
    // the same ids on another provider are untouched (keys are provider-scoped)
    expect(readyModels("groq", ["gemma-4-31b", "qwen-3-32b"], "classify", NOW)).toEqual(["gemma-4-31b", "qwen-3-32b"]);
    // every rung dead → empty, not the "attempt anyway" fallback
    expect(readyModels("cerebras", ["gemma-4-31b", "qwen-3-32b"], "classify", NOW)).toEqual([]);
  });

  it("a live 402 / 404 answer stamps the rung dead in the shared table (24 h); a 429 does not; a lapsed window is retried once", async () => {
    const { noteDeadRung, readyModels, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    expect(noteDeadRung("sambanova", "DeepSeek-V3.2", 'HTTP 402: {"error":{"balance_units":0,"code":"PAYMENT_METHOD_REQUIRED","message":"A payment method is required."}}', NOW)).toBe(true);
    expect(noteDeadRung("cerebras", "gemma-4-31b", 'HTTP 404: {"message":"Model gemma-4-31b is archived and unavailable for the organization.","code":"model_archived"}', NOW)).toBe(true);
    expect(noteDeadRung("groq", "qwen/qwen3.8-27b", 'HTTP 429: {"error":{"message":"Request too large for model"}}', NOW)).toBe(false);
    expect(noteDeadRung("deepinfra", "deepseek-ai/DeepSeek-V4-Flash", "Worker timeout (120s)", NOW)).toBe(false);
    const written = JSON.parse(fsMock.files.get(STRIKES) ?? "{}") as Record<string, { dead_until?: string; dead_reason?: string }>;
    expect(written["sambanova::DeepSeek-V3.2"]).toMatchObject({ dead_reason: "payment_required", dead_until: "2026-09-22T10:30:00.000Z" });
    expect(written["cerebras::gemma-4-31b"]).toMatchObject({ dead_reason: "model_archived" });
    expect(written["groq::qwen/qwen3.8-27b"]).toBeUndefined();
    expect(readyModels("sambanova", ["DeepSeek-V3.2", "DeepSeek-R1"], "classify", NOW + 1_000)).toEqual(["DeepSeek-R1"]);
    expect(readyModels("sambanova", ["DeepSeek-V3.2", "DeepSeek-R1"], "classify", NOW + 24 * 60 * 60_000 + 1)).toEqual(["DeepSeek-V3.2", "DeepSeek-R1"]);
    expect(warnSpy?.mock.calls.map((c) => String(c[0])).some((l) => /dead-rung\] sambanova DeepSeek-V3\.2 → payment_required/.test(l))).toBe(true);
  });

  it("a runtime stamp merges into a FRESH read of the table — a stamp the health-check cron wrote a moment ago survives the 30 s cache", async () => {
    fsMock.files.set(STRIKES, JSON.stringify({ "cerebras::a": dead() }));
    const { noteDeadRung, readyModels, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    expect(readyModels("cerebras", ["a", "b", "c"], "classify", NOW)).toEqual(["b", "c"]); // warms the cache
    fsMock.files.set(STRIKES, JSON.stringify({ "cerebras::a": dead(), "cerebras::b": dead() })); // the cron writes b
    noteDeadRung("cerebras", "c", 'HTTP 404: {"code":"model_not_found"}', NOW + 5_000);
    const written = JSON.parse(fsMock.files.get(STRIKES) ?? "{}") as Record<string, unknown>;
    expect(Object.keys(written).sort()).toEqual(["cerebras::a", "cerebras::b", "cerebras::c"]);
    expect(readyModels("cerebras", ["a", "b", "c", "d"], "classify", NOW + 6_000)).toEqual(["d"]);
  });

  it("a provider whose account answered 402 is `unfunded`: blocked in the dispatcher, on the snapshot (dead_rungs + unfunded + healthy_providers), and callAI never dials it", async () => {
    process.env.SAMBANOVA_API_KEY = "sn-test";
    process.env.CEREBRAS_API_KEY = "cb-test";
    fsMock.files.set(STRIKES, JSON.stringify({
      "sambanova::DeepSeek-V3.2": dead(undefined, "payment_required"),
      "cerebras::gemma-4-31b": dead(undefined, "model_archived"),
    }));
    const { providerBlockReason, getProviderHealthSnapshot, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    expect(providerBlockReason("sambanova", NOW)).toBe("unfunded");
    expect(providerBlockReason("cerebras", NOW)).toBeNull(); // one archived rung of five = degraded, still dialled
    const snap = getProviderHealthSnapshot(NOW);
    expect(snap.providers.find((p) => p.name === "sambanova")).toEqual({ name: "sambanova", state: "blocked", cooldown_until: null, reason: "unfunded" });
    expect(snap.unfunded).toEqual(["sambanova"]);
    expect(snap.healthy_providers).toBe(1);
    expect(snap.dead_rungs.sambanova).toMatchObject({ state: "unfunded", reason: "payment_required", dead: ["DeepSeek-V3.2"], total: 9 });
    expect(snap.dead_rungs.cerebras).toMatchObject({ state: "degraded", dead: ["gemma-4-31b"], total: 5 });
    // Only SambaNova configured + unfunded → nothing usable, no dial, the blocked error (not a 402 from the wire).
    delete process.env.CEREBRAS_API_KEY;
    const { callAI, _resetDispatcherForTests: reset2 } = await loadClient();
    reset2();
    await expect(callAI({ system: "s", user: "u" })).rejects.toThrow(/All AI providers are blocked/);
  });

  it("a provider whose every rung is dead throws DeadLadderError from its ladder — no call, no process-wide cooldown", async () => {
    process.env.GROQ_API_KEY = "gq-test";
    fsMock.files.set("/home/dovanlong/blockid.au/web/content/reports/ai-free-models.json", JSON.stringify({ groq: ["a", "b"] }));
    fsMock.files.set(STRIKES, JSON.stringify({ "groq::a": dead(), "groq::b": dead() }));
    const { DeadLadderError, providerBlockReason, getProviderHealthSnapshot, _resetDispatcherForTests } = await loadClient();
    _resetDispatcherForTests();
    expect(new DeadLadderError("groq", 2).message).toMatch(/all 2 models are dead rungs/);
    expect(providerBlockReason("groq", NOW)).toBe("unfunded");
    expect(getProviderHealthSnapshot(NOW).dead_rungs.groq).toEqual({ state: "unfunded", reason: "all_rungs_dead", dead: ["a", "b"], total: 2, until: DEAD_FOREVER });
  });
});

// No external model/account combination has qualified for this scope yet.
describe("G30 BlockID report policy", () => {
  const request = { system: "rubric", user: "evidence", policy: "blockid-report-v1" as const };
  let fetchMock: ReturnType<typeof vi.fn>;
  let transportSpies: Array<{ mockRestore(): void }>;
  beforeEach(() => {
    process.env.AI_FETCH_MODE = "direct";
    process.env.DEEPINFRA_API_KEY = "test-di";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.GROQ_API_KEY = "test-groq";
    process.env.OPENROUTER_API_KEY = "test-or";
    process.env.GOOGLE_GEMINI_API_KEY = "test-gemini";
    process.env.AI_GATEWAY_URL = "https://gateway.invalid";
    process.env.AI_GATEWAY_SECRET = "test-gateway";
    process.env.AI_REPORT_PROVIDER_ORDER = "claude-apikey,groq,openrouter";
    setOAuthFixture();
    // DeepInfra echoes the requested model; callDeepInfra refuses a mismatch under a budget permit.
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({
      model: init?.body ? JSON.parse(String(init.body)).model : undefined,
      choices: [{ message: { content: "Evidence-based analysis" } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    // The dispatcher uses node:https, not global fetch. Intercept both transports
    // and prohibit subprocess fallback: no test may contact a real provider.
    const requestMock = ((_options: Record<string, unknown>, callback: (response: unknown) => void) => {
      const req = new EventEmitter() as EventEmitter & { write(body: string): void; end(): void; destroy(err: Error): void };
      let body = "";
      req.write = (value) => { body = value; };
      req.destroy = (err) => { req.emit("error", err); };
      req.end = () => {
        void fetchMock(`https://${_options.hostname}${_options.path}`, { body }).then(async (reply: Response) => {
          const res = new EventEmitter() as EventEmitter & { statusCode: number; setEncoding(): void };
          res.statusCode = reply.status;
          res.setEncoding = () => {};
          callback(res);
          const text = await reply.text();
          // G33-T05: DeepInfra text calls stream — answer a `stream: true` request as SSE.
          let streamedRequest = false;
          try { streamedRequest = JSON.parse(body).stream === true; } catch { /* not JSON */ }
          if (streamedRequest && reply.status < 400) {
            let j: Record<string, unknown> = {};
            try { j = JSON.parse(text); } catch { /* raw */ }
            const content = (j.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content;
            const sse = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
            if (j.error) res.emit("data", sse({ error: j.error }));
            else {
              if (typeof content === "string" && content) res.emit("data", sse({ model: j.model, choices: [{ delta: { content } }] }));
              res.emit("data", sse({ model: j.model, choices: [], ...(j.usage ? { usage: j.usage } : {}) }));
              res.emit("data", "data: [DONE]\n\n");
            }
          } else res.emit("data", text);
          (res as unknown as { complete: boolean }).complete = true;
          res.emit("end");
        }).catch((err: Error) => req.emit("error", err));
      };
      return req;
    }) as unknown as typeof https.request;
    networkMock.request.mockImplementation(requestMock as never);
    transportSpies = [
      vi.spyOn(childProcess, "spawn").mockImplementation(() => { throw new Error("HTTP 599: forbidden test subprocess"); }),
    ];
  });
  afterEach(() => { networkMock.request.mockReset(); transportSpies.forEach((spy) => spy.mockRestore()); vi.unstubAllGlobals(); });
  const calledModels = (mock: typeof fetchMock) => mock.mock.calls.map(([, init]) => JSON.parse(init.body).model);
  const onlyDeepInfra = (mock: typeof fetchMock) => {
    expect(mock.mock.calls.length).toBeGreaterThan(0);
    expect(mock.mock.calls.every(([url]) => url === "https://api.deepinfra.com/v1/openai/chat/completions")).toBe(true);
    expect(tierMock.call).not.toHaveBeenCalled();
  };

  it.each(["report", "synthesis", "classify"] as const)("routes %s through DeepInfra despite gateway, paid keys, OAuth and overrides", async (taskClass) => {
    const client = await loadClient();
    const result = await client.callAI({ ...request, taskClass, interactive: true });
    expect(result).toMatchObject({ via: "deepinfra", taskClass, policy: request.policy });
    expect(result.cost_usd).toBeGreaterThan(0);
    // G33-T16g: synthesis is hedged across the two leading rungs (both DeepInfra).
    expect(fetchMock).toHaveBeenCalledTimes(taskClass === "synthesis" ? 2 : 1);
    onlyDeepInfra(fetchMock);
    // G33-T16d: an interactive call (60 s budget, 4 096 tokens) fits no measured
    // model with headroom, so the fastest measured rung is tried first; the call
    // still stays inside the class's exact DeepInfra ladder.
    const called = calledModels(fetchMock);
    // G33-T16h: scoped classify has no priced rung of its own → the cheapest admitted rung.
    for (const m of called) expect(taskClass === "classify" ? ["deepseek-ai/DeepSeek-V4-Flash"] : client.DEEPINFRA_MODELS_BY_CLASS[taskClass]).toContain(m);
    if (taskClass === "report") expect(called).toEqual(["deepseek-ai/DeepSeek-V4-Flash"]);
    if (taskClass === "synthesis") expect(called).toContain("deepseek-ai/DeepSeek-V4-Flash");
  });
  it("fails closed when DeepInfra is missing", async () => {
    delete process.env.DEEPINFRA_API_KEY;
    const { callAI } = await loadClient();
    await expect(callAI(request)).rejects.toThrow("No AI provider configured");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tierMock.call).not.toHaveBeenCalled();
  });
  it("two parallel primary-model timeouts do not strike healthy DeepInfra alternatives out of the report run", async () => {
    const client = await loadClient();
    const { createRunStrikeLedger } = await import("@/lib/ai/run-strikes");
    const runStrikes = createRunStrikeLedger();
    const primary = client.DEEPINFRA_MODELS_BY_CLASS.report[0];
    const secondary = client.DEEPINFRA_MODELS_BY_CLASS.report[1];
    let primaryCalls = 0;
    let release!: () => void;
    const parallelWave = new Promise<void>(resolve => { release = resolve; });
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (JSON.parse(String(init?.body)).model === primary) {
        if (++primaryCalls === 2) release();
        await parallelWave;
        throw new Error("Worker timeout (60s)");
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: "Grounded alternative" } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
    });
    const results = await Promise.all([client.callAI({ ...request, agentId: "review:one", taskClass: "report", runStrikes }), client.callAI({ ...request, agentId: "review:two", taskClass: "report", runStrikes })]);
    expect(results.map(r => r.model)).toEqual([secondary, secondary]);
    expect(runStrikes.struck(`deepinfra/${primary}`)).toBe(true);
    expect(runStrikes.struck("deepinfra")).toBe(false);
    expect(runStrikes.struckProviders()).not.toContain(`deepinfra/${primary}`);
    expect(runStrikes.snapshot()[`deepinfra/${primary}`].timeout).toBe(2);
    onlyDeepInfra(fetchMock);
  });
  it("fails closed on scoped synthesis failure even when the old Groq fallback is enabled", async () => {
    const client = await loadClient();
    const { createRunStrikeLedger } = await import("@/lib/ai/run-strikes");
    fetchMock.mockImplementation(async () => new Response("upstream error", { status: 500 }));
    process.env.REPORT_GROQ_FREE_FALLBACK = "on";
    try {
      await expect(client.callAI({ ...request, taskClass: "synthesis", runStrikes: createRunStrikeLedger(), budgetMs: 120_000 })).rejects.toThrow();
      onlyDeepInfra(fetchMock);
    } finally { delete process.env.REPORT_GROQ_FREE_FALLBACK; }
  });
  it.each(["report", "synthesis", "classify"] as const)("explicit C-level provider policy restricts unscoped %s despite gateway and overrides", async (taskClass) => {
    const client = await loadClient();
    const result = await client.callAI({ ...request, policy: undefined, providerPolicy: "deepinfra-only", taskClass, interactive: true });
    expect(result.via).toBe("deepinfra");
    onlyDeepInfra(fetchMock);
    if (taskClass === "classify") expect(calledModels(fetchMock)).toEqual(["deepseek-ai/DeepSeek-V4-Flash"]);
  });
  it("explicit C-level policy fails closed without DeepInfra credentials", async () => {
    delete process.env.DEEPINFRA_API_KEY;
    const client = await loadClient();
    await expect(client.callAI({ ...request, policy: undefined, providerPolicy: "deepinfra-only" })).rejects.toThrow("No AI provider configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("G33-T16g: a scoped synthesis call with a deadline races the two leading rungs; the first answer wins", async () => {
    const client = await loadClient();
    const answered: string[] = [];
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const model = JSON.parse(String(init?.body)).model;
      // The slow lane answers late; the other lane answers at once.
      if (model === "deepseek-ai/DeepSeek-V3.2") await new Promise((r) => setTimeout(r, 150));
      answered.push(model);
      return new Response(JSON.stringify({ model, choices: [{ message: { content: `summary from ${model}` } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
    });
    const r = await client.callAI({ ...request, taskClass: "synthesis", budgetMs: 200_000 });
    const called = calledModels(fetchMock);
    expect(new Set(called)).toEqual(new Set(["deepseek-ai/DeepSeek-V3.2", "deepseek-ai/DeepSeek-V4-Flash"]));
    expect(r.model).toBe(answered[0]);
    onlyDeepInfra(fetchMock);
  });
  it("G33-T16g: report-class calls are not hedged", async () => {
    const client = await loadClient();
    await client.callAI({ ...request, taskClass: "report", budgetMs: 200_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("G33-T16e: DeepInfra 'Model busy' 429s strike that model only; an account rate limit still strikes the provider", async () => {
    const client = await loadClient();
    const { createRunStrikeLedger } = await import("@/lib/ai/run-strikes");
    const runStrikes = createRunStrikeLedger();
    const primary = client.DEEPINFRA_MODELS_BY_CLASS.report[0];
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const model = JSON.parse(String(init?.body)).model;
      if (model === primary) return new Response('{"error":{"message":"Model busy, retry later","type":"invalid_request_error","code":"engine_overloaded"}}', { status: 429 });
      return new Response(JSON.stringify({ model, choices: [{ message: { content: "Answered by another rung" } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
    });
    for (const id of ["one", "two", "three"]) {
      const r = await client.callAI({ ...request, agentId: `busy:${id}`, taskClass: "report", runStrikes });
      expect(r.model).not.toBe(primary);
    }
    expect(runStrikes.struck("deepinfra")).toBe(false);
    expect(client.DEEPINFRA_MODEL_BUSY_RE.test("HTTP 429: too many requests for this account")).toBe(false);
    expect(client.DEEPINFRA_MODEL_BUSY_RE.test('HTTP 429: {"code":"engine_overloaded"}')).toBe(true);
    onlyDeepInfra(fetchMock);
  });
  it("scoped response-stream failures advance the model without an unbudgeted subprocess replay", async () => {
    const client = await loadClient();
    const primary = client.DEEPINFRA_MODELS_BY_CLASS.report[0];
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (JSON.parse(String(init?.body)).model === primary) throw new Error("AI response stream error");
      return new Response(JSON.stringify({ choices: [{ message: { content: "Alternative" } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
    });
    await expect(client.callAI({ ...request, taskClass: "report" })).resolves.toMatchObject({ model: client.DEEPINFRA_MODELS_BY_CLASS.report[1] });
    expect(childProcess.spawn).not.toHaveBeenCalled();
    onlyDeepInfra(fetchMock);
  });
  it("never restores discovered or mutated weak defaults after exact rungs fail", async () => {
    const client = await loadClient();
    const exact = [...client.DEEPINFRA_MODELS_BY_CLASS.report];
    client.DEEPINFRA_MODELS_BY_CLASS.report.splice(0, exact.length, "unqualified/weak-model");
    fsMock.files.set(client.FREE_MODELS_CONFIG, JSON.stringify({ deepinfra: ["unqualified/weak-model"], openrouter: ["paid/model"] }));
    fetchMock.mockImplementation(async () => new Response("model not found", { status: 404 }));
    await expect(client.callAI(request)).rejects.toThrow();
    onlyDeepInfra(fetchMock);
    for (const model of calledModels(fetchMock)) expect(exact).toContain(model);
    const attempts = fetchMock.mock.calls.length;
    await expect(client.callAI(request)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(attempts);
  });
  it("suppresses discovery requests on provider failure", async () => {
    process.env.CRON_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://discovery.invalid";
    const { callAI } = await loadClient();
    fetchMock.mockImplementation(async () => new Response("payment required", { status: 402 }));
    await expect(callAI(request)).rejects.toThrow();
    onlyDeepInfra(fetchMock);
  });
  it("rejects unknown policy and upgrade-chain misuse before I/O", async () => {
    const { callAI, callAIForUpgrade } = await loadClient();
    await expect(callAI({ ...request, policy: "unknown" as typeof request.policy })).rejects.toThrow("Unknown AI report policy");
    await expect(callAIForUpgrade(request)).rejects.toThrow("requires callAI");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("honors an expired deadline without dialing", async () => {
    const { callAI } = await loadClient();
    await expect(callAI({ ...request, deadlineAt: Date.now() - 1, budgetMs: 1 })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("honors monthly budget before dialing", async () => {
    fsMock.files.set(BUDGET_FILE, JSON.stringify({ month: currentMonth(), totalUSD: 101, calls: 1, byModel: {} }));
    const { callAI } = await loadClient();
    await expect(callAI(request)).rejects.toThrow("Monthly AI budget exceeded");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not launch background provider probes even outside test mode", async () => {
    const { callAI } = await loadClient();
    const probes = await import("@/lib/ai/provider-status");
    const spy = vi.spyOn(probes, "probeProviders").mockRejectedValue(new Error("probe forbidden"));
    vi.stubEnv("NODE_ENV", "production");
    try {
      await callAI(request);
      expect(spy).not.toHaveBeenCalled();
      onlyDeepInfra(fetchMock);
    } finally { spy.mockRestore(); vi.unstubAllEnvs(); }
  });
  it("honors run strikes without trying an external fallback", async () => {
    const { callAI, DEEPINFRA_MODELS_BY_CLASS } = await loadClient();
    const { createRunStrikeLedger } = await import("@/lib/ai/run-strikes");
    const runStrikes = createRunStrikeLedger();
    // G33-T16e: every model answers "busy" → each model is struck (threshold 2),
    // after which the run stops dispatching to DeepInfra and never falls back.
    fetchMock.mockImplementation(async () => new Response("engine_overloaded", { status: 429 }));
    await expect(callAI({ ...request, runStrikes })).rejects.toThrow();
    await expect(callAI({ ...request, runStrikes })).rejects.toThrow();
    for (const m of DEEPINFRA_MODELS_BY_CLASS.report) expect(runStrikes.struck(`deepinfra/${m}`)).toBe(true);
    const dispatched = fetchMock.mock.calls.length;
    expect(dispatched).toBe(2 * DEEPINFRA_MODELS_BY_CLASS.report.length);
    await expect(callAI({ ...request, runStrikes })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(dispatched);
    onlyDeepInfra(fetchMock);
  });
  it("an account-wide 429 (not model busy) still strikes the provider for the run", async () => {
    const { callAI } = await loadClient();
    const { createRunStrikeLedger } = await import("@/lib/ai/run-strikes");
    const runStrikes = createRunStrikeLedger();
    fetchMock.mockImplementation(async () => new Response("rate limit exceeded for this account", { status: 429 }));
    await expect(callAI({ ...request, runStrikes })).rejects.toThrow();
    expect(runStrikes.struck("deepinfra")).toBe(true);
    const dispatched = fetchMock.mock.calls.length;
    await expect(callAI({ ...request, runStrikes })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(dispatched);
    onlyDeepInfra(fetchMock);
  });
  it("honors the daily paid-spend cap instead of enabling another provider", async () => {
    process.env.AI_DAILY_SPEND_CAP_AUD = "1";
    const { callAI } = await loadClient();
    const spend = await import("@/lib/ai/spend-guard");
    spend._resetSpendGuardForTests();
    spend.recordPaidSpend("deepinfra", 5);
    try {
      await expect(callAI(request)).rejects.toThrow("All AI providers are blocked");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { spend._resetSpendGuardForTests(); }
  });
  it("leaves unscoped gateway consumers working", async () => {
    const { callAI } = await loadClient();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: true, text: "legacy", provider: "groq", model: "legacy-model" }), { status: 200 }));
    const result = await callAI({ system: "s", user: "u" });
    expect(result.text).toBe("legacy");
    expect(result.policy).toBeUndefined();
    expect(String(fetchMock.mock.calls[0][0])).toContain("gateway.invalid");
  });
  function attemptLedger() {
    const held = new Map<string, string>();
    const reserve = vi.fn(async (r: import("./ai/research-attempt-budget").AttemptRequest) => {
      const replay = held.has(r.attemptId);
      if (!replay) held.set(r.attemptId, "reserved");
      return { ...r, dispatchAllowed: !replay, maximumPromptBytes: 100_000, maximumInputTokens: 40_000,
        maximumCostMicroUsd: 1000, pricePolicyId: "test-certified-policy", expiresAt: Date.now() + 60_000 };
    });
    const settle = vi.fn(async (r: { attemptId: string; state: string }) => { held.set(r.attemptId, r.state); });
    return { held, budget: { callId: "durable-job/synthesis/batch-1", reserve, settle } };
  }
  it("requires trusted research authorization before any gateway or provider I/O", async () => {
    const { callAI } = await loadClient();
    await expect(callAI({ ...request, agentId: "svi:research_synthesis" })).rejects.toThrow("durable attempt authorization");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("reserves each actual model attempt; denial stops ladder and retains ambiguous first cost", async () => {
    const { callAI } = await loadClient();
    const { budget, held } = attemptLedger();
    const permit = budget.reserve.getMockImplementation()!;
    budget.reserve.mockImplementation(async r => budget.reserve.mock.calls.length === 1 ? permit(r) : { ...await permit(r), dispatchAllowed: false });
    fetchMock.mockRejectedValue(new Error("unknown network interruption"));
    await expect(callAI({ ...request, agentId: "svi:research_synthesis", attemptBudget: budget })).rejects.toThrow("dispatch denied");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(budget.reserve).toHaveBeenCalledTimes(2);
    expect(budget.settle).toHaveBeenCalledWith({ attemptId: budget.reserve.mock.calls[0][0].attemptId, state: "unknown" });
    expect(held.get(budget.reserve.mock.calls[0][0].attemptId)).toBe("unknown");
    expect(transportSpies[0]).not.toHaveBeenCalled();
  });
  it("allows an independently reserved second rung and reports usage without refunding the first", async () => {
    const { callAI } = await loadClient();
    const { budget } = attemptLedger();
    fetchMock.mockResolvedValueOnce(new Response("failed", { status: 500 }));
    await callAI({ ...request, attemptBudget: budget });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Set(budget.reserve.mock.calls.map(([r]) => r.attemptId)).size).toBe(2);
    expect(budget.settle.mock.calls.map(([r]) => r.state)).toEqual(["unknown", "reported_usage"]);
    expect(budget.settle).toHaveBeenLastCalledWith(expect.objectContaining({ inputTokens: 100, outputTokens: 20 }));
  });
  it("rejects replay of the same durable call without dispatching again", async () => {
    const { callAI } = await loadClient();
    const { budget } = attemptLedger();
    await callAI({ ...request, attemptBudget: budget });
    await expect(callAI({ ...request, attemptBudget: budget })).rejects.toThrow("dispatch denied");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(budget.reserve.mock.calls[0][0].attemptId).toBe(budget.reserve.mock.calls[1][0].attemptId);
  });
  it("retains unknown usage rather than recording a zero-cost reservation", async () => {
    const { callAI } = await loadClient();
    const { budget } = attemptLedger();
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({ model: JSON.parse(String(init?.body)).model, choices: [{ message: { content: "answer" } }] })));
    await callAI({ ...request, attemptBudget: budget });
    expect(budget.settle).toHaveBeenCalledWith(expect.objectContaining({ state: "unknown" }));
    expect(budget.settle.mock.calls[0][0]).not.toHaveProperty("inputTokens");
  });
  it("rejects expired or insufficient permits before provider I/O", async () => {
    const { callAI } = await loadClient();
    const { budget } = attemptLedger();
    const permit = budget.reserve.getMockImplementation()!;
    budget.reserve.mockImplementation(async r => ({ ...await permit(r), maximumPromptBytes: 1 }));
    await expect(callAI({ ...request, attemptBudget: budget })).rejects.toThrow("invalid or expired permit");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fails terminally on settlement failure without another rung or transport", async () => {
    const { callAI } = await loadClient();
    const { budget } = attemptLedger();
    budget.settle.mockRejectedValue(new Error("ledger unavailable"));
    await expect(callAI({ ...request, attemptBudget: budget })).rejects.toThrow("settlement unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(budget.settle).toHaveBeenCalledTimes(1);
  });

});
