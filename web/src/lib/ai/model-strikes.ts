// S31-A — model registry hygiene: auto-prune dead free models.
//
// The 30-minute ai-health-check pings every model in ai-free-models.json.
// A model that fails N consecutive checks (default 3 = 90 min: OpenRouter
// "No endpoints found" 404s, Groq quota 402s, decommissioned ids, "only
// available on agentic harnesses" 403s) is removed from the active list so
// the dispatcher stops burning a retry + a cooldown on it for every request,
// and is kept OUT of the next daily refresh / on-demand discovery for
// PRUNE_MEMORY_DAYS so the catalogue cannot immediately put it back.
//
// One healthy check resets the strike count; a model pruned earlier that
// starts answering again is simply rediscovered once its memory expires.
//
// State: content/reports/ai-model-strikes.json — `{ "<provider>::<model>":
// { strikes, last_status, last_at, pruned_at?, dead_until?, dead_reason? } }`.
// Fail-open everywhere: an unreadable file means "no strikes", an unwritable
// one means "no memory".
//
// G29-A — dead rungs (2026-09-22). On 2026-09-21 every showcase run walked
// 27 rungs that could never answer: Cerebras `gemma-4-31b` → 404
// `model_archived`, `qwen-3-32b` / `llama-3.3-70b` → 404 `model_not_found`,
// `gpt-oss-120b` → 402 `payment_required`; SambaNova → 402
// `PAYMENT_METHOD_REQUIRED` (balance_units 0) on every model and 404
// `model_not_found` on two more. None of those answers is transient, yet each
// cost a call + a per-model cooldown per parallel call of every run, because
// the strike table only counted health-check probes (3 strikes = 90 min) and
// never touched the curated fallback ladders in ai-client.
//
// A rung that answers 402 / 404 / `model_archived` / `model_not_found` /
// `payment_required` — from a health probe OR a live call — is DEAD for
// DEAD_RUNG_HOURS: `dead_until` is stamped on its entry, the discover /
// refresh / health crons drop it from ai-free-models.json at once, and
// ai-client skips it without spending a call (curated ladders included). One
// healthy answer (probe or live) forgets the entry. A provider whose every
// ladder rung is dead, or that answered 402 at all (an account-level
// signal), is `unfunded` — see providerCapacity() and founder item #9.

import * as fs from "fs";
import type { HealthResult } from "./health-check";

export const MODEL_STRIKES_FILE = "/home/dovanlong/blockid.au/web/content/reports/ai-model-strikes.json";
export const DEFAULT_PRUNE_STRIKES = 3;
export const PRUNE_MEMORY_DAYS = 7;
export const DEAD_RUNG_HOURS = 24;

export type DeadRungReason = "payment_required" | "model_archived" | "model_not_found";

export interface StrikeEntry {
  strikes: number;
  last_status: string;
  last_at: string;
  pruned_at?: string;
  /** G29-A: the rung is dead (skipped everywhere) until this ISO time. */
  dead_until?: string;
  dead_reason?: DeadRungReason;
  /** When the dead verdict was last confirmed (probe or live call). */
  dead_at?: string;
}
export type StrikeFile = Record<string, StrikeEntry>;

export function strikeKey(provider: string, model: string): string {
  return `${provider}::${model}`;
}

// ── G29-A dead rungs ───────────────────────────────────────────────────

/** `HTTP 402: {...}` prefix that ai-client's transport puts on every non-2xx answer. */
const HTTP_PREFIX_RE = /^\s*(?:[A-Za-z]+ )?HTTP (\d{3})\b/;
const PAYMENT_RE = /payment[_ .-]?required|payment_method_required|balance_units"?\s*:\s*0\b|insufficient[_ ]credit/i;
const ARCHIVED_RE = /model_archived|is archived/i;
const NOT_FOUND_RE = /model_not_found|not_found_error|does not exist|no endpoints found|no allowed providers|invalid model|unsupported model|not a valid model/i;

/**
 * Pure: is this answer a dead-rung verdict, and which one? `status` is the
 * HTTP status when the caller has it (health probes do); otherwise it is read
 * from the `HTTP nnn:` prefix of the message. A 429 / 413 / 5xx / timeout is
 * never a dead rung — those are transient and keep their own cooldowns.
 *
 *   402 or payment_required / PAYMENT_METHOD_REQUIRED → payment_required
 *   404 + model_archived                              → model_archived
 *   404, model_not_found, "does not exist"            → model_not_found
 */
export function classifyDeadRung(input: { status?: number | null; message?: string | null }): DeadRungReason | null {
  const message = input.message ?? "";
  let status = typeof input.status === "number" && input.status > 0 ? input.status : null;
  if (status === null) {
    const m = HTTP_PREFIX_RE.exec(message);
    if (m) status = Number(m[1]);
  }
  if (status === 402 || PAYMENT_RE.test(message)) return "payment_required";
  if (ARCHIVED_RE.test(message)) return "model_archived";
  if (status === 404 || NOT_FOUND_RE.test(message)) return "model_not_found";
  return null;
}

