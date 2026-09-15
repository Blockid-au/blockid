// Colocated vitest for the S31-A provider probes (provider-status.ts).
//
// Every probe runs against a fake fetch — nothing here leaves the box. Pins:
// the verdict ladder per HTTP status / body, OpenRouter's credit floor, the
// Anthropic headroom bridge, the 15-minute per-provider cache, that an
// unconfigured provider is listed but never dialled, that the status file
// and the /api/status summary never carry key material, and that a 401 from
// the Anthropic probe latches the hot-path skip.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => {
  const files = new Map<string, string>();
  return {
    files,
    readFileSync: (p: string) => {
      const v = files.get(p);
      if (v === undefined) throw Object.assign(new Error(`ENOENT ${p}`), { code: "ENOENT" });
      return v;
    },
    writeFileSync: (p: string, c: string) => { files.set(p, c); },
    renameSync: (a: string, b: string) => { const v = files.get(a); if (v !== undefined) { files.set(b, v); files.delete(a); } },
    mkdirSync: () => {},
    existsSync: (p: string) => files.has(p),
  };
});
vi.mock("fs", () => ({ default: fsMock, ...fsMock }));

import {
  PROBE_TTL_MS,
  PROVIDER_STATUS_FILE,
  _resetProviderStatusForTests,
  cachedProviderStatus,
  configuredProviders,
  probeProvider,
  probeProviders,
  readAiProvidersSummary,
} from "./provider-status";
import { _resetAnthropicTierForTests, getAnthropicHeadroom, isAnthropicKeyInvalid } from "./anthropic-tier";

type Reply = { status: number; body?: string; headers?: Record<string, string>; throwErr?: Error };
const replies = new Map<string, Reply>();
const calls: Array<{ url: string; init: RequestInit | undefined }> = [];

function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
  calls.push({ url, init });
  const r = [...replies.entries()].find(([k]) => url.startsWith(k))?.[1];
  if (!r) return Promise.reject(new Error(`no fixture for ${url}`));
  if (r.throwErr) return Promise.reject(r.throwErr);
  return Promise.resolve(new Response(r.body ?? "{}", { status: r.status, headers: r.headers ?? {} }));
}

const ENV_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_PROXY_API_KEY", "ANTHROPIC_PROXY_BASE_URL", "OPENROUTER_API_KEY", "GROQ_API_KEY", "CEREBRAS_API_KEY", "SAMBANOVA_API_KEY", "DEEPINFRA_API_KEY", "GOOGLE_GEMINI_API_KEY", "OLLAMA_HOST", "OLLAMA_ENABLED", "OPENROUTER_MIN_CREDIT_USD"];

