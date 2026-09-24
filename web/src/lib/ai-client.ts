import { createReportAttemptBudget, currentReportSpendScope } from "@/lib/ai/report-attempt-budget";
import { ResearchAttemptBudgetError, reserveResearchAttempt, settleResearchAttempt, type ResearchAttemptBudget } from "@/lib/ai/research-attempt-budget";
import { trackOriginWork } from "@/lib/ops/origin-activity";
/**
 * Unified AI client — task-class-aware, parallel-load-aware dispatcher
 * (S31-A tiers, S32-C quality-first / cheapest-possible routing, Sep 2026).
 *
 * POLICY (S32-C): the provider order depends on the TASK CLASS of the call
 * (`taskClass` — `classify | report | synthesis`, inferred from agentId /
 * maxTokens when omitted, see lib/ai/anthropic-tier.ts#inferTaskClass).
 *
 *   report / synthesis — a founder's first analysis (10+ page report + email)
 *   and every other narrative gets BlockID's best model at the lowest cost
 *   that still delivers report-grade prose:
 *
 *     1. claude-apikey   QUALITY — Anthropic API (Sonnet 5 / Opus 5), only
 *                        while ANTHROPIC_API_KEY is valid and the daily cap
 *                        (AI_DAILY_SPEND_CAP_AUD) has headroom. OPTIONAL
 *                        (G25-B, founder 2026-09-21): with no key on the box
 *                        the tier is absent — filtered out before any call,
 *                        no probe, no log line, no health warning.
 *     2. deepinfra       QUALITY-COST — DeepSeek-V4-Flash ($0.09/$0.18 per 1M)
 *                        → DeepSeek-V3.2 → Qwen3-235B (→ Kimi-K2.6 for synthesis).
 *     3. gemini          QUALITY-COST — gemini-3-flash-preview → 2.5-flash
 *                        (3.1-pro-preview → 2.5-pro for synthesis).
 *     4. claude-oauth    SUBSCRIPTION FALLBACK — the Claude Max CLI token is a
 *                        PERSONAL credential, not a product tier: it is never
 *                        primary, capped at AI_RPM_CLAUDE_OAUTH (20) and only
 *                        picked when neither deepinfra nor gemini has headroom.
 *                        Since G25-B this IS the Anthropic path (no API key);
 *                        it keeps its own probe + health entry (`claude-oauth`).
 *     5. groq → sambanova → cerebras → openrouter   FREE — report-grade
 *                        models only (MIN_REPORT_MODEL allow-list: ≥ ~27B,
 *                        no tts / whisper / embed / allam / vision-only).
 *     6. claude-haiku-direct → claude-proxy → ollama   last resort.
 *
 *   classify — short JSON / labels / extraction: cheap-first.
 *     claude-apikey (Haiku 4.5, when valid) → free tiers (groq → cerebras →
 *     sambanova → openrouter → ollama) → gemini-2.5-flash-lite → deepinfra
 *     gpt-oss-120b → claude-oauth → haiku-direct.
 *
 *   AI_REPORT_PROVIDER_ORDER (comma list, e.g. "deepinfra,gemini,groq") re-orders
 *   the report/synthesis chain without a deploy; a "-name" entry drops a provider.
 *   Every paid call (quality, quality-cost, paid) is tracked from the provider's
 *   real `usage` into the daily ledger and stops at the cap.
 *
 * All AI routes use `callAI()` which returns a plain text response, so a route
 * never knows (or cares) which provider answered. The dispatcher picks by tier
 * for the class, then by REAL remaining capacity (rate-limit headers for
 * Anthropic, RPM windows elsewhere), skips providers whose key is invalid /
 * quota spent / credit low (see lib/ai/provider-status.ts), and applies a
 * bounded, user-fair queue so a trial surge gets an honest 503 + Retry-After
 * (lib/ai/capacity.ts) instead of a 500.
 *
 * Fallback: if the chosen provider fails (rate limit, auth error, etc.) the next
 * provider by tier + headroom is tried, each at most once per call. The result
 * carries `via` (the dispatcher provider) and `model` so a report can say
 * truthfully which model wrote it.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AITransportError, inprocessFetch, inprocessStreamChat, type AITransportDiagnostics } from "@/lib/ai/http-transport";
import { orderModelsBySpeed, recordModelSpeed } from "@/lib/ai/model-throughput";
import {
  callAnthropicTier,
  anthropicRequestsRemaining,
  isAnthropicKeyInvalid,
  isAnthropicApiKeyConfigured,
  markAnthropicKeyInvalid,
  inferTaskClass,
  modelForTaskClass,
  type AITaskClass,
} from "@/lib/ai/anthropic-tier";
import { AICapacityError } from "@/lib/ai/capacity";
import { type RunStrikeSink, RunStruckError, classifyRunStrike } from "@/lib/ai/run-strikes";
import { isDailyCapReached, notifyCapReached, recordPaidSpend } from "@/lib/ai/spend-guard";
import { cachedProviderStatus, probeProviders, readProviderStatusFile, PROBE_TTL_MS, type ProbeProvider } from "@/lib/ai/provider-status";
import {
  classifyDeadRung,
  isDeadRung,
  markDeadRung,
  providerCapacity as deadRungCapacity,
  readStrikes,
  strikeKey,
  unfundedProviders,
  writeStrikes,
  type ProviderCapacity,
  type StrikeFile,
} from "@/lib/ai/model-strikes";

// Embedded AI worker source. Written to a temp file as a last-resort fallback
// when no on-disk ai-worker.mjs can be found — e.g. an incomplete standalone
// deploy where the file wasn't copied alongside the server's cwd. Keeping a
// copy here means a missing worker file can never take down the whole AI stack.
// NOTE: keep this in sync with ai-worker.mjs (path uses pathname + search so
// query-string auth like Gemini's ?key= survives).
const AI_WORKER_SRC = `import https from 'https';
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const { url, headers, body } = JSON.parse(input);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      timeout: 180000,
    }, res => {
      let data = '';
      res.on('data', c => { data += c.toString(); });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          process.stderr.write('HTTP ' + res.statusCode + ': ' + data.slice(0, 200));
          process.exit(1);
        }
        process.stdout.write(data);
      });
    });
    req.on('error', e => { process.stderr.write(e.message); process.exit(1); });
    req.on('timeout', () => { req.destroy(); process.stderr.write('timeout'); process.exit(1); });
    req.write(body);
    req.end();
  } catch (e) {
    process.stderr.write('[ai-worker] ' + e.message);
    process.exit(1);
  }
});
`;

// Resolve the ai-worker.mjs path once, with a self-healing temp-file fallback.
let cachedWorkerPath: string | null = null;
function resolveWorkerPath(): string {
  if (cachedWorkerPath && fs.existsSync(cachedWorkerPath)) return cachedWorkerPath;

  const candidates = [
    path.join(process.cwd(), "ai-worker.mjs"),
    "/app/ai-worker.mjs",
    path.join(process.cwd(), ".next", "standalone", "ai-worker.mjs"),
  ];
  // __dirname may be undefined in some bundling modes — guard the reference.
  try { if (typeof __dirname === "string") candidates.push(path.join(__dirname, "ai-worker.mjs")); } catch { /* ignore */ }

  const found = candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
  if (found) { cachedWorkerPath = found; return found; }

  // Last resort: materialize the embedded worker to a temp file (write once).
  const tmp = path.join(os.tmpdir(), "blockid-ai-worker.mjs");
  if (!fs.existsSync(tmp)) fs.writeFileSync(tmp, AI_WORKER_SRC, "utf-8");
  console.warn(`[ai-worker] no on-disk worker found; using embedded fallback at ${tmp}`);
  cachedWorkerPath = tmp;
  return tmp;
}

/**
 * Default AI transport. Uses the in-process HTTP transport, with a global
 * kill-switch (AI_FETCH_MODE=subprocess) and an automatic one-shot fallback to
 * the legacy subprocess worker on any UNEXPECTED failure — so AI can never go
 * fully dark even if the in-process path misbehaves in some environment.
 */
async function workerFetch(url: string, headers: Record<string, string>, body: string, timeoutMs = 30_000, allowTransportFallback = true): Promise<string> {
  if (process.env.AI_FETCH_MODE !== "subprocess") {
    try {
      return await inprocessFetch(url, headers, body, timeoutMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Real HTTP errors / timeouts are genuine — propagate so the model/provider
      // cooldown + fallback chain handles them (a subprocess retry would repeat them).
      if (!allowTransportFallback || /^HTTP \d/.test(msg) || /timeout/i.test(msg) || /Empty response/.test(msg)) throw err;
      // Anything else (unexpected runtime/env issue) → fall back to the subprocess once.
      console.warn(`[ai-worker] in-process fetch failed (${msg}); falling back to subprocess`);
      return subprocessFetch(url, headers, body, timeoutMs);
    }
  }
  return subprocessFetch(url, headers, body, timeoutMs);
}

/**
 * Legacy transport: call external API via the ai-worker.mjs subprocess. Kept as
 * a resilient fallback and selectable via AI_FETCH_MODE=subprocess — it bypasses
 * Next's patched fetch by running in a clean node process.
 */
function subprocessFetch(url: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<string> {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const cp = eval('require')("child_process") as typeof import("child_process");
  /* eslint-enable @typescript-eslint/no-require-imports */
  const { spawn } = cp;

  return new Promise((resolve, reject) => {
    let workerPath: string;
    try {
      workerPath = resolveWorkerPath();
    } catch (err) {
      reject(new Error(`ai-worker.mjs not found and fallback failed: ${err instanceof Error ? err.message : String(err)}`));
      return;
    }

    console.log(`[ai-worker] spawn: worker=${workerPath} url=${url.slice(0, 40)}... timeout=${timeoutMs}ms`);

    const child = spawn("node", [workerPath]);
    let stdout = "";
    let stderr = "";
    let killed = false;

    const killTimer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code: number) => {
      clearTimeout(killTimer);
      if (killed) reject(new Error(`Worker timeout (${Math.round(timeoutMs / 1000)}s)`));
      else if (code === 0 && stdout) resolve(stdout);
      else reject(new Error(stderr || `Worker exited ${code}`));
    });
    child.on("error", (err) => { clearTimeout(killTimer); reject(err); });

    child.stdin.write(JSON.stringify({ url, headers, body }));
    child.stdin.end();
  });
}

// ── Admin-configured keys from Supabase ───────────────────────────────
// Cache DB keys for 5 minutes to avoid hitting Supabase on every AI call.

interface DBKey { provider: string; api_key: string; base_url: string | null; is_active: boolean }
let dbKeysCache: { keys: DBKey[]; fetchedAt: number } | null = null;
const DB_KEYS_TTL = 5 * 60 * 1000; // 5 min

async function getDBKeys(): Promise<DBKey[]> {
  if (dbKeysCache && Date.now() - dbKeysCache.fetchedAt < DB_KEYS_TTL) {
    return dbKeysCache.keys;
  }
  try {
    // Dynamic import to avoid circular deps and keep module lightweight
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const supabase = getSupabaseAdmin();
    if (!supabase) return [];
    const { data } = await supabase
      .from("ai_provider_keys")
      .select("provider, api_key, base_url, is_active")
      .eq("is_active", true);
    const keys = (data ?? []) as DBKey[];
    dbKeysCache = { keys, fetchedAt: Date.now() };
    return keys;
  } catch {
    return dbKeysCache?.keys ?? [];
  }
}

function getDBKey(provider: string): DBKey | undefined {
  return dbKeysCache?.keys.find((k) => k.provider === provider && k.is_active);
}

/** Force refresh DB keys cache (call after admin updates keys) */
export function invalidateAIKeysCache(): void {
  dbKeysCache = null;
}

// ── Dynamic free-model lists (auto-refreshed daily) ───────────────────
// /api/cron/refresh-models discovers the strongest currently-available FREE
// models each day and writes them here, ranked. ai-client reads this at runtime
// (cached 5 min) and falls back to the hardcoded defaults if the file is
// missing/stale — so a bad refresh can never break the provider chain.
export const FREE_MODELS_CONFIG = "/home/dovanlong/blockid.au/web/content/reports/ai-free-models.json";
let modelCfgCache: { data: Record<string, string[]>; at: number } | null = null;

function getDynamicModels(provider: string, fallback: string[]): string[] {
  try {
    const now = Date.now();
    if (!modelCfgCache || now - modelCfgCache.at > 5 * 60 * 1000) {
      const raw = fs.readFileSync(FREE_MODELS_CONFIG, "utf8");
      modelCfgCache = { data: JSON.parse(raw), at: now };
    }
    const list = modelCfgCache.data?.[provider];
    if (Array.isArray(list) && list.length > 0) {
      // Use ONLY the top picks (keeps the chain short → far fewer 429 retries).
      // The curated `fallback` is the safety net when no config file exists.
      return list;
    }
  } catch {
    /* no config yet → curated defaults */
  }
  return fallback;
}

// ── Per-model failure cooldown ────────────────────────────────────────
// When a specific free model returns 429 (rate-limited / out of credit) or 404
// (removed / no endpoints), skip it for a while instead of hammering it. This
// is what keeps the chain from spamming 429s and retrying dead models between
// daily refreshes — and lets the next model in the list answer immediately.
const modelCooldownUntil = new Map<string, number>();

function modelReady(model: string): boolean {
  return Date.now() >= (modelCooldownUntil.get(model) ?? 0);
}

// ── MIN_REPORT_MODEL (S32-C) ──────────────────────────────────────────
// A free-tier model may write a `report` / `synthesis` section only when it
// is report-grade. The daily refresh ranks free models by raw availability,
// so the shared list can carry 7B chat models, TTS / speech / embedding
// endpoints and Arabic-only checkpoints — none of which can write a 10-page
// founder report. The allow-list is by pattern (family + size), the
// deny-list removes non-text and tiny models even when a family matches.
const REPORT_MODEL_ALLOW: RegExp[] = [
  /gpt-oss-120b/i,
  /nemotron-3(\.\d+)?-(super|ultra)/i,
  /qwen-?3(\.\d+)?[-_/]?.*?(27b|32b|80b|235b)/i,
  /deepseek/i,
  /llama-?3\.3-70b/i,
  /kimi/i,
  /gemma-4-31b/i,
  /gemini-(2\.5|3)(\.\d)?-(flash|pro)(?!-lite)/i,
];
const REPORT_MODEL_DENY: RegExp[] = [
  /allam/i,
  /\btts\b|orpheus|speech|audio/i,
  /whisper/i,
  /embed/i,
  /lyria|image|imagen|vision-only|-vl\b|-vl:/i,
  // ≤ 20B dense / small MoE (nano, mini, lightning, 1–20B labels)
  /\b(0\.\d+|[1-9]|1\d|20)b\b/i,
  /nemotron-3(\.\d+)?-nano|lightning|:mini|-mini\b|\bmini\b|distill/i,
];

/** True when a model id looks strong enough to write a report section. */
export function isReportGradeModel(model: string): boolean {
  if (REPORT_MODEL_DENY.some((re) => re.test(model))) return false;
  return REPORT_MODEL_ALLOW.some((re) => re.test(model));
}

/** Filter a free-tier model list for the task class: `report` / `synthesis`
 *  keep report-grade models only (falling back to the full list when the
 *  filter would leave nothing — a weak answer beats no answer, and the
 *  grounding validator still checks it); `classify` keeps every model. */
export function modelsForClass(models: string[], cls: AITaskClass): string[] {
  if (cls === "classify") return models;
  const strong = models.filter(isReportGradeModel);
  return strong.length > 0 ? strong : models;
}

// ── G29-A dead rungs (runtime side) ──────────────────────────────────
// The strike table (content/reports/ai-model-strikes.json, shared with the
// health-check / discover / refresh crons) is read through a short cache; a
// rung with a live `dead_until` is skipped by every ladder WITHOUT spending a
// call — curated fallback ladders included, which is where the 2026-09-21
// runs lost 27 calls per run (the file prune never reached them). A live
// 402 / 404 / archived / not-found answer stamps the rung dead here and now;
// one successful answer forgets it.
const STRIKES_CACHE_TTL_MS = 30_000;
let strikesCache: { data: StrikeFile; at: number } | null = null;

function currentStrikes(now: number = Date.now()): StrikeFile {
  if (!strikesCache || now - strikesCache.at > STRIKES_CACHE_TTL_MS) strikesCache = { data: readStrikes(), at: now };
  return strikesCache.data;
}

/** Provider ids that carry a model ladder (the rest have a single fixed model). */
const LADDER_PROVIDERS: readonly Provider[] = ["groq", "cerebras", "sambanova", "openrouter", "deepinfra", "gemini"];

/** The ladder `provider` would dial right now (dynamic file list or curated default; both classes for the paid tier). */
export function ladderFor(provider: Provider): string[] {
  switch (provider) {
    case "groq": return getDynamicModels("groq", GROQ_DEFAULT_MODELS);
    case "cerebras": return getDynamicModels("cerebras", CEREBRAS_DEFAULT_MODELS);
    case "sambanova": return getDynamicModels("sambanova", SAMBANOVA_DEFAULT_MODELS);
    case "openrouter": return getDynamicModels("openrouter", OPENROUTER_DEFAULT_MODELS);
    case "deepinfra": return [...new Set([...DEEPINFRA_MODELS_BY_CLASS.report, ...DEEPINFRA_MODELS_BY_CLASS.classify])];
    case "gemini": return [...new Set([...GEMINI_MODELS_BY_CLASS.report, ...GEMINI_MODELS_BY_CLASS.classify])];
    default: return [];
  }
}

