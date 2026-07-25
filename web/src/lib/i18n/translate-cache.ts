/**
 * Disk-backed translation cache (T-1403).
 *
 * Layout: `web/content/i18n/<locale>-cache.json`, a flat JSON object
 * keyed by SHA-256(en) → translated string. Writes are debounced 500ms
 * so a burst of translate() calls collapses to one fs.writeFile.
 *
 * The cache is intentionally simple — no LRU, no size cap. Empirically
 * the entire UI surface has ~5k unique English strings; storing them
 * all is well under 1 MB and eliminates ~all runtime Gemini calls
 * after warm-up.
 *
 * Server-only: this module uses node:fs and MUST NOT be imported from
 * a client component. The API route `/api/i18n/translate` is the sole
 * bridge for client-originated translation requests.
 */

import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Locale } from "./locales";

const CACHE_ROOT = join(process.cwd(), "content", "i18n");

type CacheMap = Record<string, string>;

const memory: Map<Locale, CacheMap> = new Map();
const dirty: Set<Locale> = new Set();
let flushTimer: NodeJS.Timeout | null = null;

export function hashKey(en: string): string {
  return createHash("sha256").update(en).digest("hex").slice(0, 24);
}

function cachePath(locale: Locale): string {
  return join(CACHE_ROOT, `${locale}-cache.json`);
}

async function loadLocale(locale: Locale): Promise<CacheMap> {
  const cached = memory.get(locale);
  if (cached) return cached;
  const path = cachePath(locale);
  if (!existsSync(path)) {
    const empty: CacheMap = {};
    memory.set(locale, empty);
    return empty;
  }
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as CacheMap;
    memory.set(locale, parsed);
    return parsed;
  } catch {
    const empty: CacheMap = {};
    memory.set(locale, empty);
    return empty;
  }
}

export async function cacheGet(
  locale: Locale,
  en: string,
): Promise<string | undefined> {
  const map = await loadLocale(locale);
  return map[hashKey(en)];
}

export async function cacheGetMany(
  locale: Locale,
  ens: string[],
): Promise<Record<string, string>> {
  const map = await loadLocale(locale);
  const out: Record<string, string> = {};
  for (const en of ens) {
    const v = map[hashKey(en)];
    if (typeof v === "string") out[en] = v;
  }
  return out;
}

export async function cacheSet(
  locale: Locale,
  en: string,
  vi: string,
): Promise<void> {
  const map = await loadLocale(locale);
  map[hashKey(en)] = vi;
  dirty.add(locale);
  scheduleFlush();
}

export async function cacheSetMany(
  locale: Locale,
  pairs: Record<string, string>,
): Promise<void> {
  const map = await loadLocale(locale);
  for (const [en, vi] of Object.entries(pairs)) {
    map[hashKey(en)] = vi;
  }
  dirty.add(locale);
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 500);
}

async function flush(): Promise<void> {
  const locales = Array.from(dirty);
  dirty.clear();
  for (const locale of locales) {
    const map = memory.get(locale);
    if (!map) continue;
    const path = cachePath(locale);
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(map, null, 0), "utf8");
    } catch {
      // On write failure, put the locale back in the dirty set so the
      // next scheduleFlush retries. Silent — this is a best-effort
      // persistence layer and translation is still functional via the
      // in-memory map.
      dirty.add(locale);
    }
  }
}
