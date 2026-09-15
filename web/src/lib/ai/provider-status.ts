// S31-A — provider validity probes + the `ai_providers` signal on /api/status.
//
// One cheap call per CONFIGURED provider (a 1-token completion where that is
// the only way to read rate-limit headers, otherwise the provider's models /
// credits endpoint), at most once per provider per 15 minutes, cached in
// content/reports/ai-provider-status.json. Verdicts:
//
//   valid            key accepted; `headroom` carries what the provider told us
//   invalid_key      401/403 — the dispatcher must not dial this provider
//   quota_exceeded   402 / "payment required" / daily cap — free tier is spent
//   low_credit       OpenRouter credits below OPENROUTER_MIN_CREDIT_USD
//   unreachable      timeout / DNS / 5xx — provider down or proxy dead
//   not_configured   no key → never probed (listed so the status page shows
//                    what is missing)
//
// Nothing here logs or stores key material — only key length / first three
// characters ever reach a log line. Probes are run by the ai-health-check
// cron (every 30 min), lazily by ai-client on the first call after boot when
// the cache is stale, and on demand by scripts/ai/probe-providers.ts.

import * as fs from "fs";
import * as path from "path";
import { openRouterMinCreditUsd } from "./spend-guard";
import { parseRateLimitHeaders, markAnthropicKeyInvalid, noteAnthropicHeadroom } from "./anthropic-tier";

export type ProviderStatusKind = "valid" | "invalid_key" | "unreachable" | "quota_exceeded" | "low_credit" | "not_configured";

export type ProbeProvider =
  | "anthropic"
  | "claude-oauth"
  | "claude-proxy"
  | "openrouter"
  | "groq"
  | "cerebras"
  | "sambanova"
  | "deepinfra"
  | "gemini"
  | "ollama";

export const PROBE_PROVIDERS: ProbeProvider[] = [
  "anthropic", "claude-oauth", "claude-proxy", "openrouter", "groq", "cerebras", "sambanova", "deepinfra", "gemini", "ollama",
];

export interface ProviderHeadroom {
  rpm_remaining?: number | null;
  tpm_remaining?: number | null;
  reset_at?: string | null;
  credits_remaining_usd?: number | null;
}

export interface ProviderStatus {
  provider: ProbeProvider;
  status: ProviderStatusKind;
  checked_at: string;
  latency_ms: number;
  http_status?: number;
  headroom?: ProviderHeadroom;
  /** Short, secret-free explanation (error class / provider message head). */
  detail?: string;
}

export interface ProviderStatusFile {
  updated_at: string;
  providers: Partial<Record<ProbeProvider, ProviderStatus>>;
}

export const PROVIDER_STATUS_REL = path.join("content", "reports", "ai-provider-status.json");
export const PROVIDER_STATUS_FILE = path.join("/home/dovanlong/blockid.au/web", PROVIDER_STATUS_REL);
export const PROBE_TTL_MS = 15 * 60_000;
const PROBE_TIMEOUT_MS = 8_000;

// ── Config discovery (env only — DB keys are read by ai-client itself) ──

interface OAuthFile { claudeAiOauth?: { accessToken?: string; expiresAt?: number } }

function oauthToken(env: NodeJS.ProcessEnv): string | null {
  try {
    const home = env.HOME ?? "/root";
    const raw = fs.readFileSync(path.join(home, ".claude", ".credentials.json"), "utf-8");
    const o = (JSON.parse(raw) as OAuthFile).claudeAiOauth;
    if (!o?.accessToken) return null;
    if (o.expiresAt && Date.now() > o.expiresAt - 5 * 60_000) return null;
    return o.accessToken;
  } catch {
    return null;
  }
}