/** Capacity verdict per ladder provider (configured ones only) — the `/api/status.ai.dead_rungs` block. */
export function getProviderCapacity(now: number = Date.now()): Record<string, ProviderCapacity> {
  const ladders: Record<string, string[]> = {};
  for (const p of LADDER_PROVIDERS) if (providerConfigured(p)) ladders[p] = ladderFor(p);
  return deadRungCapacity(currentStrikes(now), ladders, new Date(now));
}

/** True when every rung of `p` is dead or the provider answered 402 in the dead window. */
export function isProviderUnfunded(p: Provider, now: number = Date.now()): boolean {
  if (!LADDER_PROVIDERS.includes(p)) return false;
  const ladder = ladderFor(p);
  if (ladder.length === 0) return false;
  const cap = deadRungCapacity(currentStrikes(now), { [p]: ladder }, new Date(now))[p];
  return cap?.state === "unfunded";
}

/** Read-modify-write against a FRESH copy of the table (never the 30 s cache), so a
 *  runtime stamp cannot overwrite what the health-check / discover cron wrote a
 *  moment ago. Last writer still wins on a true race — a lost stamp costs one
 *  extra call later, never a wrong skip. */
function updateStrikes(mutate: (fresh: StrikeFile) => StrikeFile, now: number): StrikeFile {
  const next = mutate(readStrikes());
  strikesCache = { data: next, at: now };
  writeStrikes(next);
  return next;
}

/** A live answer that is a dead-rung verdict → stamp the rung dead (24 h) in the shared table. */
export function noteDeadRung(provider: Provider, model: string, errMsg: string, now: number = Date.now()): boolean {
  const reason = classifyDeadRung({ message: errMsg });
  if (!reason) return false;
  const next = updateStrikes((fresh) => markDeadRung(fresh, provider, model, reason, new Date(now)), now);
  const until = next[strikeKey(provider, model)]?.dead_until ?? "";
  console.warn(`[ai-client:dead-rung] ${provider} ${model} → ${reason}; skipped without a call until ${until}`);
  return true;
}

/** A live success forgets the rung's strike entry (dead or not) — mirrors the probe rule. */
function clearDeadRung(provider: Provider, model: string, now: number = Date.now()): void {
  const key = strikeKey(provider, model);
  if (!currentStrikes(now)[key]) return; // cheap path: nothing to forget
  updateStrikes((fresh) => {
    if (!fresh[key]) return fresh;
    const next = { ...fresh };
    delete next[key];
    return next;
  }, now);
}

/** Thrown by a ladder whose every rung is dead — no call was made. */
export class DeadLadderError extends Error {
  constructor(readonly provider: Provider, readonly total: number) {
    super(`${provider}: all ${total} models are dead rungs (402 / 404 in the last 24 h) — skipped without a call; see /api/status ai.dead_rungs`);
    this.name = "DeadLadderError";
  }
}

/** Order a model list with dead rungs (G29-A) and cooled-down models
 *  dropped; if ALL survivors are cooling, return them anyway so we still
 *  attempt (degraded) rather than give up — but a dead rung is never
 *  resurrected by that fallback. Within whichever set we return,
 *  chronically-failing models are sunk to the bottom so the models that
 *  actually answer get tried first. For report classes the
 *  MIN_REPORT_MODEL allow-list is applied first (S32-C). Exported for tests. */
export function readyModels(provider: Provider, models: string[], cls: AITaskClass = "classify", now: number = Date.now()): string[] {
  const strikes = currentStrikes(now);
  const at = new Date(now);
  const alive = models.filter((m) => !isDeadRung(strikes, provider, m, at));
  if (alive.length === 0) return [];
  const eligible = modelsForClass(alive, cls);
  const ready = eligible.filter(modelReady);
  return demoteFlaky(ready.length > 0 ? ready : eligible);
}

function coolDownModel(model: string, errMsg: string, allowDiscovery = true): void {
  const m = errMsg.toLowerCase();
  let ms = 90_000; // default 90s for transient errors
  const isRateLimit = /rate.?limit|\b429\b|quota|temporarily|too many requests|capacity/.test(m);
  // ── Hard signals that mean "widen the fallback chain NOW", not "wait for a storm":
  // 1. Quota EXHAUSTED (not just throttled): the provider explicitly says the account
  //    is out of credit / daily limit hit — retrying the same model is hopeless.
  // 2. Provider OFFLINE: 5xx from the API or a socket/DNS failure — the whole
  //    provider is down, so every model on it is unreachable.
  // Either signal fires discover-models immediately (bypasses STORM_THRESHOLD=2).
  const isQuotaExhausted = /quota (exceeded|exhausted)|out of (credit|quota)|daily limit|monthly limit|insufficient_quota|credit.*(exceeded|exhausted)|payment.?required|\b402\b/.test(m);
  const isProviderOffline = /\b(500|502|503|504)\b|internal server error|bad gateway|service unavailable|gateway timeout|econn(refused|reset)|enotfound|getaddrinfo|network|socket hang up|fetch failed/.test(m);
  if (/not found|no endpoints|no allowed providers|invalid model|\b404\b|does not exist|unsupported model/.test(m)) {
    ms = 60 * 60_000; // model gone → 1h (next daily refresh usually drops it)
  } else if (isQuotaExhausted) {
    ms = 60 * 60_000; // quota gone → 1h; try elsewhere
    if (allowDiscovery) noteHardFailureEvent(model, "quota_exhausted");
  } else if (isProviderOffline) {
    ms = 10 * 60_000; // provider down → 10 min
    if (allowDiscovery) noteHardFailureEvent(model, "provider_offline");
  } else if (isRateLimit) {
    ms = 5 * 60_000; // rate-limited (soft) → 5 min
    if (allowDiscovery) noteRateLimitEvent(model);
  }
  modelCooldownUntil.set(model, Date.now() + ms);
  recordModelOutcome(model, false);
}

// ── Rate-limit storm → auto-discover fresh free models ────────────────
// When several models hit 429 in a short window, fire-and-forget POST to
// /api/cron/discover-models so 3 NEW strong free models get prepended to the
// shared list before the next request reads it. Throttled to once per 30 min
// so a sustained outage doesn't hammer the discovery endpoint.
// G29-A: the same POST is the pruning pass — the route drops every dead rung
// (402 / 404 / archived / not-found in the last 24 h) from ai-free-models.json
// before it looks for new models, so a storm shortens the ladder as well as
// widening it. The runtime skip does not wait for it (readyModels reads the
// strike table directly).
const rateLimitTimestamps: number[] = [];
const STORM_WINDOW_MS = 5 * 60_000;     // 5-minute sliding window
const STORM_THRESHOLD = 2;              // ≥2 rate-limit events → trigger
const DISCOVER_DEBOUNCE_MS = 30 * 60_000; // at most once per 30 min
let lastDiscoverFiredAt = 0;

function noteRateLimitEvent(model: string): void {
  const now = Date.now();
  rateLimitTimestamps.push(now);
  while (rateLimitTimestamps.length > 0 && rateLimitTimestamps[0] < now - STORM_WINDOW_MS) {
    rateLimitTimestamps.shift();
  }
  if (rateLimitTimestamps.length < STORM_THRESHOLD) return;
  if (now - lastDiscoverFiredAt < DISCOVER_DEBOUNCE_MS) return;
  lastDiscoverFiredAt = now;
  rateLimitTimestamps.length = 0;
  fireDiscoverModels(model).catch((err) => {
    console.warn(`[ai-client:storm] discover-models trigger failed: ${err instanceof Error ? err.message : err}`);
  });
}

// Hard failure = definitive quota exhaustion or provider offline. Unlike a soft
// rate-limit event (which only trips discover-models after STORM_THRESHOLD=2
// events in 5 min), a single hard failure means "the running fallback chain is
// no longer viable" — so we fire discover-models immediately. Still gated by
// the 30-min debounce so a sustained outage doesn't hammer the discovery
// endpoint. `kind` is logged for observability (quota vs offline).
function noteHardFailureEvent(model: string, kind: "quota_exhausted" | "provider_offline"): void {
  const now = Date.now();
  if (now - lastDiscoverFiredAt < DISCOVER_DEBOUNCE_MS) return;
  lastDiscoverFiredAt = now;
  rateLimitTimestamps.length = 0;
  console.warn(`[ai-client:hard-fail] ${kind} on ${model} → firing discover-models NOW (bypass storm threshold)`);
  fireDiscoverModels(model).catch((err) => {
    console.warn(`[ai-client:hard-fail] discover-models trigger failed: ${err instanceof Error ? err.message : err}`);
  });
}

async function fireDiscoverModels(triggerModel: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[ai-client:storm] CRON_SECRET not set — cannot trigger discover-models");
    return;
  }
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "http://127.0.0.1:3000";
  const url = `${base.replace(/\/$/, "")}/api/cron/discover-models`;
  console.warn(`[ai-client:storm] rate-limit storm detected (trigger=${triggerModel}) → POST ${url}`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: ctrl.signal,
    });
    const body = await res.text();
    console.warn(`[ai-client:storm] discover-models ${res.status}: ${body.slice(0, 300)}`);
  } finally {
    clearTimeout(t);
  }
}

// ── Persistent model reliability (demote flaky models in fallback order) ──
// The cooldown above avoids a flaky model for a few minutes, but it resets on
// restart and never changes the ORDER models are tried. This layer persists a
// lightweight fail/ok tally per model to disk and sinks chronically-failing
// models to the BOTTOM of every fallback chain — so models that actually answer
// are tried first, even across restarts and daily model refreshes. The daily
// refresh ranks by raw capability; this reranks by real-world reliability.
const MODEL_HEALTH_FILE = "/tmp/blockid-model-health.json";
interface ModelHealth { fails: number; ok: number; lastFail: number }
let modelHealthCache: { data: Record<string, ModelHealth>; at: number } | null = null;

function readModelHealth(): Record<string, ModelHealth> {
  const now = Date.now();
  if (modelHealthCache && now - modelHealthCache.at < 30_000) return modelHealthCache.data;
  let data: Record<string, ModelHealth> = {};
  try { data = JSON.parse(fs.readFileSync(MODEL_HEALTH_FILE, "utf-8")); } catch { /* none yet */ }
  modelHealthCache = { data, at: now };
  return data;
}

function recordModelOutcome(model: string, ok: boolean): void {
  const data = readModelHealth();
  const h = data[model] ?? { fails: 0, ok: 0, lastFail: 0 };
  if (ok) {
    h.ok += 1;
    if (h.fails > 0) h.fails -= 1; // reward recovery: successes slowly forgive past fails
  } else {
    h.fails += 1;
    h.lastFail = Date.now();
  }
  data[model] = h;
  modelHealthCache = { data, at: Date.now() };
  try { fs.writeFileSync(MODEL_HEALTH_FILE, JSON.stringify(data)); } catch { /* ignore */ }
}

/** Unreliability score: higher = sink lower. Recent failures weigh double. */
function unreliability(model: string): number {
  const h = readModelHealth()[model];
  if (!h) return 0;
  const total = h.fails + h.ok;
  const ratio = total > 0 ? h.fails / total : 0;
  const recent = h.lastFail && Date.now() - h.lastFail < 60 * 60_000 ? 2 : 1;
  return (ratio * 10 + Math.min(h.fails, 5)) * recent;
}

/** Stable-sort so chronically-failing models drop to the bottom; ties keep the
 *  curated/refresh order (capability ranking) intact. */
function demoteFlaky(models: string[]): string[] {
  return models
    .map((m, i) => ({ m, i, u: unreliability(m) }))
    .sort((a, b) => a.u - b.u || a.i - b.i)
    .map((x) => x.m);
}

// ── Budget tracking ($100/month cap) ───────────────────────────────────
// Tracks estimated cost per provider per month. Persisted to disk so it
// survives container restarts. When budget exceeded, provider is skipped.
// The DAILY cap (AI_DAILY_SPEND_CAP_AUD, lib/ai/spend-guard.ts) is the
// finer-grained brake for the paid tiers; this monthly figure is the hard stop.

const MONTHLY_BUDGET_USD = 100;
const BUDGET_FILE = "/tmp/blockid-ai-budget.json";

// Rough cost estimates per 1K tokens (input+output averaged). Anthropic
// first-party list prices (Sep 2026): Haiku 4.5 $1/$5, Sonnet 5 $2/$10,
// Opus 5 $5/$25 per 1M; cache reads 10 %. The Anthropic tier reports REAL
// usage, so those calls are tracked from `usage`, not from this table.
const COST_PER_1K: Record<string, number> = {
  "claude-haiku-4-5": 0.003,           // $1 in + $5 out per 1M ≈ $0.003/1K blended
  "claude-haiku-4-5-20251001": 0.003,  // dated alias (ANTHROPIC_HAIKU_API_KEY path)
  "claude-sonnet-5": 0.006,            // $2 in + $10 out per 1M
  "claude-opus-5": 0.015,              // $5 in + $25 out per 1M
  "gpt-4o-mini": 0.0003,
  "o3-mini": 0.0055,
  "gpt-4.1-mini": 0.002,
  // Gemini (PAID, quality-cost tier for report classes — S32-C, verified 2026-09-15)
  "gemini-2.5-flash": 0.0014,        // $0.30 in / $2.50 out per 1M averaged
  "gemini-2.5-flash-lite": 0.00025,  // $0.10 / $0.40
  "gemini-2.5-pro": 0.0056,          // $1.25 / $10
  "gemini-3-flash-preview": 0.0014,  // preview — billed as 2.5 Flash
  "gemini-3.1-pro-preview": 0.0056,  // preview — billed as 2.5 Pro
  "gemini-3.1-flash-lite": 0.00025,  // billed as 2.5 Flash-Lite
  // DeepInfra (PAID, quality-cost tier — prices verified on the box 2026-09-15)
  "deepseek-ai/DeepSeek-V4-Flash": 0.000135,           // $0.09 / $0.18, 1M ctx
  "deepseek-ai/DeepSeek-V3.2": 0.00032,                // $0.26 / $0.38, 164k ctx
  "Qwen/Qwen3-235B-A22B-Instruct-2507": 0.00032,       // $0.09 / $0.55
  "meta-llama/Llama-3.3-70B-Instruct-Turbo": 0.00021,  // $0.10 / $0.32
  "moonshotai/Kimi-K2.6": 0.0021,                      // $0.75 / $3.50
  "deepseek-ai/DeepSeek-V4-Pro": 0.00195,              // $1.30 / $2.60
  // NOTE: "openai/gpt-oss-120b" is ALSO a Groq free-tier id (0 below); the
  // DeepInfra call reports its real usage cost via PAID_PRICING_USD_PER_1M.
  "llama-3.3-70b-versatile": 0,  // Groq free tier — verified live in Groq docs (Sep 2026): 280 t/s, 131K ctx, 32K max out
  "inclusionai/ling-3.0-flash-fin:free": 0, // OpenRouter free — 124B MoE, 262K ctx, finance-tuned (matches BlockID domain)
  "liquid/lfm-2.5-2.6b:free": 0, // OpenRouter free — Liquid AI 2.6B, 65K ctx, ultra-fast small-model fallback
  "qwen/qwen3.6-27b": 0,        // Groq free tier (Aug 2026 — top of discovery)
  "openai/gpt-oss-120b": 0,     // Groq free tier
  "openai/gpt-oss-20b": 0,      // Groq free tier
  "llama-3.1-8b-instant": 0,    // Groq free tier
  "groq/compound": 0,            // Groq compound model
  "groq/compound-mini": 0,       // Groq compound-mini
  // Cerebras free tier
  "llama-3.3-70b": 0,
  "llama-3.1-8b": 0,
  "gemma-4-31b": 0,           // Cerebras: 1424 ok in prod — most reliable model
  "zai-glm-4.7": 0,           // Cerebras: zero cost (but high fail rate — demoted by health)
  // SambaNova free tier (model IDs as of Aug 2026)
  "DeepSeek-V3.1": 0,                        // SambaNova: newest DeepSeek V3 checkpoint
  "DeepSeek-V3.2": 0,                        // SambaNova: latest DeepSeek V3 checkpoint
  "DeepSeek-V3-0324": 0,                     // SambaNova: latest DeepSeek V3 alias
  "DeepSeek-R1": 0,                          // SambaNova: DeepSeek R1 reasoning model
  "Meta-Llama-3.3-70B-Instruct": 0,
  "Meta-Llama-3.1-405B-Instruct": 0,         // SambaNova: Llama 3.1 405B — largest Llama
  "Qwen2.5-72B-Instruct": 0,
  "Qwen3-235B-A22B": 0,                      // SambaNova: Qwen3 235B MoE
  "Meta-Llama-3.1-8B-Instruct": 0,
  "Llama-4-Maverick-17B-128E-Instruct": 0,   // SambaNova: Llama 4 Maverick
  "Llama-4-Scout-17B-16E-Instruct": 0,       // SambaNova: Llama 4 Scout
  "gpt-oss-120b": 0,                         // SambaNova: available as of Aug 2026 discovery
  "gemma-4-31B-it": 0,                       // SambaNova: Gemma 4 31B instruct
  // Groq free tier (additional strong models)
  "deepseek-r1-distill-llama-70b": 0,        // Groq: DeepSeek R1 distill 70B
  "qwen-qwq-32b": 0,                         // Groq: QwQ 32B reasoning
  "llama3-70b-8192": 0,                      // Groq: Llama 3 70B legacy
  "mixtral-8x7b-32768": 0,                   // Groq: Mixtral 8x7B
  // OpenRouter free models — all $0 cost
  "google/gemini-2.5-flash:free": 0,
  "deepseek/deepseek-r1:free": 0,
  "deepseek/deepseek-v3:free": 0,
  "meta-llama/llama-4-maverick:free": 0,
  "qwen/qwen3-235b-a22b:free": 0,
  "moonshotai/kimi-k2:free": 0,
  "meta-llama/llama-4-scout:free": 0,
  "nvidia/llama-3.1-nemotron-ultra-253b-v1:free": 0,
  "microsoft/phi-4-reasoning-plus:free": 0,
  "tngtech/deepseek-r1t-chimera:free": 0,
  "google/gemma-3-27b-it:free": 0,
  "mistralai/mistral-small-3.2-24b-instruct:free": 0,
  "deepseek/deepseek-chat-v3.1:free": 0, // OpenRouter free — S-tier reasoning, 20 RPM
  "qwen-3-32b": 0,                         // Cerebras free — 32B, 2000 t/s, Vietnamese-friendly
  "Qwen3-235B-A22B-Instruct-2507": 0,      // SambaNova free — 235B MoE, competes with Claude
  // Paid tier — DeepInfra ($0.32 in / $0.89 out per 1M for DeepSeek V3):
  "deepseek-ai/DeepSeek-V3": 0.00061,
  "meta-llama/Meta-Llama-3.3-70B-Instruct": 0.00021,
  "Qwen/Qwen2.5-72B-Instruct": 0.00027,
  // Legacy OpenRouter entries (kept for health record continuity)
  "nvidia/nemotron-3-ultra-550b-a55b:free": 0,
  "deepseek/deepseek-v4-flash:free": 0,
  "qwen/qwen3-coder:free": 0,
  "nvidia/nemotron-3-super-120b-a12b:free": 0,
  "openrouter/owl-alpha": 0,
  "openai/gpt-oss-120b:free": 0,
  "openai/gpt-oss-20b:free": 0,
  "moonshotai/kimi-k2.6:free": 0,
  "qwen/qwen3-next-80b-a3b-instruct:free": 0,
  "google/gemma-4-31b-it:free": 0,
  "google/gemma-4-26b-a4b-it:free": 0,
  "poolside/laguna-m.1:free": 0,
  "poolside/laguna-s-2.1:free": 0,
  "poolside/laguna-xs.2:free": 0,
  "nvidia/nemotron-3-nano-30b-a3b:free": 0,
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": 0,
  "nvidia/nemotron-3.5-lightning:free": 0,
  "minimax/minimax-m2.5:free": 0,
  "meta-llama/llama-3.3-70b-instruct:free": 0,
  "z-ai/glm-4.5-air:free": 0,
  "nousresearch/hermes-3-llama-3.1-405b:free": 0,
  "nvidia/nemotron-nano-12b-v2-vl:free": 0,
  "nvidia/nemotron-nano-9b-v2:free": 0,
  "meta-llama/llama-3.2-3b-instruct:free": 0,
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free": 0,
  "liquid/lfm-2.5-1.2b-thinking:free": 0,
  "liquid/lfm-2.5-1.2b-instruct:free": 0,
  // Image generation models
  "gemini-2.5-flash-preview-image-generation": 0,  // Free with API key
  "google/gemini-2.5-flash-preview-image-generation": 0,
  "google/gemini-3.1-flash-image-preview": 0.0001,
  "gpt-image-1": 0.04,              // ~$0.04 per standard image
  "x-ai/grok-imagine-image-quality": 0.05,
};