/** Epoch ms until which the entry is dead, or null when it is not (or no longer) dead. */
export function deadUntilMs(entry: StrikeEntry | undefined, now: Date = new Date()): number | null {
  if (!entry?.dead_until) return null;
  const t = new Date(entry.dead_until).getTime();
  return Number.isFinite(t) && t > now.getTime() ? t : null;
}

/** Pure: stamp `<provider>::<model>` dead for DEAD_RUNG_HOURS from `now`. */
export function markDeadRung(prior: StrikeFile, provider: string, model: string, reason: DeadRungReason, now: Date = new Date()): StrikeFile {
  const key = strikeKey(provider, model);
  const p = prior[key];
  const at = now.toISOString();
  return {
    ...prior,
    [key]: {
      strikes: (p?.strikes ?? 0) + 1,
      last_status: reason,
      last_at: at,
      ...(p?.pruned_at ? { pruned_at: p.pruned_at } : {}),
      dead_until: new Date(now.getTime() + DEAD_RUNG_HOURS * 60 * 60_000).toISOString(),
      dead_reason: reason,
      dead_at: at,
    },
  };
}

export function isDeadRung(strikes: StrikeFile, provider: string, model: string, now: Date = new Date()): boolean {
  return deadUntilMs(strikes[strikeKey(provider, model)], now) !== null;
}

/** provider → model ids that are dead right now. */
export function deadRungs(strikes: StrikeFile, now: Date = new Date()): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const [key, s] of Object.entries(strikes)) {
    if (deadUntilMs(s, now) === null) continue;
    const idx = key.indexOf("::");
    if (idx < 0) continue;
    (out[key.slice(0, idx)] ??= new Set()).add(key.slice(idx + 2));
  }
  return out;
}

export type ProviderCapacityState = "ok" | "degraded" | "unfunded";

export interface ProviderCapacity {
  state: ProviderCapacityState;
  /** Ladder rungs that are dead right now. */
  dead: string[];
  /** Ladder length the verdict was computed against. */
  total: number;
  /** Why the provider is unfunded (absent when it is not). */
  reason?: "payment_required" | "all_rungs_dead";
  /** When the last dead verdict lapses (the provider is retried once after it). */
  until: string | null;
}

/**
 * Pure: capacity verdict per provider from the strike table + the ladder each
 * provider would dial. `unfunded` when every ladder rung is dead, or when ANY
 * rung of the provider answered 402 (account-level: SambaNova's
 * PAYMENT_METHOD_REQUIRED and Cerebras's payment_required are about the
 * account, not the model). `degraded` when some rungs are dead. Providers
 * with an empty ladder are omitted.
 */
export function providerCapacity(
  strikes: StrikeFile,
  ladders: Record<string, readonly string[]>,
  now: Date = new Date(),
): Record<string, ProviderCapacity> {
  const dead = deadRungs(strikes, now);
  const paymentUntil: Record<string, number> = {};
  for (const [key, s] of Object.entries(strikes)) {
    const until = deadUntilMs(s, now);
    if (until === null || s.dead_reason !== "payment_required") continue;
    const idx = key.indexOf("::");
    if (idx < 0) continue;
    const provider = key.slice(0, idx);
    paymentUntil[provider] = Math.max(paymentUntil[provider] ?? 0, until);
  }
  const iso = (t: number) => (t > 0 ? new Date(t).toISOString() : null);
  const out: Record<string, ProviderCapacity> = {};
  for (const [provider, ladder] of Object.entries(ladders)) {
    if (!Array.isArray(ladder) || ladder.length === 0) continue;
    const deadHere = ladder.filter((m) => dead[provider]?.has(m));
    let until = 0;
    for (const m of deadHere) until = Math.max(until, deadUntilMs(strikes[strikeKey(provider, m)], now) ?? 0);
    if (paymentUntil[provider]) {
      out[provider] = { state: "unfunded", dead: deadHere, total: ladder.length, reason: "payment_required", until: iso(Math.max(until, paymentUntil[provider])) };
    } else if (deadHere.length === ladder.length) {
      out[provider] = { state: "unfunded", dead: deadHere, total: ladder.length, reason: "all_rungs_dead", until: iso(until) };
    } else if (deadHere.length > 0) {
      out[provider] = { state: "degraded", dead: deadHere, total: ladder.length, until: iso(until) };
    } else {
      out[provider] = { state: "ok", dead: [], total: ladder.length, until: null };
    }
  }
  return out;
}

export function unfundedProviders(capacity: Record<string, ProviderCapacity>): string[] {
  return Object.entries(capacity).filter(([, c]) => c.state === "unfunded").map(([p]) => p).sort();
}

export function pruneThreshold(): number {
  const n = Number(process.env.AI_MODEL_PRUNE_STRIKES ?? DEFAULT_PRUNE_STRIKES);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_PRUNE_STRIKES;
}