export function configuredProviders(env: NodeJS.ProcessEnv = process.env): Partial<Record<ProbeProvider, string>> {
  const out: Partial<Record<ProbeProvider, string>> = {};
  if (env.ANTHROPIC_API_KEY) out.anthropic = env.ANTHROPIC_API_KEY;
  const oat = oauthToken(env);
  if (oat) out["claude-oauth"] = oat;
  if (env.ANTHROPIC_PROXY_API_KEY && env.ANTHROPIC_PROXY_BASE_URL) out["claude-proxy"] = env.ANTHROPIC_PROXY_API_KEY.split(",")[0].trim();
  if (env.OPENROUTER_API_KEY) out.openrouter = env.OPENROUTER_API_KEY;
  if (env.GROQ_API_KEY) out.groq = env.GROQ_API_KEY;
  if (env.CEREBRAS_API_KEY) out.cerebras = env.CEREBRAS_API_KEY;
  if (env.SAMBANOVA_API_KEY) out.sambanova = env.SAMBANOVA_API_KEY;
  if (env.DEEPINFRA_API_KEY) out.deepinfra = env.DEEPINFRA_API_KEY;
  if (env.GOOGLE_GEMINI_API_KEY) out.gemini = env.GOOGLE_GEMINI_API_KEY;
  if (env.OLLAMA_HOST || env.OLLAMA_ENABLED === "true") out.ollama = env.OLLAMA_HOST ?? "http://localhost:11434";
  return out;
}

// ── Single-provider probe ──────────────────────────────────────────────

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface ProbeDeps { fetchImpl?: FetchLike; env?: NodeJS.ProcessEnv; now?: () => number; timeoutMs?: number }