/** USD per 1M tokens for the quality-cost providers, keyed `provider:model`
 *  (a model id like `openai/gpt-oss-120b` exists on both Groq (free) and
 *  DeepInfra (paid), so the provider is part of the key). Used to turn the
 *  provider's real `usage` into the exact cost recorded in the daily ledger. */
export const PAID_PRICING_USD_PER_1M: Record<string, { in: number; out: number }> = {
  // DeepInfra — verified 2026-09-15
  "deepinfra:deepseek-ai/DeepSeek-V4-Flash": { in: 0.09, out: 0.18 },
  "deepinfra:deepseek-ai/DeepSeek-V3.2": { in: 0.26, out: 0.38 },
  "deepinfra:Qwen/Qwen3-VL-235B-A22B-Instruct": { in: 0.20, out: 0.88 },
  "deepinfra:Qwen/Qwen3-235B-A22B-Instruct-2507": { in: 0.09, out: 0.55 },
  "deepinfra:openai/gpt-oss-120b": { in: 0.037, out: 0.17 },
  "deepinfra:meta-llama/Llama-3.3-70B-Instruct-Turbo": { in: 0.10, out: 0.32 },
  "deepinfra:moonshotai/Kimi-K2.6": { in: 0.75, out: 3.50 },
  "deepinfra:deepseek-ai/DeepSeek-V4-Pro": { in: 1.30, out: 2.60 },
  // Gemini — list prices; previews billed as their GA sibling
  "gemini:gemini-2.5-flash": { in: 0.30, out: 2.50 },
  "gemini:gemini-2.5-flash-lite": { in: 0.10, out: 0.40 },
  "gemini:gemini-2.5-pro": { in: 1.25, out: 10 },
  "gemini:gemini-3-flash-preview": { in: 0.30, out: 2.50 },
  "gemini:gemini-3.1-pro-preview": { in: 1.25, out: 10 },
  "gemini:gemini-3.1-flash-lite": { in: 0.10, out: 0.40 },
};

/** Exact USD for a call from the provider's reported usage; null when the
 *  model has no price row (the caller then falls back to the COST_PER_1K
 *  estimate). */
export function usageCostUsd(provider: string, model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PAID_PRICING_USD_PER_1M[`${provider}:${model}`];
  if (!price) return null;
  const usd = (inputTokens / 1_000_000) * price.in + (outputTokens / 1_000_000) * price.out;
  return Math.round(usd * 1e8) / 1e8;
}

interface BudgetData {
  month: string; // "2026-05"
  totalUSD: number;
  calls: number;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function readBudget(): BudgetData {
  try {
    const raw = fs.readFileSync(BUDGET_FILE, "utf-8");
    const data: BudgetData = JSON.parse(raw);
    if (data.month !== currentMonth()) {
      return { month: currentMonth(), totalUSD: 0, calls: 0 };
    }
    return data;
  } catch {
    return { month: currentMonth(), totalUSD: 0, calls: 0 };
  }
}

function writeBudget(data: BudgetData): void {
  try {
    fs.writeFileSync(BUDGET_FILE, JSON.stringify(data));
  } catch { /* ignore write errors */ }
}

function trackCost(model: string, estimatedTokens: number, exactUsd?: number): void {
  const costPer1K = COST_PER_1K[model] ?? 0.001;
  const cost = typeof exactUsd === "number" && Number.isFinite(exactUsd) ? exactUsd : (estimatedTokens / 1000) * costPer1K;
  const budget = readBudget();
  budget.totalUSD += cost;
  budget.calls += 1;
  writeBudget(budget);
}

function isBudgetExceeded(): boolean {
  return readBudget().totalUSD >= MONTHLY_BUDGET_USD;
}

// ── Types ──────────────────────────────────────────────────────────────

interface OAuthCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };
}

export type AIReportPolicy = "blockid-report-v1";

function scopedReportPolicy(opts: AICallOptions): boolean {
  if (opts.policy === undefined) return false;
  if (opts.policy !== "blockid-report-v1") throw new Error("Unknown AI report policy");
  return true;
}

export interface AICallOptions {
  /** Trusted server callsite only; never copy this field from request input. */
  policy?: AIReportPolicy;
  system: string;
  user: string;
  /** Prepared private PNGs, trusted server callsites only. Requires a shared report budget. */
  visionImages?: readonly Buffer[];
  maxTokens?: number;
  /** Sampling temperature (0-1). Provider-specific defaults apply if omitted. */
  temperature?: number;
  /** Worker subprocess timeout in ms. Default 30s. Use 180_000 for long reports. */
  timeoutMs?: number;
  /** Tools for Claude (e.g. web_search). Ignored by OpenAI/Gemini. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any[];
  /** Logical caller id (e.g. "cfo", "cdo", "svi-scoring"). Used by the per-agent
   *  semaphore so one caller's burst can't hog the whole provider pool. Omit for
   *  ad-hoc calls — they share a generic "default" bucket. */
  agentId?: string;
  /** S31-A — routes the Anthropic quality tier: `classify` → Haiku 4.5,
   *  `report` (default) → Sonnet 5, `synthesis` → Opus 5. Inferred from
   *  agentId / maxTokens when omitted (lib/ai/anthropic-tier.ts). */
  taskClass?: AITaskClass;
  /** S31-A — per-user fairness: at most AI_MAX_PER_USER (2) calls in flight
   *  per user; extra calls queue briefly, then 503 (AICapacityError). */
  userId?: string;
  /** S31-A — `background` (crons, self-upgrade) yields to `user` traffic:
   *  it only takes a slot while user work is not waiting and a reserve of
   *  slots stays free. Default `user`. */
  priority?: "user" | "background";
  /** S32-F — the caller is waiting synchronously (a request/response route
   *  behind nginx's 310 s and Cloudflare's 100 s walls). Providers are
   *  re-ordered by THROUGHPUT for this call — `INTERACTIVE_PROVIDER_ORDER`
   *  (Groq ≈ 500 t/s, Cerebras ≈ 2000 t/s, then the quality-cost tiers) —
   *  and `timeoutMs` defaults to INTERACTIVE_TIMEOUT_MS. The Money Finder
   *  narrative (1,600 tokens) took 60–90 s on DeepSeek-V4-Flash after S32-C
   *  and timed out the client; on Groq it is ≈ 5 s. Background jobs (first
   *  analysis, crons) keep the quality-first order. */
  interactive?: boolean;
  /** Post-ship review 2026-09-17 — total WALL-CLOCK budget for this call
   *  across every provider AND every model inside a provider's ladder.
   *  `timeoutMs` is per attempt: DeepInfra alone tried four models × 30 s
   *  (Worker timeout) on one Money Finder narrative = 120 s, past
   *  Cloudflare's 100 s wall → 524 with the template fallback never
   *  reached. Defaults to max(INTERACTIVE_BUDGET_MS, timeoutMs) for
   *  `interactive` calls; omitted (unbounded) otherwise. When it runs out the call throws
   *  `AIBudgetExhaustedError` and no further attempt is started. */
  budgetMs?: number;
  /** @internal absolute deadline derived from `budgetMs` (epoch ms). */
  deadlineAt?: number;
  /** G28-B — run-scoped provider strikes (lib/ai/run-strikes.ts). One ledger
   *  per report-pipeline run: a provider that answered ≥ 2 worker timeouts /
   *  `engine_overloaded` / 429 during the run is skipped for the rest of it —
   *  inside its model ladder (no third model) and in every later call's
   *  provider loop — on top of the process-wide cooldown, which only fires
   *  after the whole ladder failed. Omitted → no run scoping (crons, chat). */
  runStrikes?: RunStrikeSink;
  /** Trusted durable coordinator, mandatory for research agents. Never sourced from request JSON. */
  attemptBudget?: ResearchAttemptBudget;
}

/** True when the run ledger says `provider` is struck out for this run. */
export function runStruck(opts: Pick<AICallOptions, "runStrikes">, provider: Provider): boolean {
  return Boolean(opts.runStrikes?.struck(provider));
}

/** Count a ladder / provider failure against the run ledger (idempotent per error object). */
export function noteRunStrike(opts: Pick<AICallOptions, "runStrikes">, provider: Provider, err: unknown): void {
  const kind = opts.runStrikes?.note(provider, err) ?? null;
  if (kind && opts.runStrikes?.struck(provider)) {
    console.warn(`[ai-client:run-strike] ${provider} struck out for this run (${opts.runStrikes.strikes(provider)} × ${kind === "timeout" ? "worker timeout" : "overloaded / 429"}) — skipped until the run ends`);
  }
}

function runStruckError(opts: Pick<AICallOptions, "runStrikes">, provider: Provider): RunStruckError {
  return new RunStruckError(provider, opts.runStrikes?.strikes(provider) ?? 0);
}

/** Total budget for an `interactive` call — under Cloudflare's 100 s wall
 *  with room for the caller's own fallback work. */
export const INTERACTIVE_BUDGET_MS = Number(process.env.AI_INTERACTIVE_BUDGET_MS ?? 60_000);

export class AIBudgetExhaustedError extends Error {
  constructor(budgetMs: number) {
    super(`AI call budget exhausted (${Math.round(budgetMs / 1000)}s across providers)`);
    this.name = "AIBudgetExhaustedError";
  }
}

/** True once the call's wall-clock budget is gone — model ladders and the
 *  provider loop stop starting attempts. Pure on `opts.deadlineAt`. */
export function aiBudgetExpired(opts: Pick<AICallOptions, "deadlineAt">): boolean {
  return typeof opts.deadlineAt === "number" && Date.now() >= opts.deadlineAt;
}

/** Per-attempt timeout clamped to what is left of the call budget (min 1 s
 *  so a nearly-spent budget still fails fast instead of hanging). */
export function budgetedTimeoutMs(opts: Pick<AICallOptions, "timeoutMs" | "deadlineAt">, fallback = 30_000): number {
  const base = opts.timeoutMs ?? fallback;
  if (typeof opts.deadlineAt !== "number") return base;
  return Math.max(1_000, Math.min(base, opts.deadlineAt - Date.now()));
}

/** Throughput ranking for `interactive` calls (fastest usable first); any
 *  configured provider missing here is appended in its class order. */
export const INTERACTIVE_PROVIDER_ORDER: Provider[] = ["groq", "cerebras", "gemini", "deepinfra", "claude-apikey", "sambanova", "claude-oauth", "openrouter", "ollama"];
export const INTERACTIVE_TIMEOUT_MS = Number(process.env.AI_INTERACTIVE_TIMEOUT_MS ?? 30_000);

/** First candidate (in the given order) that is not blocked and has headroom;
 *  else the first merely-cooling one; else null. Used for interactive calls. */
export function pickFirstUsable(candidates: Provider[]): Provider | null {
  const now = Date.now();
  const usable = candidates.filter((p) => providerBlockReason(p, now) === null);
  const withRoom = usable.find((p) => providerCapacity(p) > 0);
  if (withRoom) return withRoom;
  if (usable.length > 0) return usable[0];
  return candidates.find((p) => providerBlockReason(p, now) === "cooldown") ?? null;
}

/** Re-order a class candidate list for an interactive caller. Pure. */
export function orderForInteractive(candidates: Provider[]): Provider[] {
  const rank = new Map(INTERACTIVE_PROVIDER_ORDER.map((p, i) => [p, i] as const));
  return [...candidates].sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
}

export interface AICallUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface AICallResult {
  /** Applied dispatcher policy; omitted for legacy/shared consumers. */
  policy?: AIReportPolicy;
  text: string;
  /** Coarse family (kept for compatibility — Cerebras / SambaNova / DeepInfra
   *  report "groq" because they speak the same OpenAI-compatible dialect).
   *  Use `via` for the truthful dispatcher provider. */
  provider: "claude" | "openai" | "gemini" | "groq" | "openrouter" | "ollama";
  model: string;
  /** S32-C — the dispatcher provider that actually served the call
   *  (`deepinfra`, `gemini`, `claude-oauth`, …). Set by `callAI()`. */
  via?: AIProviderId;
  /** The task class the call was routed as. Set by `callAI()`. */
  taskClass?: AITaskClass;
  /** Real token usage when the provider reports it (Anthropic API tier). */
  usage?: AICallUsage;
  /** Estimated USD for this call (0 for free tiers). */
  cost_usd?: number;
}

// ── Claude CLI OAuth ───────────────────────────────────────────────────

function readCliOAuthToken(): string | null {
  try {
    const home = process.env.HOME ?? "/root";
    const credPath = path.join(home, ".claude", ".credentials.json");
    const raw = fs.readFileSync(credPath, "utf-8");
    const creds: OAuthCredentials = JSON.parse(raw);
    const oauth = creds.claudeAiOauth;
    if (!oauth?.accessToken) return null;
    if (oauth.expiresAt && Date.now() > oauth.expiresAt - 5 * 60 * 1000) return null;
    return oauth.accessToken;
  } catch {
    return null;
  }
}

// ── Provider detection ─────────────────────────────────────────────────

type Provider = "claude-oauth" | "claude-apikey" | "claude-haiku-direct" | "claude-proxy" | "openai-apikey" | "gemini" | "groq" | "openrouter" | "cerebras" | "sambanova" | "deepinfra" | "ollama" | "none";
/** Public alias of the dispatcher's provider id (what `AICallResult.via` carries). */
export type AIProviderId = Provider;

const ALL_PROVIDER_IDS: readonly Provider[] = [
  "claude-apikey", "claude-oauth", "claude-haiku-direct", "claude-proxy", "openai-apikey",
  "gemini", "groq", "openrouter", "cerebras", "sambanova", "deepinfra", "ollama",
];

/** Is this provider configured (env key, DB key, OAuth file, local host)? */
function providerConfigured(p: Provider): boolean {
  switch (p) {
    // G25-B: the key is optional — absent / placeholder = the tier does not exist for this process.
    case "claude-apikey": return isAnthropicApiKeyConfigured() || isAnthropicApiKeyConfigured(getDBKey("anthropic")?.api_key);
    case "claude-oauth": return readCliOAuthToken() !== null;
    case "claude-haiku-direct": return Boolean(process.env.ANTHROPIC_HAIKU_API_KEY || getDBKey("anthropic_haiku"));
    case "claude-proxy":
      return Boolean((process.env.ANTHROPIC_PROXY_API_KEY && process.env.ANTHROPIC_PROXY_BASE_URL) || getDBKey("anthropic_proxy"));
    case "openai-apikey": return false; // not wired (no key policy) — see header
    case "gemini": return Boolean(process.env.GOOGLE_GEMINI_API_KEY || getDBKey("gemini"));
    case "groq": return Boolean(process.env.GROQ_API_KEY || getDBKey("groq"));
    case "openrouter": return Boolean(process.env.OPENROUTER_API_KEY || getDBKey("openrouter"));
    case "cerebras": return Boolean(process.env.CEREBRAS_API_KEY || getDBKey("cerebras"));
    case "sambanova": return Boolean(process.env.SAMBANOVA_API_KEY || getDBKey("sambanova"));
    case "deepinfra": return Boolean(process.env.DEEPINFRA_API_KEY || getDBKey("deepinfra"));
    case "ollama": return Boolean(process.env.OLLAMA_HOST || process.env.OLLAMA_ENABLED === "true");
    default: return false;
  }
}