beforeEach(() => {
  fsMock.files.clear();
  replies.clear();
  calls.length = 0;
  _resetProviderStatusForTests();
  _resetAnthropicTierForTests();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

function env(over: Record<string, string> = {}): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { HOME: "/nx-no-home" };
  for (const k of ENV_KEYS) delete e[k];
  return { ...e, ...over };
}

describe("configuredProviders", () => {
  it("lists only providers with a key (env), proxy needs both vars, OAuth needs the credentials file", () => {
    expect(Object.keys(configuredProviders(env()))).toEqual([]);
    expect(Object.keys(configuredProviders(env({ ANTHROPIC_API_KEY: "k", ANTHROPIC_PROXY_API_KEY: "p" })))).toEqual(["anthropic"]);
    expect(Object.keys(configuredProviders(env({ ANTHROPIC_PROXY_API_KEY: "p,q", ANTHROPIC_PROXY_BASE_URL: "https://x" })))).toEqual(["claude-proxy"]);
    fsMock.files.set("/nx-no-home/.claude/.credentials.json", JSON.stringify({ claudeAiOauth: { accessToken: "sk-ant-oat", expiresAt: Date.now() + 3600_000 } }));
    expect(Object.keys(configuredProviders(env({ OLLAMA_ENABLED: "true" })))).toEqual(["claude-oauth", "ollama"]);
  });
});

describe("probeProvider — verdict ladder", () => {
  it("anthropic: 200 → valid with rate-limit headroom; 401 → invalid_key and the hot-path latch; 429 → quota_exceeded; 5xx → unreachable", async () => {
    replies.set("https://api.anthropic.com/v1/messages", { status: 200, headers: { "anthropic-ratelimit-requests-remaining": "45", "anthropic-ratelimit-tokens-remaining": "38000" } });
    const ok = await probeProvider("anthropic", "sk-ant-x", { fetchImpl, env: env() });
    expect(ok.status).toBe("valid");
    expect(ok.headroom).toEqual({ rpm_remaining: 45, tpm_remaining: 38000, reset_at: null });
    expect(getAnthropicHeadroom()?.requests_remaining).toBe(45);
    // The probe body is a 1-token Haiku call with the key on x-api-key (never Bearer).
    const init = calls[0].init as RequestInit & { headers: Record<string, string> };
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "claude-haiku-4-5", max_tokens: 1 });
    expect(init.headers["x-api-key"]).toBe("sk-ant-x");

    replies.set("https://api.anthropic.com/v1/messages", { status: 401, body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) });
    const bad = await probeProvider("anthropic", "sk-ant-x", { fetchImpl, env: env() });
    expect(bad.status).toBe("invalid_key");
    expect(bad.detail).toBe("invalid x-api-key");
    expect(isAnthropicKeyInvalid()).toBe(true);

    replies.set("https://api.anthropic.com/v1/messages", { status: 429, body: "{}" });
    expect((await probeProvider("anthropic", "k", { fetchImpl, env: env() })).status).toBe("quota_exceeded");
    replies.set("https://api.anthropic.com/v1/messages", { status: 529, body: "{}" });
    expect((await probeProvider("anthropic", "k", { fetchImpl, env: env() })).status).toBe("unreachable");
  });

  it("openrouter: credits endpoint → valid with credits_remaining_usd, low_credit under the floor, invalid_key on 401", async () => {
    replies.set("https://openrouter.ai/api/v1/credits", { status: 200, body: JSON.stringify({ data: { total_credits: 30, total_usage: 28.45 } }) });
    const low = await probeProvider("openrouter", "or-key", { fetchImpl, env: env() });
    expect(low.status).toBe("low_credit");
    expect(low.headroom?.credits_remaining_usd).toBe(1.55);
    expect(low.detail).toMatch(/US\$1.55 < floor US\$2/);
    process.env.OPENROUTER_MIN_CREDIT_USD = "1";
    expect((await probeProvider("openrouter", "or-key", { fetchImpl, env: env() })).status).toBe("valid");
    delete process.env.OPENROUTER_MIN_CREDIT_USD;
    replies.set("https://openrouter.ai/api/v1/credits", { status: 401, body: JSON.stringify({ error: { message: "No auth credentials found" } }) });
    expect((await probeProvider("openrouter", "or-key", { fetchImpl, env: env() })).status).toBe("invalid_key");
  });

  it("groq: reads x-ratelimit-remaining-tokens (the 8k TPM ceiling) off a 1-token completion; 402 body → quota_exceeded", async () => {
    replies.set("https://api.groq.com/openai/v1/chat/completions", { status: 200, headers: { "x-ratelimit-remaining-requests": "999", "x-ratelimit-remaining-tokens": "7990", "x-ratelimit-reset-tokens": "1.2s" } });
    const g = await probeProvider("groq", "gsk", { fetchImpl, env: env() });
    expect(g.status).toBe("valid");
    expect(g.headroom).toEqual({ rpm_remaining: 999, tpm_remaining: 7990, reset_at: "1.2s" });
    replies.set("https://api.groq.com/openai/v1/chat/completions", { status: 402, body: JSON.stringify({ error: { message: "Payment required" } }) });
    expect((await probeProvider("groq", "gsk", { fetchImpl, env: env() })).status).toBe("quota_exceeded");
  });

  it("proxy: dead endpoint (401) → invalid_key; timeout / DNS → unreachable with a secret-free detail", async () => {
    replies.set("https://taphoaapi.example/v1/messages", { status: 401, body: JSON.stringify({ error: { message: "invalid api key" } }) });
    const p = await probeProvider("claude-proxy", "px-secret", { fetchImpl, env: env({ ANTHROPIC_PROXY_BASE_URL: "https://taphoaapi.example/v1" }) });
    expect(p.status).toBe("invalid_key");
    replies.set("https://taphoaapi.example/v1/messages", { status: 0, throwErr: Object.assign(new Error("getaddrinfo ENOTFOUND taphoaapi.example"), { name: "TypeError" }) });
    const u = await probeProvider("claude-proxy", "px-secret", { fetchImpl, env: env({ ANTHROPIC_PROXY_BASE_URL: "https://taphoaapi.example/v1" }) });
    expect(u.status).toBe("unreachable");
    expect(u.detail).toContain("ENOTFOUND");
    expect(JSON.stringify(u)).not.toContain("px-secret");
  });

  it("cerebras / sambanova / deepinfra use the models endpoint; ollama uses /api/tags", async () => {
    replies.set("https://api.cerebras.ai/v1/models", { status: 200 });
    replies.set("https://api.sambanova.ai/v1/models", { status: 403, body: "{}" });
    replies.set("https://api.deepinfra.com/v1/openai/models", { status: 503, body: "{}" });
    replies.set("http://localhost:11434/api/tags", { status: 200 });
    expect((await probeProvider("cerebras", "k", { fetchImpl, env: env() })).status).toBe("valid");
    expect((await probeProvider("sambanova", "k", { fetchImpl, env: env() })).status).toBe("invalid_key");
    expect((await probeProvider("deepinfra", "k", { fetchImpl, env: env() })).status).toBe("unreachable");
    expect((await probeProvider("ollama", "http://localhost:11434", { fetchImpl, env: env() })).status).toBe("valid");
  });

  it("gemini (S32-C) probes the models endpoint with the key in a header, never the URL; 400 API_KEY_INVALID → invalid_key", async () => {
    replies.set("https://generativelanguage.googleapis.com/v1beta/models", { status: 200, body: '{"models":[{"name":"models/gemini-2.5-flash"}]}' });
    const ok = await probeProvider("gemini", "AIza-gemini-secret", { fetchImpl, env: env() });
    expect(ok.status).toBe("valid");
    expect(ok.detail).toContain("quality-cost");
    const call = calls.find((c) => c.url.startsWith("https://generativelanguage.googleapis.com"));
    expect(call?.url).not.toContain("AIza-gemini-secret");
    expect((call?.init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIza-gemini-secret");
    expect(JSON.stringify(ok)).not.toContain("AIza-gemini-secret");

    replies.set("https://generativelanguage.googleapis.com/v1beta/models", { status: 400, body: '{"error":{"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}' });
    expect((await probeProvider("gemini", "bad", { fetchImpl, env: env() })).status).toBe("invalid_key");
    replies.set("https://generativelanguage.googleapis.com/v1beta/models", { status: 429, body: '{"error":{"status":"RESOURCE_EXHAUSTED"}}' });
    expect((await probeProvider("gemini", "k", { fetchImpl, env: env() })).status).toBe("quota_exceeded");
  });

  it("gemini is configured by GOOGLE_GEMINI_API_KEY and listed not_configured without it", async () => {
    expect(configuredProviders(env({ GOOGLE_GEMINI_API_KEY: "g" })).gemini).toBe("g");
    expect(configuredProviders(env()).gemini).toBeUndefined();
  });
});

