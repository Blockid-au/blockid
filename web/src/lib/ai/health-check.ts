// Per-model health check — sends a tiny "reply with ok" prompt and records
// latency + status. Used by the /api/cron/ai-health-check monitor.
//
// A model is considered "quota exceeded" if the response is HTTP 429 OR the
// error body matches /quota|rate.?limit|exceeded/i. The registry keeps the
// model out of the active chain for `degraded_until` and auto-injects backups
// from the known-good pool.

export type HealthStatus = "healthy" | "quota_exceeded" | "unauthorized" | "not_found" | "timeout" | "error";

export interface ProviderEndpoint {
  provider: string;
  url: string;
  apiKey: string | undefined;
  /** Some providers (Cloudflare) need extra headers (Account-Id). */
  extraHeaders?: Record<string, string>;
}

export interface HealthResult {
  provider: string;
  model: string;
  status: HealthStatus;
  healthy: boolean;
  quota_exceeded: boolean;
  latency_ms: number;
  http_status: number;
  error?: string;
  checked_at: string;
}

const DEFAULT_TIMEOUT_MS = 5_000;

const QUOTA_RE = /quota|rate.?limit|exceeded|too many requests|\bcapacity\b/i;

export function endpointFor(provider: string): { url: string; envKey: string } | null {
  switch (provider) {
    case "groq":
      return { url: "https://api.groq.com/openai/v1/chat/completions", envKey: "GROQ_API_KEY" };
    case "cerebras":
      return { url: "https://api.cerebras.ai/v1/chat/completions", envKey: "CEREBRAS_API_KEY" };
    case "sambanova":
      return { url: "https://api.sambanova.ai/v1/chat/completions", envKey: "SAMBANOVA_API_KEY" };
    case "openrouter":
      return { url: "https://openrouter.ai/api/v1/chat/completions", envKey: "OPENROUTER_API_KEY" };
    case "chutes":
      return { url: "https://llm.chutes.ai/v1/chat/completions", envKey: "CHUTES_API_KEY" };
    case "cloudflare":
      // Cloudflare workers AI needs account-id in URL; skip if not fully wired.
      return { url: "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/v1/chat/completions", envKey: "CLOUDFLARE_API_TOKEN" };
    default:
      return null;
  }
}

/** Ping a single model. Never throws — always returns a HealthResult. */
export async function checkModel(
  provider: string,
  model: string,
  opts: { timeoutMs?: number } = {},
): Promise<HealthResult> {
  const now = new Date().toISOString();
  const ep = endpointFor(provider);
  if (!ep) {
    return { provider, model, status: "error", healthy: false, quota_exceeded: false, latency_ms: 0, http_status: 0, error: `unknown provider ${provider}`, checked_at: now };
  }
  const apiKey = process.env[ep.envKey];
  if (!apiKey) {
    return { provider, model, status: "unauthorized", healthy: false, quota_exceeded: false, latency_ms: 0, http_status: 0, error: `no ${ep.envKey}`, checked_at: now };
  }

  // Cloudflare needs account id substitution; skip if not configured.
  let url = ep.url;
  if (url.includes("${CF_ACCOUNT_ID}")) {
    const acct = process.env.CF_ACCOUNT_ID;
    if (!acct) {
      return { provider, model, status: "unauthorized", healthy: false, quota_exceeded: false, latency_ms: 0, http_status: 0, error: "no CF_ACCOUNT_ID", checked_at: now };
    }
    url = url.replace("${CF_ACCOUNT_ID}", acct);
  }

  const ctrl = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with just 'ok'" }],
        max_tokens: 4,
      }),
      signal: ctrl.signal,
    });
    const latency = Date.now() - start;
    const text = await res.text();
    if (res.status === 200) {
      return { provider, model, status: "healthy", healthy: true, quota_exceeded: false, latency_ms: latency, http_status: 200, checked_at: now };
    }
    if (res.status === 429 || QUOTA_RE.test(text)) {
      return { provider, model, status: "quota_exceeded", healthy: false, quota_exceeded: true, latency_ms: latency, http_status: res.status, error: text.slice(0, 160), checked_at: now };
    }
    if (res.status === 401 || res.status === 403) {
      return { provider, model, status: "unauthorized", healthy: false, quota_exceeded: false, latency_ms: latency, http_status: res.status, error: text.slice(0, 160), checked_at: now };
    }
    if (res.status === 404 || /not.?found|does not exist/i.test(text)) {
      return { provider, model, status: "not_found", healthy: false, quota_exceeded: false, latency_ms: latency, http_status: res.status, error: text.slice(0, 160), checked_at: now };
    }
    return { provider, model, status: "error", healthy: false, quota_exceeded: false, latency_ms: latency, http_status: res.status, error: text.slice(0, 160), checked_at: now };
  } catch (err) {
    const latency = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort|timeout/i.test(msg)) {
      return { provider, model, status: "timeout", healthy: false, quota_exceeded: false, latency_ms: latency, http_status: 0, error: `timeout after ${timeoutMs}ms`, checked_at: now };
    }
    return { provider, model, status: "error", healthy: false, quota_exceeded: false, latency_ms: latency, http_status: 0, error: msg.slice(0, 160), checked_at: now };
  } finally {
    clearTimeout(timer);
  }
}

/** Run checks with bounded parallelism to keep the total run below ~2 min. */
export async function checkModelsBatch(
  targets: { provider: string; model: string }[],
  opts: { timeoutMs?: number; concurrency?: number } = {},
): Promise<HealthResult[]> {
  const concurrency = Math.max(1, opts.concurrency ?? 6);
  const results: HealthResult[] = [];
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < targets.length) {
      const i = idx++;
      const t = targets[i];
      results[i] = await checkModel(t.provider, t.model, { timeoutMs: opts.timeoutMs });
    }
  });
  await Promise.all(workers);
  return results;
}