// ──────────────────────────────────────────────────────────────────────
// POLICY (S32-C, 2026-09-15): provider ORDER by task class. See the file
// header for the rationale. The order is the tiebreak inside a tier; the
// tier ranking (`providerTier`) and live capacity do the real picking in
// `pickBestProvider`.
//
// report / synthesis — quality first, cheapest that is still report-grade:
//   claude-apikey → deepinfra → gemini → claude-oauth (fallback only) →
//   groq → sambanova → cerebras → openrouter → haiku-direct → proxy → ollama
// classify — cheap first:
//   claude-apikey (Haiku) → groq → cerebras → sambanova → openrouter → ollama
//   → gemini (flash-lite) → deepinfra (gpt-oss-120b) → claude-oauth → haiku-direct → proxy
// ──────────────────────────────────────────────────────────────────────
const REPORT_PROVIDER_ORDER: readonly Provider[] = [
  "claude-apikey", "deepinfra", "gemini", "claude-oauth",
  "groq", "sambanova", "cerebras", "openrouter",
  "claude-haiku-direct", "claude-proxy", "ollama",
];
const CLASSIFY_PROVIDER_ORDER: readonly Provider[] = [
  "claude-apikey", "groq", "cerebras", "sambanova", "openrouter", "ollama",
  "gemini", "deepinfra", "claude-oauth", "claude-haiku-direct", "claude-proxy",
];

/** Parse `AI_REPORT_PROVIDER_ORDER` ("deepinfra, gemini,-claude-oauth"):
 *  listed providers first in the given order, unknown names ignored, a
 *  leading `-` drops a provider, and everything not mentioned follows in
 *  the default order. Returns null when the variable is unset / empty. */
export function parseProviderOrderOverride(raw: string | undefined, defaults: readonly Provider[] = REPORT_PROVIDER_ORDER): Provider[] | null {
  if (!raw || !raw.trim()) return null;
  const known = new Set<string>(ALL_PROVIDER_IDS);
  const ordered: Provider[] = [];
  const dropped = new Set<Provider>();
  for (const token of raw.split(",")) {
    const t = token.trim().toLowerCase();
    if (!t) continue;
    const drop = t.startsWith("-");
    const name = (drop ? t.slice(1) : t).trim() as Provider;
    if (!known.has(name)) continue;
    if (drop) { dropped.add(name); continue; }
    if (!ordered.includes(name)) ordered.push(name);
  }
  for (const p of defaults) if (!ordered.includes(p) && !dropped.has(p)) ordered.push(p);
  const out = ordered.filter((p) => !dropped.has(p));
  return out.length > 0 ? out : null;
}

/** True when the founder has re-ordered the report chain via env — the
 *  dispatcher then honours that order STRICTLY (position = rank) instead of
 *  the tier ranking, so "groq before deepinfra" really means that. */
function reportOrderOverridden(): boolean {
  return parseProviderOrderOverride(process.env.AI_REPORT_PROVIDER_ORDER) !== null;
}

/** The ideal provider order for a task class, before checking keys. */
export function providerOrderForClass(cls: AITaskClass): Provider[] {
  if (cls === "classify") return [...CLASSIFY_PROVIDER_ORDER];
  return parseProviderOrderOverride(process.env.AI_REPORT_PROVIDER_ORDER) ?? [...REPORT_PROVIDER_ORDER];
}

/** Configured providers in the order the class wants them tried. */
export function getAvailableProviders(taskClass: AITaskClass = "report"): Provider[] {
  return providerOrderForClass(taskClass).filter(providerConfigured);
}

export function isAIConfigured(): boolean {
  return getAvailableProviders().length > 0;
}

// ── Claude call ────────────────────────────────────────────────────────

/** Claude subscription OAuth token (~/.claude/.credentials.json). Raw fetch:
 *  the token goes on `Authorization: Bearer`, not `x-api-key`. Model by task
 *  class (Haiku 4.5 / Sonnet 5 / Opus 5 — same map as the API tier). This is
 *  a personal Max credential: a FALLBACK in the report chain, never primary. */
async function callClaudeOAuth(apiKey: string, opts: AICallOptions, cls: AITaskClass = "report"): Promise<AICallResult> {
  const model = modelForTaskClass(cls);
  const raw = await workerFetch("https://api.anthropic.com/v1/messages", {
    "Authorization": `Bearer ${apiKey}`,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "oauth-2025-04-20",
    "Content-Type": "application/json",
  }, JSON.stringify({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
  }), budgetedTimeoutMs(opts));
  const data = JSON.parse(raw);
  let text = "";
  for (const block of (data.content ?? [])) {
    if (block.type === "text") text += block.text;
  }
  if (!text) throw new Error("Empty Claude (OAuth) response");
  return { text, provider: "claude", model, cost_usd: 0 };
}

/** Anthropic API key — the quality tier via the official SDK (lib/ai/anthropic-tier.ts). */
async function callClaudeApiKey(opts: AICallOptions): Promise<AICallResult> {
  // Env first (trimmed — the predicate trims, the SDK must see the same value), DB key second.
  const envKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  const apiKey = isAnthropicApiKeyConfigured(envKey) ? envKey : (getDBKey("anthropic")?.api_key ?? "").trim();
  if (!isAnthropicApiKeyConfigured(apiKey)) throw new Error("Anthropic API key not configured — Claude CLI subscription is the fallback");
  const r = await callAnthropicTier(opts, { apiKey });
  return { text: r.text, provider: "claude", model: r.model, usage: r.usage, cost_usd: r.cost_usd };
}

// ── OpenAI call (API key) ──────────────────────────────────────────────

async function callOpenAI(apiKey: string, opts: AICallOptions): Promise<AICallResult> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });

  const model = "gpt-4o-mini";

  const response = await client.chat.completions.create({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "";
  return { text, provider: "openai", model };
}

// ── Gemini call (PAID, quality-cost tier — S32-C) ─────────────────────
// GOOGLE_GEMINI_API_KEY verified 2026-09-15. Model by task class:
//   report    → gemini-3-flash-preview → gemini-2.5-flash
//   synthesis → gemini-3.1-pro-preview → gemini-2.5-pro
//   classify  → gemini-2.5-flash-lite
// The key travels in the `x-goog-api-key` header (never the URL, so it can
// never land in a log line). 429 / RESOURCE_EXHAUSTED cools the model down
// like every other provider; `usageMetadata` feeds the exact cost.

export const GEMINI_MODELS_BY_CLASS: Record<AITaskClass, string[]> = {
  report: ["gemini-3-flash-preview", "gemini-2.5-flash"],
  synthesis: ["gemini-3.1-pro-preview", "gemini-2.5-pro"],
  classify: ["gemini-2.5-flash-lite"],
};

/** Per-provider cooldown key — DeepInfra and Groq share model ids
 *  (`openai/gpt-oss-120b`), so paid providers key their cooldown / health
 *  records by `provider:model` to avoid cross-provider cool-downs. */
function paidKey(provider: "deepinfra" | "gemini", model: string): string {
  return `${provider}:${model}`;
}

function readyPaidModels(provider: "deepinfra" | "gemini", models: string[]): string[] {
  // G29-A: a dead rung (402 / 404 in the last 24 h) is never dialled.
  const strikes = currentStrikes();
  const at = new Date();
  const alive = models.filter((m) => !isDeadRung(strikes, provider, m, at));
  if (alive.length === 0) return [];
  const ready = alive.filter((m) => modelReady(paidKey(provider, m)));
  const list = ready.length > 0 ? ready : alive;
  return demoteFlaky(list.map((m) => paidKey(provider, m))).map((k) => k.slice(provider.length + 1));
}

async function callGemini(opts: AICallOptions, cls: AITaskClass = "report"): Promise<AICallResult> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY ?? getDBKey("gemini")?.api_key ?? "";
  if (!apiKey) throw new Error("Gemini API key not configured");

  let lastErr: Error | null = null;
  const geminiRungs = readyPaidModels("gemini", GEMINI_MODELS_BY_CLASS[cls]);
  if (geminiRungs.length === 0) throw new DeadLadderError("gemini", GEMINI_MODELS_BY_CLASS[cls].length);
  for (const model of geminiRungs) {
    if (aiBudgetExpired(opts)) { lastErr = lastErr ?? new AIBudgetExhaustedError(opts.budgetMs ?? 0); break; }
    if (runStruck(opts, "gemini")) { lastErr = lastErr ?? runStruckError(opts, "gemini"); break; }
    const key = paidKey("gemini", model);
    try {
      // workerFetch bypasses Next.js fetch patches (same as Claude/Groq)
      const raw = await workerFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        JSON.stringify({
          system_instruction: { parts: [{ text: opts.system }] },
          contents: [{ role: "user", parts: [{ text: opts.user }] }],
          generationConfig: {
            maxOutputTokens: opts.maxTokens ?? 4096,
            ...(typeof opts.temperature === "number" ? { temperature: opts.temperature } : {}),
          },
        }),
        budgetedTimeoutMs(opts),
      );

      const data = JSON.parse(raw);
      if (data.error) {
        const status = data.error.status ?? "";
        throw new Error(`${status ? `${status} ` : ""}${data.error.message ?? "Gemini error"}`);
      }
      const parts: Array<{ text?: string }> = data.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p) => p.text ?? "").join("");
      if (!text) throw new Error("Empty Gemini response");
      const um = data.usageMetadata ?? {};
      const input = Number(um.promptTokenCount ?? 0);
      const output = Number(um.candidatesTokenCount ?? 0) + Number(um.thoughtsTokenCount ?? 0);
      const cost = usageCostUsd("gemini", model, input, output);
      recordModelOutcome(key, true);
      clearDeadRung("gemini", model);
      return {
        text,
        provider: "gemini",
        model,
        usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: Number(um.cachedContentTokenCount ?? 0), cache_creation_input_tokens: 0 },
        ...(cost !== null ? { cost_usd: cost } : {}),
      };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      // RESOURCE_EXHAUSTED is Google's 429 — the shared regex reads "quota".
      const msg = /resource_exhausted/i.test(lastErr.message) ? `429 quota ${lastErr.message}` : lastErr.message;
      coolDownModel(key, msg);
      noteDeadRung("gemini", model, lastErr.message);
      noteRunStrike(opts, "gemini", lastErr);
      console.warn(`[ai-client] Gemini ${model} failed: ${lastErr.message.slice(0, 200)}`);
    }
  }
  throw lastErr ?? new Error("All Gemini models failed");
}

// ── Groq (OpenAI-compatible, free tier, llama-3.3-70b) ────────────────

// Groq models ranked by Sep 2026 official docs + prod health data:
// llama-3.3-70b-versatile re-added — Groq's own docs list it as production-grade
// (280 t/s, 131K ctx). Kept below qwen3.6 while cooldown/health prove it out again.
const GROQ_DEFAULT_MODELS: string[] = [
  "qwen/qwen3.6-27b",          // A-tier: Qwen3 27B, top of Aug 2026 discovery
  "openai/gpt-oss-120b",       // A-tier: 117B MoE, best quality when available
  "llama-3.3-70b-versatile",   // B-tier: 70B, 280 t/s — re-verified in Groq docs (Sep 2026)
  "llama-3.1-8b-instant",      // C-tier: 8B, 560 t/s — most reliable in prod (76 ok)
  "openai/gpt-oss-20b",        // C-tier: 20B, fast fallback
];

