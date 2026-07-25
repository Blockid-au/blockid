/**
 * In-memory counters for translation traffic (T-1403.10).
 *
 * Deliberately process-local — the numbers reset on every deploy. They
 * exist to answer "is Gemini being hit at all?" and "what's the cache
 * hit rate right now?" without needing a metrics infrastructure.
 *
 * Read via GET /api/i18n/stats (admin-guarded).
 */

import "server-only";
import type { Locale } from "./locales";

interface LocaleCounters {
  requests: number;
  strings_requested: number;
  cache_hits: number;
  cache_misses: number;
  gemini_calls: number;
  gemini_success_strings: number;
  gemini_failures: number;
  drift_rejects: number;
  last_at: string | null;
}

const COUNTERS: Record<Locale, LocaleCounters> = {
  en: fresh(),
  vi: fresh(),
};

function fresh(): LocaleCounters {
  return {
    requests: 0,
    strings_requested: 0,
    cache_hits: 0,
    cache_misses: 0,
    gemini_calls: 0,
    gemini_success_strings: 0,
    gemini_failures: 0,
    drift_rejects: 0,
    last_at: null,
  };
}

export function statsBucket(locale: Locale): LocaleCounters {
  return COUNTERS[locale] ?? (COUNTERS[locale] = fresh());
}

export function recordRequest(locale: Locale, strings: number): void {
  const b = statsBucket(locale);
  b.requests += 1;
  b.strings_requested += strings;
  b.last_at = new Date().toISOString();
}

export function recordHits(locale: Locale, hits: number, misses: number): void {
  const b = statsBucket(locale);
  b.cache_hits += hits;
  b.cache_misses += misses;
}

export function recordGeminiCall(
  locale: Locale,
  successStrings: number,
  ok: boolean,
): void {
  const b = statsBucket(locale);
  b.gemini_calls += 1;
  if (ok) b.gemini_success_strings += successStrings;
  else b.gemini_failures += 1;
}

export function recordDriftReject(locale: Locale): void {
  statsBucket(locale).drift_rejects += 1;
}

export function snapshotStats(): Record<Locale, LocaleCounters> {
  return {
    en: { ...COUNTERS.en },
    vi: { ...COUNTERS.vi },
  };
}