function num(h: Headers, name: string): number | null {
  const v = h.get(name);
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function timedFetch(fetchImpl: FetchLike, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function classifyHttp(status: number, body: string): ProviderStatusKind {
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 402 || /payment.?required|payment_method|insufficient.?(credit|quota|balance)|daily limit|quota (exceeded|exhausted)/i.test(body)) return "quota_exceeded";
  if (status === 429) return "quota_exceeded";
  if (status >= 500) return "unreachable";
  return "valid";
}

function head(body: string): string {
  try {
    const j = JSON.parse(body) as { error?: { message?: string; type?: string } | string; message?: string };
    const m = typeof j.error === "string" ? j.error : j.error?.message ?? j.message;
    if (m) return String(m).slice(0, 120);
  } catch { /* not JSON */ }
  return body.replace(/\s+/g, " ").slice(0, 120);
}

/** Probe ONE provider. Never throws. */
export async function probeProvider(provider: ProbeProvider, secret: string, deps: ProbeDeps = {}): Promise<ProviderStatus> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? PROBE_TIMEOUT_MS;
  const started = now();
  const base = (status: ProviderStatusKind, extra: Partial<ProviderStatus> = {}): ProviderStatus => ({
    provider,
    status,
    checked_at: new Date(now()).toISOString(),
    latency_ms: now() - started,
    ...extra,
  });

  try {
    switch (provider) {
      case "anthropic": {
        // A 1-token Haiku completion is the only call that returns the
        // anthropic-ratelimit-* headers the dispatcher wants (≈ US$0.00002).
        const res = await timedFetch(fetchImpl, "https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": secret, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 1, messages: [{ role: "user", content: "ok" }] }),
        }, timeoutMs);
        const body = await res.text();
        const status = classifyHttp(res.status, body);
        if (status === "invalid_key") markAnthropicKeyInvalid(now(), `probe ${res.status}`);
        const rl = parseRateLimitHeaders(res.headers, now());
        if (rl) noteAnthropicHeadroom(rl);
        return base(status, {
          http_status: res.status,
          headroom: rl ? { rpm_remaining: rl.requests_remaining, tpm_remaining: rl.tokens_remaining, reset_at: rl.requests_reset_at } : undefined,
          detail: status === "valid" ? undefined : head(body),
        });
      }
      case "claude-oauth": {
        const res = await timedFetch(fetchImpl, "https://api.anthropic.com/v1/models?limit=1", {
          method: "GET",
          headers: { authorization: `Bearer ${secret}`, "anthropic-version": "2023-06-01", "anthropic-beta": "oauth-2025-04-20" },
        }, timeoutMs);
        const body = await res.text();
        const status = classifyHttp(res.status, body);
        return base(status, { http_status: res.status, detail: status === "valid" ? "subscription (personal CLI credential — not a product licence)" : head(body) });
      }
      case "claude-proxy": {
        const url = `${(env.ANTHROPIC_PROXY_BASE_URL ?? "").replace(/\/$/, "")}/messages`;
        const res = await timedFetch(fetchImpl, url, {
          method: "POST",
          headers: { "x-api-key": secret, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1, messages: [{ role: "user", content: "ok" }] }),
        }, timeoutMs);
        const body = await res.text();
        const status = classifyHttp(res.status, body);
        return base(status, { http_status: res.status, detail: status === "valid" ? undefined : head(body) });
      }
      case "openrouter": {
        const res = await timedFetch(fetchImpl, "https://openrouter.ai/api/v1/credits", {
          method: "GET",
          headers: { authorization: `Bearer ${secret}` },
        }, timeoutMs);
        const body = await res.text();
        const status = classifyHttp(res.status, body);
        if (status !== "valid") return base(status, { http_status: res.status, detail: head(body) });
        let remaining: number | null = null;
        try {
          const j = JSON.parse(body) as { data?: { total_credits?: number; total_usage?: number } };
          if (j.data && typeof j.data.total_credits === "number") {
            remaining = Math.round((j.data.total_credits - (j.data.total_usage ?? 0)) * 100) / 100;
          }
        } catch { /* leave null */ }
        const low = remaining !== null && remaining < openRouterMinCreditUsd();
        return base(low ? "low_credit" : "valid", {
          http_status: res.status,
          headroom: { credits_remaining_usd: remaining },
          detail: low ? `credits US$${remaining} < floor US$${openRouterMinCreditUsd()}` : undefined,
        });
      }
      case "groq": {
        // Chat completion (free) so the x-ratelimit-* headers report TPM/RPM.
        const res = await timedFetch(fetchImpl, "https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
          body: JSON.stringify({ model: env.GROQ_PROBE_MODEL ?? "openai/gpt-oss-20b", max_tokens: 1, messages: [{ role: "user", content: "ok" }] }),
        }, timeoutMs);
        const body = await res.text();
        const status = classifyHttp(res.status, body);
        return base(status, {
          http_status: res.status,
          headroom: {
            rpm_remaining: num(res.headers, "x-ratelimit-remaining-requests"),
            tpm_remaining: num(res.headers, "x-ratelimit-remaining-tokens"),
            reset_at: res.headers.get("x-ratelimit-reset-tokens"),
          },
          detail: status === "valid" ? undefined : head(body),
        });
      }
      case "cerebras":
      case "sambanova":
      case "deepinfra": {
        const url = provider === "cerebras"
          ? "https://api.cerebras.ai/v1/models"
          : provider === "sambanova"
            ? "https://api.sambanova.ai/v1/models"
            : "https://api.deepinfra.com/v1/openai/models";
        const res = await timedFetch(fetchImpl, url, { method: "GET", headers: { authorization: `Bearer ${secret}` } }, timeoutMs);
        const body = await res.text();
        const status = classifyHttp(res.status, body);
        return base(status, { http_status: res.status, detail: status === "valid" ? undefined : head(body) });
      }
      case "gemini": {
        // S32-C — the models endpoint answers 200 for a valid key (no token
        // spend). Key travels in the x-goog-api-key header, never the URL.
        const res = await timedFetch(fetchImpl, "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
          method: "GET",
          headers: { "x-goog-api-key": secret },
        }, timeoutMs);
        const body = await res.text();
        const status = res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(body) ? "invalid_key" : classifyHttp(res.status, body);
        return base(status, { http_status: res.status, detail: status === "valid" ? "quality-cost tier (report classes)" : head(body) });
      }
      case "gemini": {
        // S32-C — the models list answers with the key in a HEADER (never
        // the URL, so it cannot land in a log line). `valid` when it answers.
        const res = await timedFetch(fetchImpl, "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
          method: "GET",
          headers: { "x-goog-api-key": secret },
        }, timeoutMs);
        const body = await res.text();
        const status = res.status === 400 && /api key not valid|api_key_invalid/i.test(body) ? "invalid_key" : classifyHttp(res.status, body);
        return base(status, { http_status: res.status, detail: status === "valid" ? undefined : head(body) });
      }
      case "ollama": {
        const res = await timedFetch(fetchImpl, `${secret.replace(/\/$/, "")}/api/tags`, { method: "GET" }, timeoutMs);
        return base(res.ok ? "valid" : "unreachable", { http_status: res.status });
      }
      default:
        return base("not_configured");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return base("unreachable", { detail: /abort/i.test(msg) ? `timeout after ${timeoutMs}ms` : msg.slice(0, 120) });
  }
}

