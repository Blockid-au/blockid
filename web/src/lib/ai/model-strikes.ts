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
// { strikes, last_status, last_at, pruned_at? } }`. Fail-open everywhere: an
// unreadable file means "no strikes", an unwritable one means "no memory".

import * as fs from "fs";
import type { HealthResult } from "./health-check";

export const MODEL_STRIKES_FILE = "/home/dovanlong/blockid.au/web/content/reports/ai-model-strikes.json";
export const DEFAULT_PRUNE_STRIKES = 3;
export const PRUNE_MEMORY_DAYS = 7;

export interface StrikeEntry {
  strikes: number;
  last_status: string;
  last_at: string;
  pruned_at?: string;
}
export type StrikeFile = Record<string, StrikeEntry>;

export function strikeKey(provider: string, model: string): string {
  return `${provider}::${model}`;
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
      next[key] = { strikes: (p?.strikes ?? 0) + 1, last_status: r.status, last_at: at, ...(p?.pruned_at ? { pruned_at: p.pruned_at } : {}) };
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

/** Pure: drop models with ≥ threshold strikes from every provider list and
 *  stamp `pruned_at` on them. Lists are never dropped below their last
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
      if (s && s.strikes >= threshold) {
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

/** Model ids per provider that were pruned within PRUNE_MEMORY_DAYS — the
 *  refresh / discovery crons exclude these so a dead model is not re-added
 *  from the catalogue the next morning. Stale memories are dropped. */
export function recentlyPruned(strikes: StrikeFile, now: Date = new Date()): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  const cutoff = now.getTime() - PRUNE_MEMORY_DAYS * 24 * 60 * 60_000;
  for (const [key, s] of Object.entries(strikes)) {
    if (!s.pruned_at) continue;
    const t = new Date(s.pruned_at).getTime();
    if (Number.isNaN(t) || t < cutoff) continue;
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
    if (!Number.isNaN(t) && t < cutoff) continue;
    out[key] = s;
  }
  return out;
}
