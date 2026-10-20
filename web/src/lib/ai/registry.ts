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

// W1 (pricing v5 §7.2 #3): the probe log is bounded — the last 7 days AND at
// most 5 MB (it had grown to 16 MB / 53k lines of dead-model probes).
export const HEALTH_LOG_MAX_BYTES = 5 * 1024 * 1024;
export const HEALTH_LOG_MAX_AGE_DAYS = 7;

/** Pure: the lines to keep — younger than `maxAgeDays` (by `checked_at`;
 *  unparseable lines are dropped) and, newest first, within `maxBytes`. */
export function compactHealthLogLines(lines: string[], now: number, maxBytes = HEALTH_LOG_MAX_BYTES, maxAgeDays = HEALTH_LOG_MAX_AGE_DAYS): string[] {
  const cutoff = now - maxAgeDays * 24 * 60 * 60_000;
  const young: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const t = Date.parse(String((JSON.parse(line) as { checked_at?: unknown }).checked_at));
      if (Number.isFinite(t) && t >= cutoff) young.push(line);
    } catch { /* malformed line — drop */ }
  }
  const out: string[] = [];
  let bytes = 0;
  for (let i = young.length - 1; i >= 0; i--) {
    const size = Buffer.byteLength(young[i]) + 1;
    if (bytes + size > maxBytes) break;
    bytes += size;
    out.push(young[i]);
  }
  return out.reverse();
}

function firstLineCheckedAt(file: string): number | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const first = buf.subarray(0, n).toString("utf8").split("\n")[0] ?? "";
    const t = Date.parse(String((JSON.parse(first) as { checked_at?: unknown }).checked_at));
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  } finally {
    if (fd !== null) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

/** Rotate the health log in place when it is over the size cap or its oldest
 *  line is past the age cap. Atomic (tmp + rename); fail-open. Returns true
 *  when the file was rewritten. */
export function rotateHealthLog(file: string = HEALTH_LOG_FILE, now: number = Date.now()): boolean {
  try {
    const size = fs.statSync(file).size;
    const oldest = firstLineCheckedAt(file);
    const tooOld = oldest === null || oldest < now - HEALTH_LOG_MAX_AGE_DAYS * 24 * 60 * 60_000;
    if (size <= HEALTH_LOG_MAX_BYTES && !tooOld) return false;
    const kept = compactHealthLogLines(fs.readFileSync(file, "utf8").split("\n"), now);
    atomicWrite(file, kept.length ? kept.join("\n") + "\n" : "");
    return true;
  } catch {
    return false;
  }
}

/** Append a health-check batch to the JSONL log (then rotate it — W1) + refresh current snapshot. */
export function persistHealthResults(results: HealthResult[]): void {
  ensureDir();
  const lines = results.map((r) => JSON.stringify(r)).join("\n") + "\n";
  try { fs.appendFileSync(HEALTH_LOG_FILE, lines); } catch { /* ignore */ }
  rotateHealthLog(HEALTH_LOG_FILE);
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