export function readStrikes(file: string = MODEL_STRIKES_FILE): StrikeFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as StrikeFile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeStrikes(data: StrikeFile, file: string = MODEL_STRIKES_FILE): void {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {
    /* fail-open */
  }
}

/** A health result that counts as a strike: anything but healthy. A timeout
 *  counts too — three consecutive 5-second timeouts is not a usable model. */
export function isStrike(r: Pick<HealthResult, "healthy">): boolean {
  return !r.healthy;
}

/** Pure: fold one health-check batch into the strike table. Exported for tests. */
export function applyHealthResults(prior: StrikeFile, results: HealthResult[], now: Date = new Date()): StrikeFile {
  const next: StrikeFile = { ...prior };
  const at = now.toISOString();
  for (const r of results) {
    const key = strikeKey(r.provider, r.model);
    if (isStrike(r)) {
      const p = next[key];
      // G29-A: a 402 / 404 / archived / not-found probe is a dead rung at once;
      // a different failure inside a live dead window keeps the stamp.
      const reason = classifyDeadRung({ status: r.http_status, message: r.error });
      if (reason) {
        next[key] = markDeadRung(next, r.provider, r.model, reason, now)[key];
        continue;
      }
      next[key] = {
        strikes: (p?.strikes ?? 0) + 1,
        last_status: r.status,
        last_at: at,
        ...(p?.pruned_at ? { pruned_at: p.pruned_at } : {}),
        ...(p && deadUntilMs(p, now) !== null ? { dead_until: p.dead_until, dead_reason: p.dead_reason, dead_at: p.dead_at } : {}),
      };
    } else if (next[key]) {
      // Recovered — forget it entirely so it can be re-listed at once.
      delete next[key];
    }
  }
  return next;
}

export interface PruneOutcome {
  /** ai-free-models.json content after pruning (same object shape). */
  config: Record<string, unknown>;
  /** provider → removed model ids */
  removed: Record<string, string[]>;
  strikes: StrikeFile;
}

/** Pure: drop models with ≥ threshold strikes — or a live `dead_until`
 *  (G29-A) — from every provider list and stamp `pruned_at` on them. Lists are never dropped below their last
 *  survivor unless every model is dead (then the list empties and
 *  ai-client falls back to its curated defaults + the next injection). */
export function pruneDeadModels(
  config: Record<string, unknown>,
  strikes: StrikeFile,
  threshold: number = pruneThreshold(),
  now: Date = new Date(),
): PruneOutcome {
  const out: Record<string, unknown> = { ...config };
  const removed: Record<string, string[]> = {};
  const nextStrikes: StrikeFile = { ...strikes };
  for (const [provider, value] of Object.entries(config)) {
    if (!Array.isArray(value)) continue;
    const keep: string[] = [];
    for (const model of value as unknown[]) {
      if (typeof model !== "string") continue;
      const key = strikeKey(provider, model);
      const s = nextStrikes[key];
      if (s && (s.strikes >= threshold || deadUntilMs(s, now) !== null)) {
        (removed[provider] ??= []).push(model);
        nextStrikes[key] = { ...s, pruned_at: s.pruned_at ?? now.toISOString() };
      } else {
        keep.push(model);
      }
    }
    out[provider] = keep;
  }
  return { config: out, removed, strikes: nextStrikes };
}

/** Model ids per provider that were pruned within PRUNE_MEMORY_DAYS, plus
 *  every rung that is dead right now (G29-A) — the refresh / discovery crons
 *  exclude these so a dead model is not re-added from the catalogue the next
 *  morning. Stale memories are dropped. */
export function recentlyPruned(strikes: StrikeFile, now: Date = new Date()): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  const cutoff = now.getTime() - PRUNE_MEMORY_DAYS * 24 * 60 * 60_000;
  for (const [key, s] of Object.entries(strikes)) {
    const dead = deadUntilMs(s, now) !== null;
    if (!s.pruned_at && !dead) continue;
    const t = s.pruned_at ? new Date(s.pruned_at).getTime() : NaN;
    if (!dead && (Number.isNaN(t) || t < cutoff)) continue;
    const idx = key.indexOf("::");
    if (idx < 0) continue;
    const provider = key.slice(0, idx);
    (out[provider] ??= new Set()).add(key.slice(idx + 2));
  }
  return out;
}

/** Drop entries whose memory has expired so the file cannot grow forever. */
export function compactStrikes(strikes: StrikeFile, now: Date = new Date()): StrikeFile {
  const cutoff = now.getTime() - PRUNE_MEMORY_DAYS * 24 * 60 * 60_000;
  const out: StrikeFile = {};
  for (const [key, s] of Object.entries(strikes)) {
    const t = new Date(s.pruned_at ?? s.last_at).getTime();
    if (!Number.isNaN(t) && t < cutoff && deadUntilMs(s, now) === null) continue;
    out[key] = s;
  }
  return out;
}