async function callGroq(opts: AICallOptions, cls: AITaskClass = "classify"): Promise<AICallResult> {
  const apiKey = process.env.GROQ_API_KEY ?? getDBKey("groq")?.api_key ?? "";
  if (!apiKey) throw new Error("Groq API key not configured");

  const GROQ_MODELS = getDynamicModels("groq", GROQ_DEFAULT_MODELS);

  let lastErr: Error | null = null;
  const groqRungs = readyModels("groq", GROQ_MODELS, cls);
  if (groqRungs.length === 0) throw new DeadLadderError("groq", GROQ_MODELS.length);
  for (const model of groqRungs) {
    if (aiBudgetExpired(opts)) { lastErr = lastErr ?? new AIBudgetExhaustedError(opts.budgetMs ?? 0); break; }
    if (runStruck(opts, "groq")) { lastErr = lastErr ?? runStruckError(opts, "groq"); break; }
    try {
      const raw = await workerFetch("https://api.groq.com/openai/v1/chat/completions", {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      }, JSON.stringify({
        model,
        max_tokens: Math.min(opts.maxTokens ?? 4096, 8000), // Groq free limit
        temperature: opts.temperature ?? 0.7,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }), budgetedTimeoutMs(opts));

      const data = JSON.parse(raw);
      if (data.error) throw new Error(data.error.message ?? "Groq error");
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("Empty Groq response");
      recordModelOutcome(model, true);
      clearDeadRung("groq", model);
      return { text, provider: "groq", model };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      coolDownModel(model, lastErr.message);
      noteDeadRung("groq", model, lastErr.message);
      noteRunStrike(opts, "groq", lastErr);
      console.warn(`[ai-client] Groq ${model} failed: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error("All Groq models failed");
}

// ── Cerebras (OpenAI-compatible, free tier, ultra-fast inference) ─────
// Free: 30 RPM, 60K TPM, ~1M tokens/day. No credit card required.
// API: https://api.cerebras.ai/v1 (OpenAI-compatible)

// Cerebras models ranked by Aug 2026 prod health + discovery:
// gemma-4-31b (1424 ok, 0 fails — most reliable) > gpt-oss-120b (ok:506)
// > llama-3.1-8b (C-tier fallback) > llama-3.3-70b (legacy compat)
// NOTE: "openai/gpt-oss-120b" (Groq-prefixed ID) removed — Cerebras uses "gpt-oss-120b"
// NOTE: "zai-glm-4.7" excluded from defaults — 96 fails, 3 ok (extremely flaky)
// G29-A: on 2026-09-21 gemma-4-31b answered 404 model_archived, qwen-3-32b /
// llama-3.3-70b 404 model_not_found and gpt-oss-120b 402 payment_required —
// the dead-rung table skips them for 24 h after each such answer.
const CEREBRAS_DEFAULT_MODELS: string[] = [
  "gemma-4-31b",             // B-tier: 1424 prod successes — most reliable on Cerebras
  "gpt-oss-120b",            // A-tier: 117B MoE, high throughput when available (ok:506)
  "qwen-3-32b",              // B-tier: Qwen 3 32B, 2000 t/s, Vietnamese-friendly (Sep 2026 add)
  "llama-3.3-70b",           // B-tier: 70B, legacy compat
  "llama-3.1-8b",            // C-tier: 8B ultra-fast fallback
];

async function callCerebras(opts: AICallOptions, cls: AITaskClass = "classify"): Promise<AICallResult> {
  const apiKey = process.env.CEREBRAS_API_KEY ?? getDBKey("cerebras")?.api_key ?? "";
  if (!apiKey) throw new Error("Cerebras API key not configured");

  const CEREBRAS_MODELS = getDynamicModels("cerebras", CEREBRAS_DEFAULT_MODELS);

  let lastErr: Error | null = null;
  const cerebrasRungs = readyModels("cerebras", CEREBRAS_MODELS, cls);
  if (cerebrasRungs.length === 0) throw new DeadLadderError("cerebras", CEREBRAS_MODELS.length);
  for (const model of cerebrasRungs) {
    if (aiBudgetExpired(opts)) { lastErr = lastErr ?? new AIBudgetExhaustedError(opts.budgetMs ?? 0); break; }
    if (runStruck(opts, "cerebras")) { lastErr = lastErr ?? runStruckError(opts, "cerebras"); break; }
    try {
      const raw = await workerFetch("https://api.cerebras.ai/v1/chat/completions", {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      }, JSON.stringify({
        model,
        max_tokens: Math.min(opts.maxTokens ?? 4096, 8192),
        temperature: opts.temperature ?? 0.7,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }), budgetedTimeoutMs(opts));

      const data = JSON.parse(raw);
      if (data.error) throw new Error(data.error.message ?? "Cerebras error");
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("Empty Cerebras response");
      recordModelOutcome(model, true);
      clearDeadRung("cerebras", model);
      return { text, provider: "groq" as const, model }; // reuse "groq" provider type for compat
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      coolDownModel(model, lastErr.message);
      noteDeadRung("cerebras", model, lastErr.message);
      noteRunStrike(opts, "cerebras", lastErr);
      console.warn(`[ai-client] Cerebras ${model} failed: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error("All Cerebras models failed");
}

// ── SambaNova (OpenAI-compatible, free tier, high throughput) ─────────
// Free: ~294 TPS, DeepSeek + Llama + Qwen models. No credit card.
// API: https://api.sambanova.ai/v1 (OpenAI-compatible)

// SambaNova models ranked by Aug 2026 discovery + benchmark intelligence:
// DeepSeek-V3.2/V3.1 (S-tier ~52, newest checkpoints) > gpt-oss-120b (A-tier)
// > gemma-4-31B-it (B-tier) > Meta-Llama-3.3-70B (B-tier) > Meta-Llama-3.1-8B (C-tier)
// NOTE: "DeepSeek-V3-0324" kept last for health record continuity — may still be live
// G29-A: on 2026-09-21 every rung answered 402 PAYMENT_METHOD_REQUIRED
// (balance_units 0) or 404 model_not_found → the provider shows `unfunded`.
const SAMBANOVA_DEFAULT_MODELS: string[] = [
  "DeepSeek-R1",                    // S-tier: strongest free reasoning model on SambaNova
  "Qwen3-235B-A22B-Instruct-2507",  // S-tier: 235B MoE, competes with Claude (Sep 2026 add)
  "DeepSeek-V3.2",                  // S-tier: latest DeepSeek V3 on SambaNova (Aug 2026)
  "DeepSeek-V3.1",                  // S-tier: previous DeepSeek V3 checkpoint
  "gpt-oss-120b",                   // A-tier: OpenAI 117B open-weight on SambaNova
  "gemma-4-31B-it",                 // B-tier: Gemma 4 31B instruct (Aug 2026 discovery)
  "Meta-Llama-3.3-70B-Instruct",    // B-tier: Llama 3.3 70B, reliable general
  "Meta-Llama-3.1-8B-Instruct",     // C-tier: Llama 3.1 8B, fast fallback
  "DeepSeek-V3-0324",               // S-tier: legacy ID — may still be aliased on SambaNova
];

async function callSambaNova(opts: AICallOptions, cls: AITaskClass = "classify"): Promise<AICallResult> {
  const apiKey = process.env.SAMBANOVA_API_KEY ?? getDBKey("sambanova")?.api_key ?? "";
  if (!apiKey) throw new Error("SambaNova API key not configured");

  const SAMBANOVA_MODELS = getDynamicModels("sambanova", SAMBANOVA_DEFAULT_MODELS);

  let lastErr: Error | null = null;
  const sambaRungs = readyModels("sambanova", SAMBANOVA_MODELS, cls);
  if (sambaRungs.length === 0) throw new DeadLadderError("sambanova", SAMBANOVA_MODELS.length);
  for (const model of sambaRungs) {
    if (aiBudgetExpired(opts)) { lastErr = lastErr ?? new AIBudgetExhaustedError(opts.budgetMs ?? 0); break; }
    if (runStruck(opts, "sambanova")) { lastErr = lastErr ?? runStruckError(opts, "sambanova"); break; }
    try {
      const raw = await workerFetch("https://api.sambanova.ai/v1/chat/completions", {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      }, JSON.stringify({
        model,
        max_tokens: Math.min(opts.maxTokens ?? 4096, 8192),
        temperature: opts.temperature ?? 0.7,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }), budgetedTimeoutMs(opts));

      const data = JSON.parse(raw);
      if (data.error) throw new Error(data.error.message ?? "SambaNova error");
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("Empty SambaNova response");
      recordModelOutcome(model, true);
      clearDeadRung("sambanova", model);
      return { text, provider: "groq" as const, model }; // reuse "groq" provider type for compat
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      coolDownModel(model, lastErr.message);
      noteDeadRung("sambanova", model, lastErr.message);
      noteRunStrike(opts, "sambanova", lastErr);
      console.warn(`[ai-client] SambaNova ${model} failed: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error("All SambaNova models failed");
}

// ── DeepInfra (OpenAI-compatible, PAID quality-cost tier — S32-C) ─────
// DEEPINFRA_API_KEY verified 2026-09-15 (194 models). Prices per 1M in/out:
//   DeepSeek-V4-Flash $0.09/$0.18 (1M ctx) · DeepSeek-V3.2 $0.26/$0.38 (164k)
//   Qwen3-235B-A22B-Instruct-2507 $0.09/$0.55 · gpt-oss-120b $0.037/$0.17
//   Llama-3.3-70B-Instruct-Turbo $0.10/$0.32 · Kimi-K2.6 $0.75/$3.50
// Model by task class — quality first, then cheaper, never a weak model for
// a report. API: https://api.deepinfra.com/v1/openai (OpenAI-compatible),
// 200 concurrent. Real `usage` → exact cost in the daily ledger.

// Ladder order is a MEASUREMENT, not a preference (2026-09-23, G30 D-A1/D-A2).
// One real chapter prompt (40 evidence rows, JSON mode, max_tokens 2600) per
// model; `cites` = citations the model attached itself, the proxy for grounding:
//   DeepSeek-V3.2                  20 cites · 20.2s · ~$0.033/report
//   Qwen3-235B-A22B-Instruct-2507  14 cites · 16.4s · ~$0.018/report
//   DeepSeek-V4-Flash               9 cites ·  6.5s · ~$0.011/report
//   gpt-oss-120b                    0 cites — ignores the citation contract, so
//                                   it is CLASSIFY-ONLY and must never write a
//                                   report chapter (it was rung 4 until G30).
//   Nemotron-3-Super-120B           0 cites · 45s · invalid JSON — not listed.
// Grounding first (the 0.85 KPI is unmet), then balance, then the fast/cheap
// rung for load. Single-prompt projections are not a measured full-report cost ceiling.
export const DEEPINFRA_MODELS_BY_CLASS: Record<AITaskClass, string[]> = {
  report: [
    "deepseek-ai/DeepSeek-V3.2",
    "Qwen/Qwen3-235B-A22B-Instruct-2507",
    "deepseek-ai/DeepSeek-V4-Flash",
  ],
  synthesis: [
    "deepseek-ai/DeepSeek-V3.2",
    "deepseek-ai/DeepSeek-V4-Flash",
    "moonshotai/Kimi-K2.6",
  ],
  classify: [
    "openai/gpt-oss-120b",
    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  ],
};

// D-A3 — models DeepInfra tags `can-disable-reasoning`. Structured report calls
// send `chat_template_kwargs: {thinking: false}` so the hidden reasoning trace
// cannot eat the answer's token budget: at max_tokens 400 a reasoning model
// returned 0 characters of content and 2,042 of reasoning, which the client can
// only read as "Empty DeepInfra response" — a burnt rung and a degraded chapter.
export const DEEPINFRA_THINKING_OFF: ReadonlySet<string> = new Set([
  "deepseek-ai/DeepSeek-V3.2",
  "deepseek-ai/DeepSeek-V4-Flash",
  "deepseek-ai/DeepSeek-V4.1-Flash",
]);

// Initial scoped candidates preserve the existing deployed model IDs. These are
// not a quality certification. External fallback remains empty until exact model,
// account quota and zero-charge eligibility have been qualified. Freeze copies so
// discovery, provider-order overrides and shared consumer mutations cannot widen it.
const REPORT_POLICY_MODELS: Readonly<Record<AITaskClass, readonly string[]>> = Object.freeze({
  report: Object.freeze([...DEEPINFRA_MODELS_BY_CLASS.report]),
  synthesis: Object.freeze([...DEEPINFRA_MODELS_BY_CLASS.synthesis]),
  classify: Object.freeze([...DEEPINFRA_MODELS_BY_CLASS.classify]),
});

/**
 * G33-T05 — streamed DeepInfra timeouts. The per-attempt stage timeout becomes
 * the first-token limit (a dead or queued rung still fails fast so the next one
 * gets time); an answering model may use the rest of the call's wall clock.
 */
/** G33-T16b: never start a streamed DeepInfra attempt with less wall clock than this. */
export const DEEPINFRA_MIN_ATTEMPT_MS = (() => {
  const raw = (process.env.DEEPINFRA_MIN_ATTEMPT_MS ?? "").trim();
  const n = raw === "" ? Number.NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 15_000;
})();

export function deepInfraStreamTimeouts(opts: Pick<AICallOptions, "timeoutMs" | "deadlineAt">, now: number = Date.now()): { firstTokenMs: number; idleMs: number; totalMs: number } {
  const envMs = (name: string, fallback: number) => {
    const n = Number(process.env[name] ?? "");
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  const attempt = opts.timeoutMs ?? 30_000;
  const remaining = typeof opts.deadlineAt === "number" ? Math.max(1_000, opts.deadlineAt - now) : null;
  const totalMs = remaining ?? Math.max(attempt, envMs("DEEPINFRA_STREAM_MAX_MS", 180_000));
  const firstTokenMs = Math.min(totalMs, attempt, envMs("DEEPINFRA_FIRST_TOKEN_TIMEOUT_MS", 45_000));
  const idleMs = Math.min(totalMs, envMs("DEEPINFRA_IDLE_TIMEOUT_MS", 45_000));
  return { firstTokenMs, idleMs, totalMs };
}

async function callDeepInfra(opts: AICallOptions, cls: AITaskClass = "report"): Promise<AICallResult> {
  const apiKey = process.env.DEEPINFRA_API_KEY ?? getDBKey("deepinfra")?.api_key ?? "";
  if (!apiKey) throw new Error("DeepInfra API key not configured");

  let lastErr: Error | null = null;
  const scoped = scopedReportPolicy(opts);
  const models = opts.visionImages?.length ? ["Qwen/Qwen3-VL-235B-A22B-Instruct"] : scoped ? [...REPORT_POLICY_MODELS[cls]] : DEEPINFRA_MODELS_BY_CLASS[cls];
  const readyRungs = readyPaidModels("deepinfra", models);
  if (readyRungs.length === 0) throw new DeadLadderError("deepinfra", models.length);
  // G33-T05: text calls stream, and a model expected to miss the remaining
  // wall clock at its measured speed moves behind one that can finish.
  const streamed = !opts.visionImages?.length && process.env.DEEPINFRA_STREAM !== "off";
  const requestedMaxTokens = Math.min(opts.maxTokens ?? 4096, 16_384);
  const deepinfraRungs = streamed
    ? orderModelsBySpeed(readyRungs, requestedMaxTokens, typeof opts.deadlineAt === "number" ? opts.deadlineAt - Date.now() : null)
    : readyRungs;
  for (const model of deepinfraRungs) {
    if (aiBudgetExpired(opts)) { lastErr = lastErr ?? new AIBudgetExhaustedError(opts.budgetMs ?? 0); break; }
    // G33-T16b: an attempt with almost no wall clock left cannot answer (24/09:
    // six V4-Flash calls started with 5 s left and died) — stop instead of spending.
    if (streamed && typeof opts.deadlineAt === "number" && opts.deadlineAt - Date.now() < DEEPINFRA_MIN_ATTEMPT_MS) { lastErr = lastErr ?? new AIBudgetExhaustedError(opts.budgetMs ?? 0); break; }
    if (runStruck(opts, "deepinfra")) { lastErr = lastErr ?? runStruckError(opts, "deepinfra"); break; }
    const modelStrikeKey = `deepinfra/${model}`;
    if (scoped && opts.runStrikes?.struck(modelStrikeKey)) continue;
    const key = paidKey("deepinfra", model);
    const maxTokens = Math.min(opts.maxTokens ?? 4096, 16_384);
    const payload = JSON.stringify({ model, max_tokens: maxTokens, temperature: opts.temperature ?? 0.7,
      ...(streamed ? { stream: true, stream_options: { include_usage: true } } : {}),
      ...(DEEPINFRA_THINKING_OFF.has(model) ? { chat_template_kwargs: { thinking: false } } : {}),
      messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.visionImages?.length ? [
        { type: "text", text: opts.user },
        ...opts.visionImages.map(bytes => ({ type: "image_url", image_url: { url: `data:image/png;base64,${bytes.toString("base64")}` } })),
      ] : opts.user }] });
    const reservationStarted = performance.now();
    const permit = opts.attemptBudget ? await reserveResearchAttempt(opts.attemptBudget, model, payload, maxTokens) : null;
    const reservationMs = Math.round(performance.now() - reservationStarted);
    let settled = false;
    const stream: { diagnostics: AITransportDiagnostics | null } = { diagnostics: null };
    try {
      if (permit && aiBudgetExpired(opts)) throw new ResearchAttemptBudgetError("deadline expired; reservation retained");
      const headers = { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" };
      const raw = streamed
        ? await inprocessStreamChat("https://api.deepinfra.com/v1/openai/chat/completions", headers, payload, deepInfraStreamTimeouts(opts), (d: AITransportDiagnostics) => {
            stream.diagnostics = d;
          })
        : await workerFetch("https://api.deepinfra.com/v1/openai/chat/completions", headers, payload, budgetedTimeoutMs(opts), !permit && !scoped);

      const data = JSON.parse(raw);
      if (data.error) throw new Error(data.error.message ?? "DeepInfra error");
      if (permit && data.model !== model) throw new ResearchAttemptBudgetError("returned model mismatch; reservation retained");
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("Empty DeepInfra response");
      const input = Number(data.usage?.prompt_tokens ?? 0);
      const output = Number(data.usage?.completion_tokens ?? 0);
      if (permit && opts.attemptBudget) {
        settled = true; // A failed settlement must never trigger a second settlement/refund.
        await settleResearchAttempt(opts.attemptBudget, permit, data.usage);
      }
      const cost = usageCostUsd("deepinfra", model, input, output);
      if (stream.diagnostics) recordModelSpeed(model, { firstTokenMs: stream.diagnostics.firstTokenMs, totalMs: stream.diagnostics.elapsedMs, outputTokens: output });
      recordModelOutcome(key, true);
      clearDeadRung("deepinfra", model);
      return {
        text,
        provider: "groq" as const, // OpenAI-compatible family (compat) — `via` says "deepinfra"
        model,
        usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        ...(cost !== null ? { cost_usd: cost } : {}),
      };
    } catch (err) {
      if (permit && opts.attemptBudget && !settled) {
        settled = true;
        await settleResearchAttempt(opts.attemptBudget, permit);
      }
      if (err instanceof ResearchAttemptBudgetError) throw err;

      lastErr = err instanceof Error ? err : new Error(String(err));
      coolDownModel(key, lastErr.message, !scoped);
      noteDeadRung("deepinfra", model, lastErr.message);
      // Parallel failures of one model must not disable healthy alternatives
      // on our sole scoped provider. Account-wide overload/auth still applies.
      if (scoped && classifyRunStrike(lastErr) === "timeout") opts.runStrikes?.note(modelStrikeKey, lastErr);
      else noteRunStrike(opts, "deepinfra", lastErr);
      if (err instanceof AITransportError) {
        console.warn("[ai-client:transport]", JSON.stringify({ provider: "deepinfra", model, reservationMs, ...err.transport }));
      }
      console.warn(`[ai-client] DeepInfra ${model} failed: ${lastErr.message.slice(0, 200)}`);
    }
  }
  throw lastErr ?? new Error("All DeepInfra models failed");
}

// ── Claude Haiku 4.5 direct API (paid, prompt-cached) ────────────────
// $1/$5 per 1M input/output tokens, $0.10/M for cached reads. Prompt caching
// is the killer feature for SVI: the ~4K-token rubric is identical across
// every profile, so from the 2nd call onward the input cost drops 10×.
// Kept separate from callClaude (Sonnet) so the two can be enabled/disabled
// independently — Sonnet OAuth for chat, Haiku direct for high-volume synthesis.

async function callClaudeHaikuDirect(opts: AICallOptions): Promise<AICallResult> {
  const apiKey = process.env.ANTHROPIC_HAIKU_API_KEY ?? getDBKey("anthropic_haiku")?.api_key ?? "";
  if (!apiKey) throw new Error("Anthropic Haiku API key not configured");
  const model = "claude-haiku-4-5-20251001";

  // Split system into a cacheable block. cache_control on the last block of
  // system content tells Anthropic to reuse it across identical prefixes for
  // up to 5 minutes — cache_read_input_tokens is billed at 10% of fresh cost.
  const raw = await workerFetch("https://api.anthropic.com/v1/messages", {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  }, JSON.stringify({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
  }), budgetedTimeoutMs(opts));

  const data = JSON.parse(raw);
  if (data.error) throw new Error(data.error.message ?? "Anthropic Haiku error");
  let text = "";
  for (const block of (data.content ?? [])) if (block.type === "text") text = block.text;
  if (!text) throw new Error("Empty Haiku response");
  return { text, provider: "claude", model };
}

// ── OpenRouter (OpenAI-compatible, free models) ──────────────────────

// Free models ranked by Aug 2026 discovery + intelligence benchmark.
// S-tier (50+) → A-tier (42-50) → B-tier (35-42) → C-tier (<35)
// Last updated: 2026-08-13 — daily refresh writes to ai-free-models.json.
// Hardcoded list is fallback if file is missing/stale (getDynamicModels prefers file).
const OPENROUTER_DEFAULT_MODELS: string[] = [
  // ── S-tier: Frontier-class free models ──────────────────────────
  "google/gemini-2.5-flash:free",                        // Google Gemini 2.5 Flash — fastest frontier model
  "deepseek/deepseek-r1:free",                           // DeepSeek R1 reasoning — strongest free reasoning
  "deepseek/deepseek-chat-v3.1:free",                    // DeepSeek V3.1 chat — S-tier reasoning (Sep 2026 add)
  "deepseek/deepseek-v3:free",                           // DeepSeek V3 — top-tier general + coding
  "meta-llama/llama-4-maverick:free",                    // Llama 4 Maverick — Meta's best free MoE
  "qwen/qwen3-235b-a22b:free",                           // Qwen3 235B MoE — Alibaba flagship free
  "moonshotai/kimi-k2:free",                             // Kimi K2 — 1T MoE, strong agentic tasks

  // ── A-tier: Strong general-purpose ──────────────────────────────
  "meta-llama/llama-4-scout:free",                       // Llama 4 Scout — Meta efficient MoE
  "nvidia/llama-3.1-nemotron-ultra-253b-v1:free",        // NVIDIA Nemotron 253B — large reasoning
  "microsoft/phi-4-reasoning-plus:free",                 // Phi-4 Reasoning Plus — strong for size
  "tngtech/deepseek-r1t-chimera:free",                   // DeepSeek R1T Chimera — hybrid reasoning
  "inclusionai/ling-3.0-flash-fin:free",                 // Ling 3.0 Fin — 124B MoE, 262K ctx, finance-tuned (BlockID domain fit)

  // ── B-tier: Solid quality, reliable ─────────────────────────────
  "google/gemma-3-27b-it:free",                          // Gemma 3 27B — Google efficient instruct
  "mistralai/mistral-small-3.2-24b-instruct:free",       // Mistral Small 3.2 — reliable European model
  "liquid/lfm-2.5-2.6b:free",                            // Liquid LFM 2.5 2.6B — 65K ctx, ultra-fast small fallback
];

async function callOpenRouter(opts: AICallOptions, cls: AITaskClass = "classify"): Promise<AICallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? getDBKey("openrouter")?.api_key ?? "";
  if (!apiKey) throw new Error("OpenRouter API key not configured");

  const FREE_MODELS = getDynamicModels("openrouter", OPENROUTER_DEFAULT_MODELS);

  let lastErr: Error | null = null;
  const openrouterRungs = readyModels("openrouter", FREE_MODELS, cls);
  if (openrouterRungs.length === 0) throw new DeadLadderError("openrouter", FREE_MODELS.length);
  for (const model of openrouterRungs) {
    if (aiBudgetExpired(opts)) { lastErr = lastErr ?? new AIBudgetExhaustedError(opts.budgetMs ?? 0); break; }
    if (runStruck(opts, "openrouter")) { lastErr = lastErr ?? runStruckError(opts, "openrouter"); break; }
    try {
      const raw = await workerFetch("https://openrouter.ai/api/v1/chat/completions", {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://blockid.au",
        "X-Title": "BlockID.au",
      }, JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 4096,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }), budgetedTimeoutMs(opts));

      const data = JSON.parse(raw);
      if (data.error) throw new Error(data.error.message ?? "OpenRouter error");
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("Empty response");
      recordModelOutcome(model, true);
      clearDeadRung("openrouter", model);
      return { text, provider: "openrouter", model };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      coolDownModel(model, lastErr.message);
      noteDeadRung("openrouter", model, lastErr.message);
      noteRunStrike(opts, "openrouter", lastErr);
      console.warn(`[ai-client] OpenRouter ${model} failed: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error("All OpenRouter free models failed");
}

// ── Ollama local LLM (GPU-accelerated, on-server fallback) ────────────

async function callOllama(opts: AICallOptions): Promise<AICallResult> {
  const host = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";

  const res = await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      system: opts.system,
      prompt: opts.user,
      stream: false,
      options: {
        num_predict: opts.maxTokens ?? 2048,
        temperature: 0.7,
      },
    }),
  });

  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { text: data.response ?? "", provider: "ollama", model };
}

// ── Provider caller map ────────────────────────────────────────────────


async function callClaudeProxy(opts: AICallOptions): Promise<AICallResult> {
  const dbProxy = getDBKey("anthropic_proxy");
  const baseURL = process.env.ANTHROPIC_PROXY_BASE_URL ?? dbProxy?.base_url ?? "";
  const envKeys = (process.env.ANTHROPIC_PROXY_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  const dbKeys = dbProxy?.api_key ? dbProxy.api_key.split(",").map((k) => k.trim()).filter(Boolean) : [];
  const keys = [...new Set([...envKeys, ...dbKeys])];
  // Sonnet 5 through the shared proxy key. Dead (401) as of 2026-09-13 — the
  // provider probe marks it `invalid_key` so the dispatcher skips it.
  const model = "claude-sonnet-5";
  const maxTokens = opts.maxTokens ?? 8192;

  let lastErr: Error | null = null;
  for (const key of keys) {
    try {
      const raw = await workerFetch(`${baseURL}/messages`, {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      }, JSON.stringify({
        model,
        max_tokens: maxTokens,
        stream: false,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }), budgetedTimeoutMs(opts));

      // Parse — may be JSON or SSE
      let text = "";
      if (raw.trimStart().startsWith("{")) {
        const data = JSON.parse(raw);
        for (const block of (data.content ?? [])) {
          if (block.type === "text") text += block.text;
        }
      } else {
        for (const line of raw.split("\n")) {
          if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.delta?.text) text += d.delta.text;
            if (d.type === "content_block_start" && d.content_block?.text) text += d.content_block.text;
          } catch { /* skip */ }
        }
      }
      if (text) return { text, provider: "claude", model };
      throw new Error("Empty response from proxy");
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(`[ai-client] proxy key len=${key.length} prefix=${key.slice(0, 3)}… failed: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error("All proxy keys failed");
}

async function callProvider(provider: Provider, opts: AICallOptions, cls: AITaskClass = inferTaskClass(opts)): Promise<AICallResult> {
  if (scopedReportPolicy(opts) && provider !== "deepinfra") {
    throw new Error("Provider is not eligible for BlockID report policy");
  }
  const noTools = { ...opts, tools: undefined };
  switch (provider) {
    case "claude-oauth":
      return callClaudeOAuth(readCliOAuthToken()!, noTools, cls);
    case "claude-apikey":
      return callClaudeApiKey(opts);
    case "claude-haiku-direct":
      return callClaudeHaikuDirect(noTools);
    case "claude-proxy":
      return callClaudeProxy(opts);
    case "openai-apikey":
      return callOpenAI(process.env.OPENAI_API_KEY ?? getDBKey("openai")?.api_key ?? "", noTools);
    case "groq":
      return callGroq(noTools, cls);
    case "cerebras":
      return callCerebras(noTools, cls);
    case "sambanova":
      return callSambaNova(noTools, cls);
    case "deepinfra":
      return callDeepInfra(noTools, cls);
    case "openrouter":
      return callOpenRouter(noTools, cls);
    case "gemini":
      return callGemini(noTools, cls);
    case "ollama":
      return callOllama(noTools);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── AI Gateway (microservice) ─────────────────────────────────────────
// Phase 1 Strangler Fig: try the standalone AI Gateway service first.
// If it's not available or returns an error, fall back to local providers.

const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL; // e.g. "http://ai-gateway:4010" or "http://127.0.0.1:4010"
const AI_GATEWAY_SECRET = process.env.AI_GATEWAY_SECRET;

let gatewayAvailable = true; // assume available until proven otherwise
let gatewayBackoffUntil = 0; // timestamp — skip gateway until this time

async function callViaGateway(opts: AICallOptions): Promise<AICallResult | null> {
  if (!AI_GATEWAY_URL || !AI_GATEWAY_SECRET) return null;
  if (Date.now() < gatewayBackoffUntil) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), budgetedTimeoutMs(opts));

    const res = await fetch(`${AI_GATEWAY_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": AI_GATEWAY_SECRET,
      },
      body: JSON.stringify({
        system: opts.system,
        user: opts.user,
        maxTokens: opts.maxTokens,
        timeoutMs: budgetedTimeoutMs(opts),
        tools: opts.tools,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[ai-client] Gateway returned ${res.status}: ${body.slice(0, 200)}`);
      // 503 = all providers failed, 429 = budget exceeded — don't back off, just fallback
      if (res.status >= 500) {
        gatewayBackoffUntil = Date.now() + 60_000; // back off 1 min
      }
      return null;
    }

    const data = await res.json();
    if (!data.ok) return null;

    gatewayAvailable = true;
    return { text: data.text, provider: data.provider, model: data.model };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Connection refused = service not running, back off 5 min
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      gatewayAvailable = false;
      gatewayBackoffUntil = Date.now() + 300_000; // 5 min
      console.warn("[ai-client] Gateway unavailable (ECONNREFUSED), falling back to local for 5 min");
    } else {
      console.warn(`[ai-client] Gateway error: ${msg}, falling back to local`);
    }
    return null;
  }
}

// ── Unified entry point (with auto-fallback) ───────────────────────────

// Track recently failed providers — skip them for 2 minutes to avoid wasting time
const providerCooldown = new Map<string, number>();

// ── G24-B: process-lifetime "unconfigured" latch ─────────────────────────
// A 401 / invalid-key answer means the credential is wrong, not that the
// provider is busy — a cooldown that expires (the old 1 h) just re-dials the
// bad key every hour and floods the log. The provider is now marked
// UNCONFIGURED for the rest of the process: never picked (not even by the
// "everything is cooling, retry the coolest" fallback), one log line that
// names the env var to rotate and never a key value, and /api/status
// `ai_providers` shows `blocked / unconfigured`. Rotate the key and restart
// (a deploy restarts) to clear it. Anthropic's own latch lives in
// anthropic-tier.ts; the dispatcher delegates to it so the line is logged once.
const unconfiguredProviders = new Map<Provider, string>();

/** True for a 401 / invalid-key / unauthorised provider error (never a 429 / 5xx). */
export function isInvalidKeyError(err: Error | { message?: string; status?: number; kind?: string }): boolean {
  const kind = (err as { kind?: string }).kind;
  if (kind === "invalid_key") return true;
  const status = (err as { status?: number }).status;
  if (status === 401) return true;
  const msg = String((err as { message?: string }).message ?? "").toLowerCase();
  return /\b401\b|authentication_error|invalid.?(api.?)?key|unauthori[sz]ed/.test(msg);
}

/** Env var the founder rotates for a provider — the log names it, never its value. */
export function providerKeyEnvName(p: Provider): string {
  switch (p) {
    case "claude-apikey": return "ANTHROPIC_API_KEY";
    case "claude-oauth": return "CLAUDE_CODE_OAUTH_TOKEN";
    case "claude-haiku-direct": return "ANTHROPIC_HAIKU_API_KEY";
    case "claude-proxy": return "ANTHROPIC_PROXY_API_KEY";
    case "gemini": return "GOOGLE_GEMINI_API_KEY";
    case "groq": return "GROQ_API_KEY";
    case "openrouter": return "OPENROUTER_API_KEY";
    case "cerebras": return "CEREBRAS_API_KEY";
    case "sambanova": return "SAMBANOVA_API_KEY";
    case "deepinfra": return "DEEPINFRA_API_KEY";
    case "openai-apikey": return "OPENAI_API_KEY";
    case "ollama": return "OLLAMA_HOST";
    default: return "AI provider key";
  }
}

/** Mark `p` unconfigured for the rest of the process; logs once per provider. */
export function markProviderUnconfigured(p: Provider, reason = "401"): void {
  if (p === "claude-apikey") {
    // The tier module owns the Anthropic latch + its single log line.
    markAnthropicKeyInvalid(Date.now(), reason);
    if (!unconfiguredProviders.has(p)) unconfiguredProviders.set(p, reason);
    return;
  }
  if (unconfiguredProviders.has(p)) return;
  unconfiguredProviders.set(p, reason);
  console.warn(
    `[ai-client] ${p} rejected the key (${reason.slice(0, 80)}) — provider marked unconfigured for the rest of this process; ` +
    `no retries. Rotate ${providerKeyEnvName(p)} and restart.`,
  );
}

export function isProviderUnconfigured(p: Provider): boolean {
  return unconfiguredProviders.has(p) || (p === "claude-apikey" && isAnthropicKeyInvalid());
}

// ═════════════════════════════════════════════════════════════════════════
// PARALLEL-SERVING DISPATCHER (Sep 2026)
// ═════════════════════════════════════════════════════════════════════════
// Problem it solves: when many analyses fire concurrently (multi-agent SVI
// scoring, C-Level report generation), every request hit Cerebras first
// because the fallback chain is in fixed order. Cerebras' 30 RPM free
// ceiling was blown almost instantly and requests cascaded through the chain
// picking up 429 after 429.
//
// The dispatcher spreads concurrent load across providers using known RPM
// ceilings + live in-flight counts. Four defensive layers:
//   L1. Per-provider RPM window — never fire when a provider is at 85% of
//       its published ceiling (proactive, prevents 429 before it happens).
//   L2. Least-loaded (max-capacity) routing — first-try target is whichever
//       provider has the most headroom right now, not a fixed favourite.
//   L3. Global concurrency semaphore — hard cap on total in-flight callAI()
//       so a runaway agent burst can't create a 500-request stampede.
//   L4. Per-agent semaphore — one agentId can't monopolise the pool.
// Every layer is a Map/counter — no external dependency, restart-safe by
// virtue of being all in-process (a fresh worker starts clean).

/** Known free-tier requests-per-minute ceilings (conservative). Overrideable
 *  via env for future tuning without a redeploy. Groq's gpt-oss models allow
 *  1000 RPM — the highest — so they naturally win the capacity race under load. */
// Sep 2026 verified ceilings:
//   Groq free = 30 RPM/model; Developer tier = 1000 RPM/model. Default assumes
//     Developer tier is on (env AI_RPM_GROQ can lower if still on free).
//   OpenRouter free = 20 RPM/model (correction — $10 top-up lifts daily cap,
//     NOT per-minute). Was mis-set to 60.
//   DeepInfra = 200 concurrent, no published per-minute ceiling → estimate 300.
//   Claude Haiku direct = tier-scaled starting 50 RPM, grows to 4000+ with usage.
const PROVIDER_RPM: Record<Provider, number> = {
  "groq":               Number(process.env.AI_RPM_GROQ ?? 4000),
  "sambanova":          Number(process.env.AI_RPM_SAMBANOVA ?? 60),
  "openrouter":         Number(process.env.AI_RPM_OPENROUTER ?? 20),
  "cerebras":           Number(process.env.AI_RPM_CEREBRAS ?? 30),
  "deepinfra":          Number(process.env.AI_RPM_DEEPINFRA ?? 300),
  "claude-haiku-direct":Number(process.env.AI_RPM_CLAUDE_HAIKU ?? 200),
  "claude-oauth":       Number(process.env.AI_RPM_CLAUDE_OAUTH ?? 20),  // personal Max token — fallback only (S32-C)
  "claude-proxy":       Number(process.env.AI_RPM_CLAUDE_PROXY ?? 50),
  "claude-apikey":      Number(process.env.AI_RPM_CLAUDE_APIKEY ?? 120),
  "openai-apikey":      Number(process.env.AI_RPM_OPENAI ?? 200),
  "gemini":             Number(process.env.AI_RPM_GEMINI ?? 60),
  "ollama":             9999,  // local, no external limit
  "none":                  0,
};

// ── Tier segregation (S31-A tiers, S32-C per-class ranking) ─────────────
// Tiers, evaluated in the order the task class wants them:
//   quality      — the Anthropic API key (SDK). While the key is valid and
//                  the daily cap (AI_DAILY_SPEND_CAP_AUD) has headroom.
//   quality-cost — DeepInfra + Gemini: paid but cheap, strong models. For
//                  report / synthesis they rank right after the quality tier
//                  (a founder's first analysis deserves a real model); for
//                  classify they are overflow behind the free tiers.
//   subscription — claude-oauth (Claude Max CLI token) and claude-proxy: a
//                  PERSONAL credential, not a product tier. Fallback only:
//                  after quality-cost for reports, after free for classify,
//                  never picked while a higher tier has headroom, capped at
//                  AI_RPM_CLAUDE_OAUTH (20).
//   free         — zero-marginal-cost providers (Groq, Cerebras, SambaNova,
//                  OpenRouter free models) and the local Ollama runtime.
//   paid         — Haiku direct, OpenAI: last resort, never past the cap.
export type ProviderTier = "quality" | "quality-cost" | "subscription" | "free" | "paid";

const PROVIDER_TIER_BASE: Record<Provider, ProviderTier> = {
  "claude-apikey":      "quality",
  "deepinfra":          "quality-cost",
  "gemini":             "quality-cost",
  "claude-oauth":       "subscription",  // covered by subscription — no per-call cost, personal token
  "claude-proxy":       "subscription",  // covered by subscription — no per-call cost
  "groq":               "free",
  "cerebras":           "free",
  "sambanova":          "free",
  "openrouter":         "free",
  "ollama":             "free",
  "claude-haiku-direct":"paid",
  "openai-apikey":      "paid",
  "none":               "free",
};

/** Tier evaluation order per task class. */
export const TIER_ORDER_BY_CLASS: Record<AITaskClass, ProviderTier[]> = {
  report:    ["quality", "quality-cost", "subscription", "free", "paid"],
  synthesis: ["quality", "quality-cost", "subscription", "free", "paid"],
  classify:  ["quality", "free", "quality-cost", "subscription", "paid"],
};

/** The tier a provider sits in (same for every class — the ORDER of tiers
 *  is what changes by class). Exported for tests / dashboards. */
export function providerTier(p: Provider): ProviderTier {
  return PROVIDER_TIER_BASE[p] ?? "free";
}

/** Providers whose calls cost real money — governed by the daily cap. */
function isPaidProvider(p: Provider): boolean {
  const t = providerTier(p);
  return t === "quality" || t === "quality-cost" || t === "paid";
}

/** Map a dispatcher provider onto the probe's provider id (null = not probed). */
function probeIdFor(p: Provider): ProbeProvider | null {
  switch (p) {
    case "claude-apikey": return "anthropic";
    case "claude-oauth": return "claude-oauth";
    case "claude-proxy": return "claude-proxy";
    case "openrouter": return "openrouter";
    case "groq": return "groq";
    case "cerebras": return "cerebras";
    case "sambanova": return "sambanova";
    case "deepinfra": return "deepinfra";
    case "gemini": return "gemini";
    case "ollama": return "ollama";
    default: return null;
  }
}

/** Why a provider must not be dialled right now (null = go ahead). Combines
 *  the in-process cooldown, the Anthropic 401 latch, the daily spend cap and
 *  the last probe verdict (invalid key / quota spent / low credit, honoured
 *  while the probe is fresh). */
export function providerBlockReason(p: Provider, now: number = Date.now()): string | null {
  // G24-B: a rejected key outranks every other state — never re-dialled this process.
  if (isProviderUnconfigured(p)) return "unconfigured";
  // G29-A: every rung dead, or a 402 in the last 24 h → not dialled, no call spent (founder item #9).
  if (isProviderUnfunded(p, now)) return "unfunded";
  if ((providerCooldown.get(p) ?? 0) > now) return "cooldown";
  if (isPaidProvider(p) && isDailyCapReached(now)) return "daily_cap";
  const id = probeIdFor(p);
  if (id) {
    const st = cachedProviderStatus(id);
    if (st && now - new Date(st.checked_at).getTime() < PROBE_TTL_MS) {
      if (st.status === "invalid_key") return "invalid_key";
      if (st.status === "quota_exceeded") return "quota_exceeded";
      if (st.status === "low_credit") return "low_credit";
      if (st.status === "unreachable" && p === "claude-proxy") return "unreachable";
    }
  }
  return null;
}

/** True when the caller is about to burn per-token marginal cost on the
 *  overflow paid tier. Emits an observable log line so the admin dashboard /
 *  user notification banner can show "AI đang chạy trên gói trả phí" when
 *  free capacity is exhausted. Debounced 60 s so a sustained free-outage
 *  doesn't spam the log. */
const paidTierEvents: number[] = [];
let lastPaidLogAt = 0;
function notePaidTierEngaged(provider: Provider): void {
  const now = Date.now();
  paidTierEvents.push(now);
  while (paidTierEvents.length > 0 && paidTierEvents[0] < now - 60 * 60_000) paidTierEvents.shift();
  if (now - lastPaidLogAt < 60_000) return;
  lastPaidLogAt = now;
  console.warn(
    `[ai-client:paid-tier] engaged ${provider} — free tier saturated. ` +
    `paid-events in last hour: ${paidTierEvents.length}`
  );
}

/** Live counter — how many times the overflow paid tier was engaged in the
 *  last hour. Surface this in the admin dashboard so ops can see when to add
 *  more free-tier keys or lift caps. */
export function getPaidTierEventsLastHour(): number {
  const now = Date.now();
  return paidTierEvents.filter((t) => t > now - 60 * 60_000).length;
}
const RPM_HEADROOM = 0.85; // stop firing at 85% of ceiling → burst safety margin
const RPM_WINDOW_MS = 60_000;

const inFlightByProvider = new Map<Provider, number>();
const rpmWindow = new Map<Provider, number[]>(); // ms timestamps of recent fires

function noteFire(p: Provider): void {
  const now = Date.now();
  const ts = (rpmWindow.get(p) ?? []).filter((t) => now - t < RPM_WINDOW_MS);
  ts.push(now);
  rpmWindow.set(p, ts);
  inFlightByProvider.set(p, (inFlightByProvider.get(p) ?? 0) + 1);
}

function noteDone(p: Provider): void {
  inFlightByProvider.set(p, Math.max(0, (inFlightByProvider.get(p) ?? 1) - 1));
}

/** Remaining capacity = ceiling*headroom − recent-fires − in-flight.
 *  Negative means "already saturated, do not fire". For the Anthropic tier
 *  the ceiling is the REAL `anthropic-ratelimit-requests-remaining` from the
 *  last response while that window is still open — so a key on a higher
 *  usage tier ranks by what Anthropic actually granted, not a static guess. */
function providerCapacity(p: Provider): number {
  const now = Date.now();
  const recent = (rpmWindow.get(p) ?? []).filter((t) => now - t < RPM_WINDOW_MS).length;
  const inflight = inFlightByProvider.get(p) ?? 0;
  if (p === "claude-apikey") {
    const remaining = anthropicRequestsRemaining(now);
    if (remaining !== null) return remaining * RPM_HEADROOM - inflight;
  }
  const ceiling = (PROVIDER_RPM[p] ?? 30) * RPM_HEADROOM;
  return ceiling - recent - inflight;
}

/** L1+L2: pick the provider with the most remaining capacity that isn't
 *  blocked. Ties keep the input order (which is the quality ranking, so a
 *  quiet system still prefers the strongest provider). If EVERY candidate is
 *  saturated we still return the least-saturated one — worst case, that call
 *  gets 429'd and cools down, which is what we want. Returns null only when
 *  the input list is empty or every candidate is hard-blocked.
 *
 *  Tier policy (S32-C): tiers are walked in `TIER_ORDER_BY_CLASS[taskClass]`
 *  — report / synthesis: quality → quality-cost → subscription → free →
 *  paid; classify: quality → free → quality-cost → subscription → paid. The
 *  first tier with a provider that has headroom wins; inside a tier the
 *  provider with the most capacity wins (input order breaks ties). A
 *  provider blocked by an invalid key / quota / low credit / the daily cap
 *  is never picked while any other candidate exists. When the founder set
 *  AI_REPORT_PROVIDER_ORDER the list order IS the rank for report classes
 *  (first provider with headroom wins). */
export function pickBestProvider(candidates: Provider[], taskClass: AITaskClass = "report"): Provider | null {
  if (candidates.length === 0) return null;
  const now = Date.now();

  const usable = candidates.filter((p) => providerBlockReason(p, now) === null);
  // Every candidate blocked → retry only the ones merely on a transient
  // cooldown (a 401 / cap / quota block is never bypassed).
  const list = usable.length > 0 ? usable : candidates.filter((p) => providerBlockReason(p, now) === "cooldown");
  if (list.length === 0) return null;

  const pickFrom = (tier: Provider[]): Provider | null => {
    if (tier.length === 0) return null;
    const scored = tier.map((p, i) => ({ p, i, cap: providerCapacity(p) }));
    const hasRoom = scored.filter((x) => x.cap > 0);
    const picks = hasRoom.length > 0 ? hasRoom : scored;
    picks.sort((a, b) => b.cap - a.cap || a.i - b.i);
    return picks[0].p;
  };
  const anyRoom = (tier: Provider[]): boolean => tier.some((p) => providerCapacity(p) > 0);

  // Founder override: strict priority in the listed order for report classes.
  if (taskClass !== "classify" && reportOrderOverridden()) {
    const order = providerOrderForClass(taskClass);
    const ranked = [...list].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const withRoom = ranked.find((p) => providerCapacity(p) > 0);
    const pick = withRoom ?? pickFrom(ranked);
    if (pick && providerTier(pick) === "paid") notePaidTierEngaged(pick);
    return pick;
  }

  const order = TIER_ORDER_BY_CLASS[taskClass] ?? TIER_ORDER_BY_CLASS.report;
  for (const tierName of order) {
    const tier = list.filter((p) => providerTier(p) === tierName);
    if (tier.length === 0 || !anyRoom(tier)) continue;
    const pick = pickFrom(tier);
    // Overflow onto the last-resort paid tier is worth a log line so the
    // admin dashboard can react (quality-cost for a report is by design).
    if (pick && tierName === "paid") notePaidTierEngaged(pick);
    return pick;
  }

  // Everything is saturated — last-ditch attempt at the least-saturated
  // provider in tier order. Some call has to fail so cooldowns get fresh
  // signals; better to let it 429 than return null.
  const ranked = order.flatMap((tierName) => list.filter((p) => providerTier(p) === tierName));
  const pick = pickFrom(ranked);
  if (pick && providerTier(pick) === "paid") notePaidTierEngaged(pick);
  return pick;
}

// ── L3. Global concurrency semaphore + bounded, priority-aware queue ──────
// Chosen from sum(RPM ceilings) with a safety divisor. Sum ~= 1550 RPM;
// at 5s avg call → ~130 concurrent sustainable. Default 120 leaves ~15%
// buffer for latency spikes and is the "burst" sweet spot: ~90 profiles/min
// (≈5,400/hr) without saturating Groq's 850 RPM headroom.
//
// S31-A backpressure: the wait queue is BOUNDED and two-lane. User traffic
// (`priority: "user"`, the default) is served first; background work (crons,
// self-upgrade) only takes a slot while no user is waiting AND a reserve of
// slots stays free for people. A caller that cannot be queued gets an
// `AICapacityError` (503 + Retry-After via lib/ai/capacity.ts), never a bare
// 500. A queued caller that waits longer than AI_QUEUE_WAIT_MS also gets the
// 503 so a browser is never held open indefinitely.
const MAX_CONCURRENT_AI_CALLS = Number(process.env.AI_MAX_CONCURRENT ?? 120);
const MAX_QUEUED_AI_CALLS = Number(process.env.AI_MAX_QUEUED ?? 400);
const BACKGROUND_RESERVE = Number(process.env.AI_BACKGROUND_RESERVE ?? 0.25); // share of slots kept for users
const MAX_QUEUE_WAIT_MS = Number(process.env.AI_QUEUE_WAIT_MS ?? 45_000);
/** Average call time used to turn a queue position into a Retry-After. */
const AVG_CALL_MS = Number(process.env.AI_AVG_CALL_MS ?? 6_000);

type Waiter = { resolve: () => void; priority: "user" | "background" };
let globalRunning = 0;
const userQueue: Waiter[] = [];
const backgroundQueue: Waiter[] = [];

function queueDepth(): number {
  return userQueue.length + backgroundQueue.length;
}

function backgroundMayRun(): boolean {
  const reserve = Math.max(1, Math.floor(MAX_CONCURRENT_AI_CALLS * BACKGROUND_RESERVE));
  return userQueue.length === 0 && globalRunning < MAX_CONCURRENT_AI_CALLS - reserve;
}

function retryAfterSec(position: number): number {
  const perSlot = AVG_CALL_MS / Math.max(1, MAX_CONCURRENT_AI_CALLS);
  return Math.max(2, Math.min(120, Math.ceil((position + 1) * perSlot / 1000) + 1));
}

async function acquireGlobal(priority: "user" | "background"): Promise<void> {
  const canRun = priority === "user" ? globalRunning < MAX_CONCURRENT_AI_CALLS : backgroundMayRun();
  if (canRun) { globalRunning++; return; }
  const depth = queueDepth();
  if (depth >= MAX_QUEUED_AI_CALLS) {
    throw new AICapacityError("queue_full", retryAfterSec(depth), { queued: depth, running: globalRunning });
  }
  const lane = priority === "user" ? userQueue : backgroundQueue;
  await new Promise<void>((resolve, reject) => {
    const waiter: Waiter = { resolve: () => {}, priority };
    const timer = setTimeout(() => {
      const i = lane.indexOf(waiter);
      if (i >= 0) lane.splice(i, 1);
      reject(new AICapacityError("queue_full", retryAfterSec(queueDepth()), { queued: queueDepth(), running: globalRunning }));
    }, MAX_QUEUE_WAIT_MS);
    waiter.resolve = () => { clearTimeout(timer); resolve(); };
    lane.push(waiter);
  });
  globalRunning++;
}

function releaseGlobal(): void {
  globalRunning = Math.max(0, globalRunning - 1);
  // Users first; background only when the reserve rule allows it.
  const next = userQueue.shift() ?? (backgroundMayRun() ? backgroundQueue.shift() : undefined);
  if (next) next.resolve();
}

// ── L4. Per-agent semaphore ──────────────────────────────────────────────
// Each named caller (agentId) has its own concurrency cap. Prevents a
// runaway multi-prompt agent from starving other agents / user traffic.
// 8 slots × 15 concurrent agents = 120 (matches L3 ceiling); a single agent
// with 13 SVI criteria completes in 2 rounds (⌈13/8⌉) ≈ 10s instead of 3
// rounds (15s) at the previous 5.
const MAX_PER_AGENT = Number(process.env.AI_MAX_PER_AGENT ?? 8);
const agentRunning = new Map<string, number>();
const agentQueues = new Map<string, Array<() => void>>();

async function acquireAgent(agentId: string): Promise<void> {
  const running = agentRunning.get(agentId) ?? 0;
  if (running < MAX_PER_AGENT) { agentRunning.set(agentId, running + 1); return; }
  const q = agentQueues.get(agentId) ?? [];
  agentQueues.set(agentId, q);
  await new Promise<void>((resolve) => q.push(resolve));
  agentRunning.set(agentId, (agentRunning.get(agentId) ?? 0) + 1);
}
function releaseAgent(agentId: string): void {
  agentRunning.set(agentId, Math.max(0, (agentRunning.get(agentId) ?? 1) - 1));
  const q = agentQueues.get(agentId);
  const next = q?.shift();
  if (next) next();
}

// ── L5. Per-user fairness (S31-A) ────────────────────────────────────────
// At most AI_MAX_PER_USER (2) calls in flight per user; up to AI_USER_QUEUE
// (6) more wait briefly. Beyond that the user gets a 503 + Retry-After
// instead of pushing everyone else's work back — one founder who opens six
// tabs cannot starve the trial wave.
const MAX_PER_USER = Number(process.env.AI_MAX_PER_USER ?? 2);
const MAX_USER_QUEUE = Number(process.env.AI_USER_QUEUE ?? 6);
const userRunning = new Map<string, number>();
const userQueues = new Map<string, Array<() => void>>();

async function acquireUser(userId: string): Promise<void> {
  const running = userRunning.get(userId) ?? 0;
  if (running < MAX_PER_USER) { userRunning.set(userId, running + 1); return; }
  const q = userQueues.get(userId) ?? [];
  userQueues.set(userId, q);
  if (q.length >= MAX_USER_QUEUE) {
    throw new AICapacityError("user_queue_full", retryAfterSec(q.length), { queued: q.length, running });
  }
  await new Promise<void>((resolve, reject) => {
    const entry = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => {
      const i = q.indexOf(entry);
      if (i >= 0) q.splice(i, 1);
      reject(new AICapacityError("user_limit", retryAfterSec(q.length), { queued: q.length, running: userRunning.get(userId) ?? 0 }));
    }, MAX_QUEUE_WAIT_MS);
    q.push(entry);
  });
  userRunning.set(userId, (userRunning.get(userId) ?? 0) + 1);
}
function releaseUser(userId: string): void {
  userRunning.set(userId, Math.max(0, (userRunning.get(userId) ?? 1) - 1));
  const q = userQueues.get(userId);
  const next = q?.shift();
  if (next) next();
}

/** Depth of the global wait queue (user + background lanes) for /api/status. */
export function getAIQueueDepth(): { queued: number; queued_user: number; queued_background: number; running: number; max_concurrent: number } {
  return {
    queued: queueDepth(),
    queued_user: userQueue.length,
    queued_background: backgroundQueue.length,
    running: globalRunning,
    max_concurrent: MAX_CONCURRENT_AI_CALLS,
  };
}

/** Debug/observability snapshot — useful in tests + admin dashboards. */
export function getDispatcherState(): {
  globalRunning: number;
  globalQueued: number;
  perProvider: Record<string, { inFlight: number; recentFires: number; capacity: number }>;
  perAgent: Record<string, number>;
  perUser: Record<string, number>;
} {
  const now = Date.now();
  const perProvider: Record<string, { inFlight: number; recentFires: number; capacity: number }> = {};
  for (const p of Object.keys(PROVIDER_RPM) as Provider[]) {
    const recent = (rpmWindow.get(p) ?? []).filter((t) => now - t < RPM_WINDOW_MS).length;
    const inflight = inFlightByProvider.get(p) ?? 0;
    if (recent === 0 && inflight === 0) continue;
    perProvider[p] = { inFlight: inflight, recentFires: recent, capacity: providerCapacity(p) };
  }
  const perAgent: Record<string, number> = {};
  for (const [id, n] of agentRunning) if (n > 0) perAgent[id] = n;
  const perUser: Record<string, number> = {};
  for (const [id, n] of userRunning) if (n > 0) perUser[id] = n;
  return { globalRunning, globalQueued: queueDepth(), perProvider, perAgent, perUser };
}

// ── Provider health snapshot (G15-R3.3) ─────────────────────────────────
// Pure reader over the dispatcher's in-process state for /api/status.ai and
// the error digest. It changes NO routing: it reports the same cooldown map,
// the same block reasons (`providerBlockReason`) and the same interactive
// order (`orderForInteractive(getAvailableProviders())`) the dispatcher uses.
// `budget_exhausted_1h` counts every `AIBudgetExhaustedError` callAI() threw
// in the last hour (ring buffer of timestamps, trimmed on read + write).

export interface ProviderHealthEntry {
  name: string;
  state: "ok" | "cooldown" | "blocked";
  /** ISO timestamp when the cooldown lifts; null unless `state === "cooldown"`. */
  cooldown_until: string | null;
  /** Block reason from `providerBlockReason` (unconfigured / unfunded / invalid_key / quota_exceeded / low_credit / daily_cap / unreachable). */
  reason?: string;
}

export interface ProviderHealthSnapshot {
  providers: ProviderHealthEntry[];
  budget_exhausted_1h: number;
  interactive_order: string[];
  /** G29-A: configured providers in state `ok` — the digest alerts when < 2 for > 1 h. */
  healthy_providers: number;
  /** G29-A: providers whose every rung is dead or that answered 402 in the last 24 h (founder item #9). */
  unfunded: string[];
  /** G29-A: per ladder provider — dead rungs vs ladder length (configured providers only). */
  dead_rungs: Record<string, ProviderCapacity>;
}

const BUDGET_EXHAUSTED_WINDOW_MS = 60 * 60_000;
const budgetExhaustedEvents: number[] = [];

function trimBudgetExhausted(now: number): void {
  while (budgetExhaustedEvents.length > 0 && budgetExhaustedEvents[0] <= now - BUDGET_EXHAUSTED_WINDOW_MS) budgetExhaustedEvents.shift();
}

function noteBudgetExhausted(now: number = Date.now()): void {
  budgetExhaustedEvents.push(now);
  trimBudgetExhausted(now);
  // Bounded: at one interactive request per second for an hour this is 3,600
  // numbers; anything beyond that is a storm the digest already sees.
  if (budgetExhaustedEvents.length > 10_000) budgetExhaustedEvents.splice(0, budgetExhaustedEvents.length - 10_000);
}

/** Provider health for observability. Configured providers (report class)
 *  only — a provider without a key is not "blocked", it is absent. */
export function getProviderHealthSnapshot(now: number = Date.now()): ProviderHealthSnapshot {
  trimBudgetExhausted(now);
  const configured = getAvailableProviders("report");
  const providers: ProviderHealthEntry[] = configured.map((name) => {
    const reason = providerBlockReason(name, now);
    if (reason === "cooldown") {
      return { name, state: "cooldown", cooldown_until: new Date(providerCooldown.get(name) ?? now).toISOString(), reason };
    }
    if (reason) return { name, state: "blocked", cooldown_until: null, reason };
    return { name, state: "ok", cooldown_until: null };
  });
  const dead_rungs = getProviderCapacity(now);
  return {
    providers,
    budget_exhausted_1h: budgetExhaustedEvents.length,
    interactive_order: orderForInteractive(configured),
    healthy_providers: providers.filter((p) => p.state === "ok").length,
    unfunded: unfundedProviders(dead_rungs),
    dead_rungs,
  };
}

/** Test-only reset — clears all dispatcher state. Never call from production code. */
export function _resetDispatcherForTests(): void {
  inFlightByProvider.clear();
  rpmWindow.clear();
  providerCooldown.clear();
  unconfiguredProviders.clear();
  agentRunning.clear();
  agentQueues.clear();
  userRunning.clear();
  userQueues.clear();
  globalRunning = 0;
  userQueue.length = 0;
  backgroundQueue.length = 0;
  paidTierEvents.length = 0;
  budgetExhaustedEvents.length = 0;
  lastProbeKickAt = 0;
  strikesCache = null;
  modelCfgCache = null;
}

// ── Boot-time probe kick ─────────────────────────────────────────────────
// The first call after a (re)start checks whether the cached provider
// verdicts are stale (> 15 min) and, if so, fires the probe in the background
// — so an invalid key or a drained OpenRouter account is known within one
// request of boot, not at the next 30-minute cron tick. Throttled in-process.
let lastProbeKickAt = 0;
function maybeKickProviderProbe(): void {
  const now = Date.now();
  if (now - lastProbeKickAt < PROBE_TTL_MS) return;
  lastProbeKickAt = now;
  if (process.env.AI_PROVIDER_PROBE === "off" || process.env.NODE_ENV === "test") return;
  try {
    const cached = readProviderStatusFile();
    if (now - new Date(cached.updated_at).getTime() < PROBE_TTL_MS) return;
  } catch { /* probe anyway */ }
  probeProviders().catch((err) => {
    console.warn(`[ai-client:probe] provider probe failed: ${err instanceof Error ? err.message : err}`);
  });
}

// ═════════════════════════════════════════════════════════════════════════

/** Cooldown length for a failed provider — three tiers plus the S31-A
 *  Anthropic specifics (a 429 honours `retry-after` when the provider gave
 *  one). A 401 never reaches here from callAI: G24-B marks the provider
 *  unconfigured for the process instead (markProviderUnconfigured); the 1 h
 *  branch stays for a caller that classifies without the latch. */
export function cooldownForError(provider: Provider, err: Error): number {
  const msg = err.message.toLowerCase();
  const retryAfter = (err as { retryAfterMs?: number }).retryAfterMs;
  if (provider === "claude-apikey" && typeof retryAfter === "number" && retryAfter > 0) {
    return Math.min(15 * 60_000, Math.max(5_000, retryAfter));
  }
  if (/\b401\b|authentication_error|invalid.?(api.?)?key|unauthori[sz]ed/.test(msg)) return 60 * 60_000; // 1h — a bad key does not fix itself
  if (/\b402\b|payment.?required|billing|insufficient.?quota|hard.?limit/.test(msg)) return 24 * 60 * 60_000; // 24h
  if (/rate.?limit|\b429\b|quota|too many requests|overloaded|capacity/.test(msg)) return 15 * 60_000; // 15 min
  return 120_000; // 2 min generic transient
}

export async function callAI(opts: AICallOptions): Promise<AICallResult> {
  return trackOriginWork("ai_call", () => callAITracked(opts));
}

async function callAITracked(opts: AICallOptions): Promise<AICallResult> {
  const reportScope = currentReportSpendScope();
  if (reportScope && !opts.attemptBudget) opts = { ...opts, policy: "blockid-report-v1", attemptBudget: createReportAttemptBudget(reportScope) };
  if (opts.visionImages) {
    if (!opts.attemptBudget || opts.policy !== "blockid-report-v1" || opts.visionImages.length < 1 || opts.visionImages.length > 4 || opts.visionImages.some(b => !Buffer.isBuffer(b) || b.length > 19 * 1024 * 1024 || !b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) || opts.visionImages.reduce((n,b) => n+b.length, 0) > 20 * 1024 * 1024) throw new ResearchAttemptBudgetError("vision input or shared budget missing");
  }
  // Resolve policy before any gateway/probe I/O. The legacy gateway cannot
  // attest exact model or account eligibility and is outside this scoped chain.
  const scoped = scopedReportPolicy(opts);
  const research = opts.agentId === "svi:research_synthesis" || opts.agentId === "svi:research_grounded_review";
  if ((research && (!scoped || !opts.attemptBudget)) || (opts.attemptBudget && !scoped))
    throw new ResearchAttemptBudgetError("research requires scoped durable attempt authorization");

  const gatewayResult = scoped ? null : await callViaGateway(opts);
  if (gatewayResult) return gatewayResult;

  // Fallback: local provider chain (existing behavior)
  await getDBKeys();

  // S32-C — the task class decides the provider order AND the model each
  // provider uses (see header). Inferred from agentId / maxTokens when the
  // caller did not say.
  const taskClass = inferTaskClass(opts);
  const allProviders: Provider[] = scoped
    ? (providerConfigured("deepinfra") ? ["deepinfra"] : [])
    : opts.interactive ? orderForInteractive(getAvailableProviders(taskClass)) : getAvailableProviders(taskClass);
  if (opts.interactive && opts.timeoutMs == null) opts = { ...opts, timeoutMs: INTERACTIVE_TIMEOUT_MS };
  // Default interactive budget = at least one full attempt at the caller's
  // own `timeoutMs` (full-report asks 180 s, report-section 120 s, the CFO
  // advisor 90 s) and never below INTERACTIVE_BUDGET_MS — a ladder of
  // timeouts can no longer multiply that figure.
  const budgetMs = opts.budgetMs ?? (opts.interactive ? Math.max(INTERACTIVE_BUDGET_MS, opts.timeoutMs ?? 0) : undefined);
  if (budgetMs != null && opts.deadlineAt == null) opts = { ...opts, budgetMs, deadlineAt: Date.now() + budgetMs };

  if (allProviders.length === 0) {
    throw new Error(
      "No AI provider configured. Set up keys in Admin → AI Keys, or configure env vars."
    );
  }

  if (isBudgetExceeded()) {
    const budget = readBudget();
    throw new Error(
      `Monthly AI budget exceeded ($${budget.totalUSD.toFixed(2)} / $${MONTHLY_BUDGET_USD}). Resets next month.`
    );
  }

  if (!scoped) maybeKickProviderProbe();

  // L5 → L3 → L4: the per-user fairness slot FIRST, then the global slot
  // (priority lane), then the agent slot. Every queue is bounded; overflow
  // throws AICapacityError so routes answer 503 + Retry-After, never a 500.
  //
  // S31 post-ship review (2026-09-14): the user slot used to be taken
  // last, so a founder past AI_MAX_PER_USER sat in the user queue for up
  // to AI_QUEUE_WAIT_MS *while holding a global slot* — 15 users × 6 queued
  // could pin 90 of the 120 global slots on calls that were not running.
  // Taking the user slot before the global one keeps every held global
  // slot a running (or agent-queued) call.
  const priority = opts.priority ?? "user";
  const agentId = opts.agentId ?? "default";
  const userId = opts.userId;
  let userHeld = false;
  if (userId) { await acquireUser(userId); userHeld = true; }
  try {
    await acquireGlobal(priority);
  } catch (err) {
    if (userHeld && userId) releaseUser(userId);
    throw err;
  }
  try {
    await acquireAgent(agentId);
  } catch (err) {
    releaseGlobal();
    if (userHeld && userId) releaseUser(userId);
    throw err;
  }

  let lastError: Error | null = null;
  // Try each provider at most once per call. pickBestProvider excludes ones
  // already blocked, so this loop terminates in O(providers) worst case.
  const tried = new Set<Provider>();
  try {
    while (tried.size < allProviders.length) {
      if (aiBudgetExpired(opts)) { lastError = new AIBudgetExhaustedError(opts.budgetMs ?? 0); break; }
      // G28-B: a provider struck out earlier in this run is not re-dialled.
      const remaining = allProviders.filter((p) => !tried.has(p) && !runStruck(opts, p));
      // S32-F: an interactive caller takes the FIRST usable provider in the
      // throughput order — the tier ranking in pickBestProvider would put the
      // quality-cost tier (DeepInfra / Gemini) ahead of Groq and time out.
      const provider = opts.interactive ? pickFirstUsable(remaining) : pickBestProvider(remaining, taskClass);
      if (!provider) break;
      tried.add(provider);
      noteFire(provider);
      try {
        const result = await callProvider(provider, opts, taskClass);
        const estimatedTokens = Math.ceil((opts.system.length + opts.user.length) / 3) * 2;
        const paid = isPaidProvider(provider);
        const cost = typeof result.cost_usd === "number"
          ? result.cost_usd
          : (paid ? (estimatedTokens / 1000) * (COST_PER_1K[result.model] ?? 0.001) : 0);
        trackCost(result.model, estimatedTokens, typeof result.cost_usd === "number" ? result.cost_usd : undefined);
        if (paid) {
          recordPaidSpend(provider, cost);
          if (isDailyCapReached()) {
            notifyCapReached("daily_cap", { provider }).catch(() => { /* best-effort */ });
          }
        }
        return { ...result, cost_usd: cost, via: provider, taskClass, ...(scoped ? { policy: opts.policy } : {}) };
      } catch (err) {
        if (err instanceof ResearchAttemptBudgetError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        if (isInvalidKeyError(lastError)) {
          // G24-B: wrong credential → unconfigured for the process, one line, no cooldown re-dial.
          markProviderUnconfigured(provider, `${(lastError as { status?: number }).status ?? 401} invalid key`);
          continue;
        }
        if (lastError instanceof RunStruckError) continue; // struck by a parallel call of this run — no process-wide cooldown from it
        if (lastError instanceof DeadLadderError) continue; // G29-A: no call was made; the dead-rung table (not a cooldown) owns the skip
        noteRunStrike(opts, provider, lastError);
        const cooldownMs = cooldownForError(provider, lastError);
        providerCooldown.set(provider, Date.now() + cooldownMs);
        const cooldownLabel = cooldownMs >= 60 * 60_000
          ? `${Math.round(cooldownMs / (60 * 60_000))}h`
          : cooldownMs >= 60_000 ? `${Math.round(cooldownMs / 60_000)}min` : `${Math.round(cooldownMs / 1000)}s`;
        console.warn(`[ai-client] ${provider} failed (cooldown ${cooldownLabel}): ${lastError.message}`);
      } finally {
        noteDone(provider);
      }
    }
  } finally {
    if (userHeld && userId) releaseUser(userId);
    releaseAgent(agentId);
    releaseGlobal();
  }

  if (!lastError && tried.size === 0) {
    const struck = allProviders.filter((p) => runStruck(opts, p));
    lastError = struck.length === allProviders.length && struck.length > 0
      ? new RunStruckError(struck.join(","), struck.reduce((n, p) => n + (opts.runStrikes?.strikes(p) ?? 0), 0))
      : new Error("All AI providers are blocked (invalid key / quota / daily cap) — see /api/status ai_providers");
  }
  // G15-R3.3: count budget exhaustion (whether the loop broke on the deadline
  // or a provider ladder surfaced it) for getProviderHealthSnapshot().
  if (lastError instanceof AIBudgetExhaustedError) noteBudgetExhausted();
  throw lastError ?? new Error("All AI providers failed");
}

// ── Legacy compat — getAnthropicClient for term-sheet (uses parse() API) ──

export function getAnthropicClient() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Anthropic = require("@anthropic-ai/sdk").default;

  const oauthToken = readCliOAuthToken();
  if (oauthToken) {
    return new Anthropic({ authToken: oauthToken, maxRetries: 2, timeout: 120_000 });
  }
  if (isAnthropicApiKeyConfigured()) {
    return new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY ?? "").trim(), maxRetries: 2, timeout: 120_000 });
  }
  throw new Error("No Anthropic credentials for term-sheet analysis (Claude CLI token or ANTHROPIC_API_KEY)");
}

/** Claude CLI subscription token first (the Anthropic path since G25-B), API key second. */
export function isAnthropicConfigured(): boolean {
  if (readCliOAuthToken()) return true;
  if (isAnthropicApiKeyConfigured()) return true;
  return false;
}

// ── Agent Self-Upgrade AI Call ─────────────────────────────────────────
// Background self-improvement work uses ONLY the free / subscription tiers —
// zero marginal cost. The quality tier (ANTHROPIC_API_KEY) is reserved for
// customer-facing work so trial capacity is never spent on crons.
// Priority: Cerebras → Groq → SambaNova → OpenRouter → Claude OAuth.

export async function callAIForUpgrade(opts: AICallOptions): Promise<AICallResult | null> {
  if (opts.attemptBudget || opts.agentId === "svi:research_synthesis" || opts.agentId === "svi:research_grounded_review")
    throw new ResearchAttemptBudgetError("research requires callAI dispatcher");
  // Report requests must use the budgeted dispatcher, never this legacy chain.
  if (scopedReportPolicy(opts)) throw new Error("Report policy requires callAI dispatcher");
  await getDBKeys(); // ensure cache is warm

  // Free and subscription providers only — the paid tiers are for customers.
  // Same throughput-first order as callAI: free high-volume first, Claude OAuth last.
  const freeProviders: Provider[] = [];
  // 1. Cerebras — ultra-fast 2000 t/s, gemma-4-31b most reliable in prod
  if (process.env.CEREBRAS_API_KEY || getDBKey("cerebras")) freeProviders.push("cerebras");
  // 2. Groq — 400 RPM, ~500 t/s; qwen3.6-27b top of Aug 2026 discovery
  if (process.env.GROQ_API_KEY || getDBKey("groq")) freeProviders.push("groq");
  // 3. SambaNova — DeepSeek V3.2/V3.1 free, 294 TPS, strong reasoning
  if (process.env.SAMBANOVA_API_KEY || getDBKey("sambanova")) freeProviders.push("sambanova");
  // 4. OpenRouter — 24+ free models for breadth, but rate-limited per model
  if (process.env.OPENROUTER_API_KEY || getDBKey("openrouter")) freeProviders.push("openrouter");
  // 5. Claude OAuth — subscription Sonnet 5 (last: save rate-limit headroom)
  if (readCliOAuthToken()) freeProviders.push("claude-oauth");
  // NOTE: Gemini EXCLUDED — it costs $0.30-$2.50/1M tokens, NOT free.
  // NOTE: Codex EXCLUDED — refresh tokens keep expiring + paid quota.

  if (freeProviders.length === 0) {
    console.warn("[ai-client] No free/subscription providers available for upgrade task. Skipping.");
    return null;
  }

  // Respect providerCooldown from callAI — if a provider (e.g. Cerebras 402)
  // is dead for the day, skip it here too instead of retrying every request.
  const now = Date.now();
  const eligible = freeProviders.filter((p) => (providerCooldown.get(p) ?? 0) <= now);
  const runList = eligible.length > 0 ? eligible : freeProviders; // last-resort try-all

  for (const provider of runList) {
    try {
      const result = await callProvider(provider, opts);
      // Track cost (should be $0 for subscription/free)
      const estimatedTokens = Math.ceil((opts.system.length + opts.user.length) / 3) * 2;
      trackCost(result.model, estimatedTokens);
      console.log(`[ai-client:upgrade] Success via ${provider} (${result.model})`);
      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const msgLower = errMsg.toLowerCase();
      let cooldownMs: number;
      if (/\b402\b|payment.?required|billing|insufficient.?quota|hard.?limit/.test(msgLower)) {
        cooldownMs = 24 * 60 * 60_000;
      } else if (/rate.?limit|\b429\b|quota|too many requests|overloaded|capacity/.test(msgLower)) {
        cooldownMs = 15 * 60_000;
      } else {
        cooldownMs = 120_000;
      }
      providerCooldown.set(provider, Date.now() + cooldownMs);
      console.warn(`[ai-client:upgrade] ${provider} failed: ${errMsg}. Trying next...`);
    }
  }

  console.warn("[ai-client:upgrade] All free providers failed. Upgrade task skipped.");
  return null;
}

// ── Check if off-peak hours (AEST = UTC+10/11) ───────────────────────
export function isOffPeakHours(): boolean {
  const now = new Date();
  const aestHour = (now.getUTCHours() + 10) % 24; // UTC+10 (AEST, ignoring DST)
  // Off-peak: 10pm (22) to 6am (6) AEST
  return aestHour >= 22 || aestHour < 6;
}

// ── Check if budget allows upgrade tasks ──────────────────────────────
export function canRunUpgradeTasks(): boolean {
  const budget = readBudget();
  // Only run upgrades if budget usage is under 80%
  return budget.totalUSD < MONTHLY_BUDGET_USD * 0.8;
}

// ── Get current AI budget usage ────────────────────────────────────────
export function getAIBudgetStatus(): { month: string; spent: number; limit: number; percent: number; calls: number } {
  const b = readBudget();
  return {
    month: b.month,
    spent: Math.round(b.totalUSD * 100) / 100,
    limit: MONTHLY_BUDGET_USD,
    percent: Math.round((b.totalUSD / MONTHLY_BUDGET_USD) * 100),
    calls: b.calls,
  };
}