// ── Cache file ─────────────────────────────────────────────────────────

export function readProviderStatusFile(file: string = PROVIDER_STATUS_FILE): ProviderStatusFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as ProviderStatusFile;
    if (parsed && typeof parsed === "object" && parsed.providers) return parsed;
  } catch { /* none yet */ }
  return { updated_at: new Date(0).toISOString(), providers: {} };
}

function writeProviderStatusFile(data: ProviderStatusFile, file: string = PROVIDER_STATUS_FILE): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  } catch {
    /* fail-open */
  }
}

let inflight: Promise<ProviderStatusFile> | null = null;

/**
 * Probe every configured provider whose cached verdict is older than 15 min
 * (or all of them with `force`). Unconfigured providers are listed as
 * `not_configured` without a call. Concurrent callers share one run.
 */
export async function probeProviders(deps: ProbeDeps & { force?: boolean; file?: string } = {}): Promise<ProviderStatusFile> {
  if (inflight) return inflight;
  inflight = (async () => {
    const now = deps.now ?? Date.now;
    const env = deps.env ?? process.env;
    const file = deps.file ?? PROVIDER_STATUS_FILE;
    const cached = readProviderStatusFile(file);
    const configured = configuredProviders(env);
    const next: ProviderStatusFile = { updated_at: new Date(now()).toISOString(), providers: {} };
    const jobs: Promise<void>[] = [];
    for (const p of PROBE_PROVIDERS) {
      const secret = configured[p];
      if (!secret) {
        next.providers[p] = { provider: p, status: "not_configured", checked_at: next.updated_at, latency_ms: 0 };
        continue;
      }
      const prior = cached.providers[p];
      const priorAt = prior ? new Date(prior.checked_at).getTime() : NaN;
      if (!deps.force && prior && prior.status !== "not_configured" && !Number.isNaN(priorAt) && now() - priorAt < PROBE_TTL_MS) {
        next.providers[p] = prior;
        continue;
      }
      jobs.push(probeProvider(p, secret, deps).then((r) => { next.providers[p] = r; }));
    }
    await Promise.all(jobs);
    // Stable key order (PROBE_PROVIDERS) so diffs of the file stay readable.
    const ordered: ProviderStatusFile = { updated_at: next.updated_at, providers: {} };
    for (const p of PROBE_PROVIDERS) if (next.providers[p]) ordered.providers[p] = next.providers[p];
    writeProviderStatusFile(ordered, file);
    return ordered;
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Cached verdict for one provider (no network). */
export function cachedProviderStatus(provider: ProbeProvider, file: string = PROVIDER_STATUS_FILE): ProviderStatus | null {
  return readProviderStatusFile(file).providers[provider] ?? null;
}

// ── /api/status shape ─────────────────────────────────────────────────

export interface AiProvidersSummary {
  updated_at: string;
  providers: Record<string, { status: ProviderStatusKind; checked_at: string; headroom?: ProviderHeadroom; detail?: string }>;
  /** Number of providers currently usable (valid or low_credit-but-serving). */
  usable: number;
  /** True when the Anthropic API key is present AND valid. */
  quality_tier_ready: boolean;
}

/** Trusted-payload summary: verdicts + headroom only, never key material. */
export async function readAiProvidersSummary(root: string = process.cwd()): Promise<AiProvidersSummary> {
  const file = path.join(root, PROVIDER_STATUS_REL);
  const data = fs.existsSync(file) ? readProviderStatusFile(file) : readProviderStatusFile();
  const providers: AiProvidersSummary["providers"] = {};
  let usable = 0;
  for (const p of PROBE_PROVIDERS) {
    const s = data.providers[p];
    if (!s) continue;
    providers[p] = { status: s.status, checked_at: s.checked_at, ...(s.headroom ? { headroom: s.headroom } : {}), ...(s.detail ? { detail: s.detail } : {}) };
    if (s.status === "valid") usable += 1;
  }
  return {
    updated_at: data.updated_at,
    providers,
    usable,
    quality_tier_ready: data.providers.anthropic?.status === "valid",
  };
}

/** Test-only. */
export function _resetProviderStatusForTests(): void {
  inflight = null;
}
