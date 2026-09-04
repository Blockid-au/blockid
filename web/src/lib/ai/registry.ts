// Unified AI provider registry — read/write the snapshot published at
// content/ai-provider-registry.json. Both blockid.au (in-process) and
// startupvalueindex.com (over HTTPS via /api/ai/registry) consume this.
//
// Design:
//  - Atomic writes: write to .tmp then rename.
//  - Append-only JSONL log for every health-check run (retained forever).
//  - In-memory cache with 5min TTL for read-hot paths.
//  - Exponential backoff on quota-exceeded: 1h → 2h → 4h → 8h → 24h cap.

import * as fs from "fs";
import * as path from "path";
import type { HealthResult } from "./health-check";

const CONTENT_DIR = "/home/dovanlong/blockid.au/web/content";
export const REGISTRY_FILE = path.join(CONTENT_DIR, "ai-provider-registry.json");
export const HEALTH_SNAPSHOT_FILE = path.join(CONTENT_DIR, "ai-model-health.json");
export const HEALTH_LOG_FILE = path.join(CONTENT_DIR, "ai-model-health.jsonl");
export const CANDIDATES_FILE = path.join(CONTENT_DIR, "ai-model-candidates.json");

export interface RegistryEntry {
  provider: string;
  model: string;
  priority: number;
  healthy: boolean;
  latency_ms: number | null;
  last_checked: string | null;
  http_status?: number;
}

export interface DegradedEntry {
  provider: string;
  model: string;
  degraded_until: string;
  reason: string;
  backoff_ms: number;
  first_degraded_at: string;
}

export interface Registry {
  updated_at: string;
  primary_chain: RegistryEntry[];
  fallback_pool: RegistryEntry[];
  degraded: DegradedEntry[];
  candidates_discovered: { provider: string; model: string; family?: string; discovered_at: string }[];
}

const EMPTY_REGISTRY: Registry = {
  updated_at: new Date(0).toISOString(),
  primary_chain: [],
  fallback_pool: [],
  degraded: [],
  candidates_discovered: [],
};

let cache: { data: Registry; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function ensureDir(): void {
  try { fs.mkdirSync(CONTENT_DIR, { recursive: true }); } catch { /* ignore */ }
}

function atomicWrite(file: string, data: string): void {
  ensureDir();
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

/** Read the registry snapshot (5min in-memory cache). Returns empty on error. */
export function readRegistry(force = false): Registry {
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_TTL_MS) return cache.data;
  try {
    const raw = fs.readFileSync(REGISTRY_FILE, "utf8");
    const data = JSON.parse(raw) as Registry;
    cache = { data, at: now };
    return data;
  } catch {
    return EMPTY_REGISTRY;
  }
}

export function invalidateRegistryCache(): void {
  cache = null;
}

export function writeRegistry(reg: Registry): void {
  atomicWrite(REGISTRY_FILE, JSON.stringify(reg, null, 2));
  cache = { data: reg, at: Date.now() };
}

/** Append a health-check batch to the JSONL log + refresh current snapshot. */
export function persistHealthResults(results: HealthResult[]): void {
  ensureDir();
  const lines = results.map((r) => JSON.stringify(r)).join("\n") + "\n";
  try { fs.appendFileSync(HEALTH_LOG_FILE, lines); } catch { /* ignore */ }
  const snapshot = {
    updated_at: new Date().toISOString(),
    total: results.length,
    healthy: results.filter((r) => r.healthy).length,
    quota_exceeded: results.filter((r) => r.quota_exceeded).length,
    results,
  };
  atomicWrite(HEALTH_SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
}

/** Compute next backoff duration given prior degraded_until (if any).
 *  Doubles on repeat, starts at 1h, caps at 24h. */
export function nextBackoffMs(prior?: DegradedEntry): number {
  const oneHour = 60 * 60 * 1000;
  const cap = 24 * oneHour;
  if (!prior) return oneHour;
  return Math.min(cap, Math.max(oneHour, prior.backoff_ms * 2));
}

/** Remove degraded entries whose window has elapsed. */
export function pruneDegraded(reg: Registry): Registry {
  const nowIso = new Date().toISOString();
  return { ...reg, degraded: reg.degraded.filter((d) => d.degraded_until > nowIso) };
}

/** Identity for a chain entry. */
export function entryKey(e: { provider: string; model: string }): string {
  return `${e.provider}::${e.model}`;
}
