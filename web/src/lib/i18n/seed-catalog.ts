/**
 * Seed catalog builder (T-1403).
 *
 * Turns the hand-authored EN/VI JSON catalog pair into a flat
 * `Record<EN string, VI string>` map that the client-side
 * TranslationProvider consumes to pre-swap common strings before the
 * first `/api/i18n/translate` batch resolves — avoids the flash of
 * untranslated content on nav/hero/pricing.
 *
 * Only strings present in BOTH catalogs (same key on both sides) are
 * emitted; anything else falls to runtime MT.
 */

import type { Locale } from "./locales";
import { DEFAULT_LOCALE } from "./locales";
import en from "./messages/en.json";
import vi from "./messages/vi.json";

type Messages = Record<string, string>;

const CATALOGS: Readonly<Record<Locale, Messages>> = {
  en: en as Messages,
  vi: vi as Messages,
};

/**
 * Build a seed map for the given target locale, keyed by the EN value
 * (what the DOM walker actually sees), pointing at the localised
 * value. Empty on EN (no swap needed).
 */
export function buildSeedCatalog(target: Locale): Record<string, string> {
  if (target === DEFAULT_LOCALE) return {};
  const enMap = CATALOGS.en;
  const targetMap = CATALOGS[target] ?? {};
  const out: Record<string, string> = {};
  for (const key of Object.keys(enMap)) {
    const enVal = enMap[key];
    const targetVal = targetMap[key];
    if (typeof enVal !== "string" || typeof targetVal !== "string") continue;
    if (enVal.length === 0 || targetVal.length === 0) continue;
    if (enVal === targetVal) continue;
    out[enVal] = targetVal;
  }
  return out;
}