describe("probeProviders — cache + file", () => {
  it("probes only configured providers, lists the rest as not_configured, writes the cache file without secrets", async () => {
    replies.set("https://api.anthropic.com/v1/messages", { status: 401, body: "{}" });
    replies.set("https://api.groq.com/openai/v1/chat/completions", { status: 200 });
    const out = await probeProviders({ fetchImpl, env: env({ ANTHROPIC_API_KEY: "sk-ant-verysecret", GROQ_API_KEY: "gsk-verysecret" }), now: () => 1_000_000 });
    expect(out.providers.anthropic?.status).toBe("invalid_key");
    expect(out.providers.groq?.status).toBe("valid");
    expect(out.providers.openrouter?.status).toBe("not_configured");
    expect(calls).toHaveLength(2);
    const raw = fsMock.files.get(PROVIDER_STATUS_FILE) ?? "";
    expect(raw).toContain('"invalid_key"');
    expect(raw).not.toContain("verysecret");
    expect(cachedProviderStatus("anthropic")?.status).toBe("invalid_key");
  });

  it("does not re-probe a provider whose verdict is younger than 15 min unless forced", async () => {
    replies.set("https://api.groq.com/openai/v1/chat/completions", { status: 200 });
    const e = env({ GROQ_API_KEY: "gsk" });
    await probeProviders({ fetchImpl, env: e, now: () => 1_000_000 });
    expect(calls).toHaveLength(1);
    await probeProviders({ fetchImpl, env: e, now: () => 1_000_000 + PROBE_TTL_MS - 1 });
    expect(calls).toHaveLength(1);
    await probeProviders({ fetchImpl, env: e, now: () => 1_000_000 + PROBE_TTL_MS + 1 });
    expect(calls).toHaveLength(2);
    await probeProviders({ fetchImpl, env: e, now: () => 1_000_000 + PROBE_TTL_MS + 2, force: true });
    expect(calls).toHaveLength(3);
  });
});

describe("readAiProvidersSummary — the /api/status payload", () => {
  it("returns verdicts + headroom only, counts usable providers, flags quality_tier_ready", async () => {
    fsMock.files.set("/repo/content/reports/ai-provider-status.json", JSON.stringify({
      updated_at: "2026-09-13T22:40:00.000Z",
      providers: {
        anthropic: { provider: "anthropic", status: "valid", checked_at: "2026-09-13T22:40:00.000Z", latency_ms: 300, headroom: { rpm_remaining: 50 } },
        openrouter: { provider: "openrouter", status: "low_credit", checked_at: "2026-09-13T22:40:00.000Z", latency_ms: 100, detail: "credits US$1.55 < floor US$2" },
        groq: { provider: "groq", status: "valid", checked_at: "2026-09-13T22:40:00.000Z", latency_ms: 90 },
        "claude-proxy": { provider: "claude-proxy", status: "invalid_key", checked_at: "2026-09-13T22:40:00.000Z", latency_ms: 200 },
      },
    }));
    const s = await readAiProvidersSummary("/repo");
    expect(s.usable).toBe(2);
    expect(s.quality_tier_ready).toBe(true);
    expect(s.providers.anthropic).toEqual({ status: "valid", checked_at: "2026-09-13T22:40:00.000Z", headroom: { rpm_remaining: 50 } });
    expect(s.providers.openrouter.detail).toMatch(/floor/);
    expect(Object.keys(s.providers.groq)).toEqual(["status", "checked_at"]);
    expect(JSON.stringify(s)).not.toMatch(/latency_ms|api_key|secret/);
  });

  it("is empty (no throw) when the file is missing", async () => {
    const s = await readAiProvidersSummary("/nowhere");
    expect(s.providers).toEqual({});
    expect(s.usable).toBe(0);
    expect(s.quality_tier_ready).toBe(false);
  });
});
